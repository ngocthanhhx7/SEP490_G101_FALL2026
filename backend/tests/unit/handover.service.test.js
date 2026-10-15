import { expect, jest, test } from '@jest/globals';
import { createHandoverService } from '../../src/services/care/handover.service.js';

const CUSTOMER = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CURRENT = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REPLACEMENT = 'cccccccccccccccccccccccc';
const VISIT = 'dddddddddddddddddddddddd';
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: Date.now() + 600000 });

function fixture() {
  const state = {
    visit: { id: VISIT, customerId: CUSTOMER, sitterId: CURRENT, state: 'ASSIGNED', version: 7 },
    care: { version: 3, acknowledgements: [{ sitterId: REPLACEMENT, version: 3 }] }, handover: null,
    idempotency: new Map(), audit: jest.fn()
  };
  const tx = {
    getVisit: async () => state.visit,
    getHandover: async () => state.handover,
    getReplacementAssignment: async ({ sitterId }) => sitterId === REPLACEMENT ? { sitterId, state: 'ASSIGNED' } : null,
    getCareInstructions: async () => state.care,
    confirmHandover: async ({ replacementSitterId, instructionVersion, confirmedAt }) => {
      state.handover = { visitId: VISIT, state: 'CONFIRMED', replacementSitterId, instructionVersion, confirmedAt, accessGranted: true };
      state.visit = { ...state.visit, sitterId: replacementSitterId, version: state.visit.version + 1, handoverRequired: false, handoverAccepted: true };
      return { ...state.handover, version: state.visit.version };
    },
    getIdempotencyResult: async identity => state.idempotency.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => state.idempotency.set(identity.key, { payloadHash, result }),
    appendAuditAndOutbox: state.audit,
  };
  return { state, repository: { runForVisitActor: async (_actor, _visitId, work) => work(tx) } };
}

test('confirms replacement handover only after the latest instruction is acknowledged', async () => {
  const { state, repository } = fixture();
  const service = createHandoverService({ repository, clock: () => new Date('2026-10-15T00:00:00.000Z') });
  const result = await service.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'handover-key' });
  expect(result).toMatchObject({ state: 'CONFIRMED', replacementSitterId: REPLACEMENT, accessGranted: true, version: 8 });
  expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ type: 'VisitHandoverConfirmed', visitId: VISIT }));
  await expect(service.get({ actor: actor(REPLACEMENT, ['PET_SITTER']), visitId: VISIT })).resolves.toMatchObject({ state: 'CONFIRMED' });
});

test('rejects an unacknowledged replacement, wrong booking actor, stale visit and replay conflict', async () => {
  const first = fixture();
  first.state.care.acknowledgements = [];
  const service = createHandoverService({ repository: first.repository });
  await expect(service.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'handover-key-1' }))
    .rejects.toMatchObject({ status: 409, code: 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED' });
  await expect(service.confirm({ actor: actor('eeeeeeeeeeeeeeeeeeeeeeee', ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'handover-key-2' }))
    .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  await expect(service.confirm({ actor: actor(CURRENT, ['PET_SITTER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'handover-key-4' }))
    .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });

  const replay = fixture();
  const replayService = createHandoverService({ repository: replay.repository });
  await replayService.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'handover-key-3' });
  await expect(replayService.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 8, instructionVersion: 2, idempotencyKey: 'handover-key-3' }))
    .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
});

test('fails closed when handover persistence is unavailable', async () => {
  const service = createHandoverService({ repository: {
    runForVisitActor: async (_actor, _visitId, work) => work({
      getVisit: async () => ({ id: VISIT, customerId: CUSTOMER, sitterId: CURRENT, state: 'ASSIGNED', version: 7 }),
      getReplacementAssignment: async () => ({ sitterId: REPLACEMENT, state: 'ASSIGNED' }),
      getCareInstructions: async () => ({ version: 3, acknowledgements: [{ sitterId: REPLACEMENT, version: 3 }] }),
    }),
  }});
  await expect(service.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'missing-save' }))
    .rejects.toMatchObject({ status: 503, code: 'HANDOVER_UNAVAILABLE' });
});

test('does not synthesize access on a confirmed record without capability', async () => {
  const service = createHandoverService({ repository: {
    runForVisitActor: async (_actor, _visitId, work) => work({
      getVisit: async () => ({ id: VISIT, customerId: CUSTOMER, sitterId: CURRENT, state: 'ASSIGNED', version: 7 }),
      getHandover: async () => ({ state: 'CONFIRMED', replacementSitterId: REPLACEMENT, instructionVersion: 3, accessGranted: false }),
      getReplacementAssignment: async () => ({ sitterId: REPLACEMENT, state: 'ASSIGNED' }),
      getCareInstructions: async () => ({ version: 3, acknowledgements: [{ sitterId: REPLACEMENT, version: 3 }] }),
    }),
  }});
  await expect(service.confirm({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    replacementSitterId: REPLACEMENT, expectedVersion: 7, instructionVersion: 3, idempotencyKey: 'bad-replay' }))
    .rejects.toMatchObject({ status: 503, code: 'HANDOVER_UNAVAILABLE' });
});
