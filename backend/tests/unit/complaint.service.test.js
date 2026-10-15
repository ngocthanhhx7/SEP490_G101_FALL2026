import { expect, jest, test } from '@jest/globals';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';

const CUSTOMER = 'customer-1'; const SITTER = 'sitter-1'; const STAFF = 'staff-1'; const ADMIN = 'admin-1'; const VISIT = 'visit-1'; const CASE = 'case-1';
const completion = Date.parse('2026-10-10T00:00:00.000Z');
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: Date.parse('2026-10-30T00:00:00.000Z') });

function setup({ state = 'COMPLETED', complaint = null, now = '2026-10-15T00:00:00.000Z' } = {}) {
  const data = { now: new Date(now), visit: { id: VISIT, customerId: CUSTOMER, sitterId: SITTER, bookingId: 'booking-1', serviceName: 'Dắt chó', state, version: 4, completedAt: new Date(completion).toISOString() }, complaint, operations: new Map(), audit: [], holds: [] };
  const tx = {
    getVisit: async () => data.visit,
    findOpenComplaint: async () => data.complaint && ['OPEN', 'UNDER_REVIEW'].includes(data.complaint.state) ? data.complaint : null,
    createComplaint: async record => { data.complaint = { ...record, id: CASE }; return data.complaint; },
    getComplaint: async () => data.complaint,
    reviewComplaint: async ({ resolution }) => { data.complaint = { ...data.complaint, ...resolution, version: data.complaint.version + 1 }; return data.complaint; },
    resolveComplaint: async ({ resolution }) => { data.complaint = { ...data.complaint, ...resolution, version: data.complaint.version + 1 }; return data.complaint; },
    objectComplaint: async ({ objection }) => { data.complaint = { ...data.complaint, ...objection, version: data.complaint.version + 1 }; return data.complaint; },
    decideComplaint: async ({ decision }) => { data.complaint = { ...data.complaint, ...decision, version: data.complaint.version + 1 }; return data.complaint; },
    getIdempotencyResult: async identity => data.operations.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => data.operations.set(identity.key, { payloadHash, result }),
    appendAuditAndOutbox: jest.fn(async item => data.audit.push(item)),
    holdSettlement: jest.fn(async item => data.holds.push(item)),
    releaseSettlementHold: jest.fn(async item => data.holds.push({ ...item, released: true }))
  };
  let lock = Promise.resolve();
  const run = (_actor, _id, work) => {
    const current = lock.then(() => work(tx));
    lock = current.then(() => undefined, () => undefined);
    return current;
  };
  return { data, tx, repository: { runForVisitActor: run, runForCase: run,
    listComplaints: async () => ({ items: data.complaint ? [data.complaint] : [], nextCursor: null }) } };
}

test('submits a complaint inside the seven-day server window with private evidence IDs', async () => {
  const { data, repository, tx } = setup(); const service = createComplaintService({ repository, clock: () => data.now });
  const result = await service.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, expectedVersion: 4,
    idempotencyKey: 'complaint-key-1', category: 'PET_SAFETY', summary: 'Cần xác minh', description: 'Mô tả bối cảnh',
    evidenceRefs: ['media-1'] });
  expect(result).toMatchObject({ complaintId: CASE, state: 'OPEN', complaint: { category: 'PET_SAFETY', visitId: VISIT } });
  expect(result.complaint.evidenceRefs).toEqual([{ mediaId: 'media-1', kind: 'COMPLAINT', caption: null, recordedAt: null }]);
  expect(result.complaint).not.toHaveProperty('customerId');
  expect(tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'ComplaintOpened' }));
  expect(await service.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, expectedVersion: 4,
    idempotencyKey: 'complaint-key-1', category: 'PET_SAFETY', summary: 'Cần xác minh', description: 'Mô tả bối cảnh', evidenceRefs: ['media-1'] })).toEqual(result);
  expect(data.complaint.state).toBe('OPEN');
});

test('enforces deadline, ownership and one open complaint', async () => {
  const late = setup({ now: '2026-10-17T00:00:01.000Z' }); const lateService = createComplaintService({ repository: late.repository, clock: () => late.data.now });
  await expect(lateService.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-2', summary: 'Muộn', description: 'Nội dung' })).rejects.toMatchObject({ code: 'COMPLAINT_WINDOW_EXPIRED' });
  const existing = setup({ complaint: { id: CASE, kind: 'COMPLAINT', visitId: VISIT, state: 'OPEN', version: 0 } }); const existingService = createComplaintService({ repository: existing.repository, clock: () => existing.data.now });
  await expect(existingService.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-3', summary: 'Trùng', description: 'Nội dung' })).rejects.toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
  await expect(existingService.submit({ actor: actor('other', ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-4', summary: 'Sai', description: 'Nội dung' })).rejects.toMatchObject({ status: 404 });
});

test('allows the exact seven-day boundary and serializes concurrent duplicate submissions', async () => {
  const boundary = setup({ now: '2026-10-17T00:00:00.000Z' }); const service = createComplaintService({ repository: boundary.repository, clock: () => boundary.data.now });
  await expect(service.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-12', summary: 'Đúng hạn', description: 'Nội dung' })).resolves.toMatchObject({ state: 'OPEN' });
  const concurrent = setup(); const concurrentService = createComplaintService({ repository: concurrent.repository, clock: () => concurrent.data.now });
  const requests = [
    concurrentService.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-13', summary: 'A', description: 'Nội dung A' }),
    concurrentService.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-14', summary: 'B', description: 'Nội dung B' })
  ];
  const results = await Promise.allSettled(requests);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
  expect(concurrent.data.audit).toHaveLength(1);
});

test('Staff review and resolve, one Customer objection, then Admin final decision', async () => {
  const setupData = setup(); const service = createComplaintService({ repository: setupData.repository, clock: () => setupData.data.now });
  await service.submit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'complaint-key-5', summary: 'Theo dõi', description: 'Nội dung' });
  expect((await service.review({ actor: actor(STAFF, ['STAFF']), complaintId: CASE, expectedVersion: 0, idempotencyKey: 'complaint-key-6', summary: 'Đã tiếp nhận' })).state).toBe('UNDER_REVIEW');
  expect((await service.resolve({ actor: actor(STAFF, ['STAFF']), complaintId: CASE, expectedVersion: 1, idempotencyKey: 'complaint-key-7', summary: 'Đã xử lý', financialHold: true })).state).toBe('RESOLVED');
  expect(setupData.data.holds).toHaveLength(1);
  expect((await service.object({ actor: actor(CUSTOMER, ['CUSTOMER']), complaintId: CASE, expectedVersion: 2, idempotencyKey: 'complaint-key-8', reason: 'Tôi chưa đồng ý' })).state).toBe('UNDER_REVIEW');
  await expect(service.object({ actor: actor(CUSTOMER, ['CUSTOMER']), complaintId: CASE, expectedVersion: 3, idempotencyKey: 'complaint-key-9', reason: 'Lần hai' })).rejects.toMatchObject({ code: 'OBJECTION_ALREADY_USED' });
  expect((await service.decide({ actor: actor(ADMIN, ['ADMIN']), complaintId: CASE, expectedVersion: 3, idempotencyKey: 'complaint-key-10', summary: 'Quyết định cuối', financialHold: false })).state).toBe('CLOSED');
  expect(setupData.data.holds.at(-1)).toMatchObject({ released: true });
});

test('requires Admin for final close and hides Staff notes from Customer projection', async () => {
  const setupData = setup({ complaint: { id: CASE, kind: 'COMPLAINT', visitId: VISIT, customerId: CUSTOMER, state: 'RESOLVED', version: 2, summary: 'Đã xử lý', description: 'Nội dung', privateStaffNotes: 'Nội bộ', objectionCount: 0 } });
  const service = createComplaintService({ repository: setupData.repository, clock: () => setupData.data.now });
  await expect(service.decide({ actor: actor(STAFF, ['STAFF']), complaintId: CASE, expectedVersion: 2, idempotencyKey: 'complaint-key-11', summary: 'Không được' })).rejects.toMatchObject({ status: 403 });
  const customer = await service.get({ actor: actor(CUSTOMER, ['CUSTOMER']), complaintId: CASE });
  expect(customer).not.toHaveProperty('staffNotes');
});

test('allows the assigned Sitter to read related complaints and excludes Staff notes', async () => {
  const setupData = setup({ complaint: { id: CASE, kind: 'COMPLAINT', visitId: VISIT, customerId: CUSTOMER, sitterId: SITTER,
    state: 'UNDER_REVIEW', version: 1, category: 'PET_SAFETY', summary: 'Theo dõi', description: 'Bối cảnh',
    evidenceRefs: [{ mediaId: 'media-1' }], privateStaffNotes: 'Chỉ Staff', objectionCount: 0 } });
  const service = createComplaintService({ repository: setupData.repository, clock: () => setupData.data.now });
  const sitter = await service.get({ actor: actor(SITTER, ['PET_SITTER']), complaintId: CASE });
  expect(sitter).toMatchObject({ id: CASE, visitId: VISIT, state: 'UNDER_REVIEW', evidenceRefs: [{ mediaId: 'media-1' }] });
  expect(sitter).not.toHaveProperty('staffNotes');
  expect(sitter).not.toHaveProperty('settlement');
  expect(sitter).not.toHaveProperty('objection');
  const list = await service.list({ actor: actor(SITTER, ['PET_SITTER']) });
  expect(list.items).toHaveLength(1);
  expect(list.items[0]).not.toHaveProperty('staffNotes');
  setupData.data.complaint.sitterId = 'other-sitter';
  await expect(service.get({ actor: actor(SITTER, ['PET_SITTER']), complaintId: CASE })).rejects.toMatchObject({ status: 404 });
  await expect(service.get({ actor: actor('other-sitter', ['PET_SITTER']), complaintId: CASE })).rejects.toMatchObject({ status: 404 });
});
