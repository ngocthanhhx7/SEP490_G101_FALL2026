import { createHash } from 'node:crypto';
import { expect, test } from '@jest/globals';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';

const CUSTOMER = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: Date.parse('2026-11-01T00:00:00Z') };
const STAFF = { ...CUSTOMER, userId: 'staff-1', roles: ['STAFF'] };
const ADMIN = { ...CUSTOMER, userId: 'admin-1', roles: ['ADMIN'] };
const SITTER = { ...CUSTOMER, userId: 'sitter-1', roles: ['PET_SITTER'] };
const visitId = 'visit-1', bookingId = 'booking-1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function setup() {
  const data = { now: new Date('2026-10-17T00:00:00Z'), records: [], events: [], commands: new Map() };
  const booking = { id: bookingId, customerId: CUSTOMER.userId, version: 4 };
  const visit = { id: visitId, bookingId, sitterId: SITTER.userId, state: 'COMPLETED',
    completedAt: new Date('2026-10-10T00:00:00Z'), version: 1 };
  const find = id => data.records.find(record => record.id === id);
  const tx = {
    getBooking: async () => booking, getVisit: async () => visit, getVisits: async () => [visit],
    getPhone: async () => null, getCustomerName: async () => 'Synthetic customer',
    bookingComplaints: async () => data.records, guardBooking: async record => record,
    getComplaint: async id => find(id), assertEvidence: async () => {}, changeHold: async () => {},
    createComplaint: async record => { data.records.push(record); return record; },
    updateComplaint: async ({ complaintId, expectedVersion, changes }) => {
      const record = find(complaintId);
      Object.assign(record, changes, { version: expectedVersion + 1 });
      return record;
    },
    getIdempotencyResult: async identity => data.commands.get(JSON.stringify(identity)),
    saveIdempotencyResult: async ({ identity, payloadHash, result }) =>
      data.commands.set(JSON.stringify(identity), { payloadHash, result }),
    recordEvent: async event => data.events.push(event.event)
  };
  const repository = { run: async work => work(tx), listComplaints: async () => ({ items: data.records, nextCursor: null }) };
  return { data, service: createComplaintService({ repository, clock: () => data.now }) };
}

const submitInput = { actor: CUSTOMER, visitId, expectedVersion: 1,
  idempotencyKey: 'submit-complaint', description: 'Synthetic content' };
const input = (actor, complaintId, expectedVersion, idempotencyKey) => ({ actor, complaintId, expectedVersion, idempotencyKey });

test('UC-52 accepts exactly seven days and rejects a millisecond later, invalid versions and long text', async () => {
  const { data, service } = setup();
  await expect(service.submit({ ...submitInput, description: ' '.repeat(10) }))
    .rejects.toMatchObject({ status: 422, details: { messageCode: 'MSG01' } });
  await expect(service.submit({ ...submitInput, description: 'a'.repeat(1001) })).rejects.toMatchObject({ status: 422 });
  await expect(service.submit({ ...submitInput, expectedVersion: 0 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  const result = await service.submit(submitInput);
  expect(result).toMatchObject({ messageCode: 'MSG128', state: 'OPEN' });
  data.now = new Date(+data.now + 1);
  await expect(service.submit(submitInput)).resolves.toEqual(result);
  await expect(service.submit({ ...submitInput, description: 'Changed' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(service.submit({ ...submitInput, idempotencyKey: 'another-complaint' }))
    .rejects.toMatchObject({ code: 'COMPLAINT_WINDOW_EXPIRED', details: { messageCode: 'MSG41' } });
  expect(data.events).toEqual(['ComplaintOpened']);
});

test('UC-53 objection requires a reason, escalates once, and only Admin can make the final decision', async () => {
  const { service, data } = setup();
  const { complaintId } = await service.submit(submitInput);
  const staff = input(STAFF, complaintId, 0, 'staff-resolve');
  await expect(service.resolve({ ...staff, customerResult: 'Synthetic result' })).rejects.toMatchObject({
    status: 422, details: { messageCode: 'MSG01', fieldErrors: { handlingNotes: expect.any(String) } }
  });
  const resolved = await service.resolve({ ...staff, customerResult: 'Synthetic result', handlingNotes: 'Internal notes' });
  expect(resolved).toMatchObject({ messageCode: 'MSG131', state: 'RESOLVED' });
  const objection = input(CUSTOMER, complaintId, 1, 'customer-object');
  await expect(service.object(objection)).rejects.toMatchObject({ details: { messageCode: 'MSG01' } });
  const disputed = await service.object({ ...objection, reason: 'Synthetic concern' });
  expect(disputed).toMatchObject({ messageCode: 'MSG129', state: 'ESCALATED' });
  await expect(service.object({ ...objection, reason: 'Synthetic concern' })).resolves.toEqual(disputed);
  await expect(service.object({ ...objection, expectedVersion: 2, idempotencyKey: 'object-again', reason: 'Again' }))
    .rejects.toMatchObject({ code: 'OBJECTION_ALREADY_USED' });
  const final = { complaintId, expectedVersion: 2, idempotencyKey: 'decision-final', customerResult: 'Synthetic final result' };
  await expect(service.decide({ ...final, actor: STAFF })).rejects.toMatchObject({ status: 403 });
  expect(await service.decide({ ...final, actor: ADMIN })).toMatchObject({
    state: 'RESOLVED', complaint: { isFinal: true, finalAt: data.now.toISOString() }
  });
  const customerView = await service.get({ actor: CUSTOMER, complaintId });
  expect(customerView).not.toHaveProperty('handlingNotes');
  expect(customerView).not.toHaveProperty('objectionReason');
  expect(customerView).toMatchObject({ objection: { allowed: false }, customerResult: 'Synthetic final result' });
});

test('UC-52 reads old cases and replays a committed visit command using its original idempotency fingerprint', async () => {
  const { data, service } = setup();
  const identity = { actorRef: CUSTOMER.userId, resourceRef: visitId, operation: 'COMPLAINT_SUBMIT', key: submitInput.idempotencyKey };
  const complaint = { category: 'OTHER', summary: 'Legacy case', description: submitInput.description, evidenceRefs: [], requestedOutcome: null };
  const result = { complaintId: 'legacy-complaint', state: 'OPEN' };
  data.commands.set(JSON.stringify(identity), {
    payloadHash: hash({ visitId, expectedVersion: 1, complaint }), result
  });
  await expect(service.submit({ ...submitInput, summary: 'Legacy case' })).resolves.toEqual(result);
  await expect(service.submit({ ...submitInput, summary: 'Different case' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect(data.events).toEqual([]);

  data.records.push({ id: result.complaintId, bookingId, visitId, kind: 'COMPLAINT', version: 1,
    state: 'UNDER_REVIEW', sitterId: SITTER.userId, latestObjection: { reason: 'Legacy objection' }, objectionCount: 1 });
  expect(await service.get({ actor: ADMIN, complaintId: result.complaintId })).toMatchObject({
    scope: 'VISIT', state: 'ESCALATED', objectionReason: 'Legacy objection'
  });
  const sitter = await service.get({ actor: SITTER, complaintId: result.complaintId });
  expect(sitter).toMatchObject({ state: 'UNDER_REVIEW', visitId });
  expect(sitter).not.toHaveProperty('objectionReason');
  await expect(service.get({ actor: { ...SITTER, userId: 'different-sitter' }, complaintId: result.complaintId }))
    .rejects.toMatchObject({ status: 404 });
});
