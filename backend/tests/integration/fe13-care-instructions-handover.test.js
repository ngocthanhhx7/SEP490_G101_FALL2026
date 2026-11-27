import { describe, expect, jest, test } from '@jest/globals';
import { createCareInstructionsService } from '../../src/services/care/care-instructions.service.js';
import { createHandoverService } from '../../src/services/care/handover.service.js';

const CUSTOMER = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CURRENT = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REPLACEMENT = 'cccccccccccccccccccccccc';
const VISIT = 'dddddddddddddddddddddddd';
const NOW = new Date('2026-10-15T00:00:00.000Z');
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: 4102444800000 });

function fixture({ startAt = '2026-10-15T04:00:00.000Z', handoverRequired = false } = {}) {
  const state = {
    visit: { id: VISIT, customerId: CUSTOMER, sitterId: CURRENT, state: 'ASSIGNED', version: 7,
      startAt, endAt: '2026-10-15T05:00:00.000Z', handoverRequired },
    care: { version: 1, instructions: { feeding: 'Feed twice daily', medication: 'None', handling: 'Gentle' },
      updatedAt: '2026-10-14T00:00:00.000Z', requiresAcknowledgement: false, acknowledgements: [] },
    history: [], handover: null, idempotency: new Map(), audit: jest.fn()
  };
  const tx = {
    getVisit: async () => state.visit,
    getCareInstructions: async () => state.care,
    listCareInstructionHistory: async () => state.history,
    saveCareInstructions: async ({ version, instructions, actorId, reason, requiresAcknowledgement, updatedAt }) => {
      state.history.push({ version: state.care.version, instructions: state.care.instructions, actorId: 'old', updatedAt: state.care.updatedAt });
      state.care = { version, instructions, actorId, reason, requiresAcknowledgement, updatedAt, acknowledgements: [] };
      return { visitId: VISIT, version, instructions, requiresAcknowledgement, updatedAt };
    },
    getOfferForSitter: async ({ sitterId }) => sitterId === REPLACEMENT
      ? { sitterId, state: 'PENDING', deadline: '2026-10-15T06:00:00.000Z' } : null,
    recordCareInstructionAcknowledgement: async ({ sitterId, version, acknowledgedAt }) => {
      state.care.acknowledgements.push({ sitterId, version, acknowledgedAt });
      return { visitId: VISIT, sitterId, version, acknowledged: true, acknowledgedAt };
    },
    getAccessNotesSnapshot: async () => ({ privateAccessNotes: 'Gate code' }),
    getIdempotencyResult: async identity => state.idempotency.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => state.idempotency.set(identity.key, { payloadHash, result }),
    getHandover: async () => state.handover,
    getReplacementAssignment: async ({ sitterId }) => sitterId === REPLACEMENT ? { sitterId, state: 'ASSIGNED' } : null,
    confirmHandover: async ({ replacementSitterId, instructionVersion, confirmedAt }) => {
      state.handover = { visitId: VISIT, state: 'CONFIRMED', replacementSitterId, instructionVersion, confirmedAt, accessGranted: true };
      state.visit = { ...state.visit, sitterId: replacementSitterId, version: state.visit.version + 1,
        handoverRequired: false, handoverAccepted: true };
      return { ...state.handover, version: state.visit.version };
    },
    appendAuditAndOutbox: state.audit
  };
  const repository = { runForVisitActor: async (_actor, _visitId, work) => work(tx) };
  return { state, care: createCareInstructionsService({ repository, clock: () => NOW }), handover: createHandoverService({ repository, clock: () => NOW }) };
}

describe('FE-13 Care Instructions and Handover integration contracts', () => {
  test('IT-FE13-UC40-02: Customer update creates a new instruction version', async () => {
    const { care, state } = fixture();
    const result = await care.updateInstructions({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
      expectedVersion: 1, idempotencyKey: 'care-update-1', instructions: { feeding: 'Feed three times', medication: 'None' } });
    expect(result).toMatchObject({ visitId: VISIT, version: 2, requiresAcknowledgement: true });
    expect(state.history).toHaveLength(1);
  });

  test('IT-FE13-UC40-06: update at the two-hour cutoff is accepted', async () => {
    const { care } = fixture({ startAt: '2026-10-15T02:00:00.000Z' });
    await expect(care.updateInstructions({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
      expectedVersion: 1, idempotencyKey: 'care-cutoff-1', instructions: { summary: 'On time' } }))
      .resolves.toMatchObject({ version: 2 });
  });

  test('IT-FE13-UC40-07: update after the two-hour cutoff is rejected', async () => {
    const { care } = fixture({ startAt: '2026-10-15T01:59:59.999Z' });
    await expect(care.updateInstructions({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
      expectedVersion: 1, idempotencyKey: 'care-late-1', instructions: { summary: 'Too late' } }))
      .rejects.toMatchObject({ status: 409, code: 'DEADLINE_PASSED' });
  });

  test('IT-FE13-UC40-11: assigned Pet Sitter reads the confirmed instructions', async () => {
    const { care } = fixture();
    await expect(care.getInstructions({ actor: actor(CURRENT, ['PET_SITTER']), visitId: VISIT }))
      .resolves.toMatchObject({ visitId: VISIT, version: 1, instructions: { feeding: 'Feed twice daily' } });
  });

  test('IT-FE13-UC41-03: replacement sitter can read the handover instructions', async () => {
    const { care } = fixture({ handoverRequired: true });
    await expect(care.getInstructions({ actor: actor(REPLACEMENT, ['PET_SITTER']), visitId: VISIT }))
      .resolves.toMatchObject({ visitId: VISIT, version: 1, acknowledged: false });
  });

  test('IT-FE13-UC41-05: handover confirmation requires instruction acknowledgement', async () => {
    const { handover } = fixture();
    await expect(handover.confirm({ actor: actor(CURRENT, ['STAFF']), visitId: VISIT,
      replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 1, idempotencyKey: 'handover-no-ack' }))
      .rejects.toMatchObject({ status: 409, code: 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED' });
  });

  test('IT-FE13-UC41-06: acknowledged replacement confirms handover successfully', async () => {
    const { care, handover, state } = fixture();
    await care.acknowledgeInstructions({ actor: actor(REPLACEMENT, ['PET_SITTER']), visitId: VISIT,
      instructionVersion: 1, idempotencyKey: 'replacement-ack' });
    await expect(handover.confirm({ actor: actor(CURRENT, ['STAFF']), visitId: VISIT,
      replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 1, idempotencyKey: 'handover-confirm' }))
      .resolves.toMatchObject({ state: 'CONFIRMED', replacementSitterId: REPLACEMENT, accessGranted: true });
    expect(state.visit).toMatchObject({ sitterId: REPLACEMENT, handoverAccepted: true });
  });

  test('IT-FE13-UC41-10: non-authorized sitter cannot confirm handover', async () => {
    const { handover } = fixture();
    await expect(handover.confirm({ actor: actor('eeeeeeeeeeeeeeeeeeeeeeee', ['PET_SITTER']), visitId: VISIT,
      replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 1, idempotencyKey: 'handover-deny' }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  const pendingCases = [
    ['IT-FE13-UC40-01', 'Customer opens Confirm Care Instructions from Booking Details'],
    ['IT-FE13-UC40-03', 'Customer saves Visit tasks and required flags'],
    ['IT-FE13-UC40-04', 'Customer applies instructions to later Visits'],
    ['IT-FE13-UC40-05', 'Customer cannot edit instructions after Visit starts'],
    ['IT-FE13-UC40-08', 'Sitter must acknowledge updated instructions before Check In'],
    ['IT-FE13-UC40-09', 'Customer discards unconfirmed instruction changes'],
    ['IT-FE13-UC40-10', 'Medication remains reference information rather than a sitter task'],
    ['IT-FE13-UC40-12', 'Check In is blocked until the latest instruction is acknowledged'],
    ['IT-FE13-UC41-01', 'Replacement assignment creates handover information and notification'],
    ['IT-FE13-UC41-02', 'Reassignment displays previous sitter, reason and handover time'],
    ['IT-FE13-UC41-04', 'Replacement sitter can view prior Visit reports'],
    ['IT-FE13-UC41-07', 'Unconfirmed handover within one hour enters Staff Needs action'],
    ['IT-FE13-UC41-08', 'Urgent replacement still requires handover immediately before Check In'],
    ['IT-FE13-UC41-09', 'Customer update after handover requires a new sitter acknowledgement']
  ];
  for (const [id, description] of pendingCases) test.todo(`${id}: ${description}`);
});
