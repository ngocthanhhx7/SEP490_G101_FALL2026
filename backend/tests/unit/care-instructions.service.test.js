import { expect, jest, test } from '@jest/globals';
import { createCareInstructionsService } from '../../src/services/care/care-instructions.service.js';

const CUSTOMER = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SITTER = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REPLACEMENT = 'eeeeeeeeeeeeeeeeeeeeeeee';
const VISIT = 'cccccccccccccccccccccccc';
const NOW = new Date('2026-10-15T00:00:00.000Z');
const active = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: 4102444800000 });

function createRepository({ startAt = '2026-10-15T04:00:00.000Z' } = {}) {
  const state = {
    visit: { id: VISIT, customerId: CUSTOMER, sitterId: SITTER, state: 'ASSIGNED', version: 3,
      startAt, endAt: '2026-10-15T05:00:00.000Z', handoverRequired: false },
    care: { version: 1, instructions: { allergies: 'Không ăn cá', importantRequests: 'Gọi khi bé trốn', accessNotes: 'Cổng bên hông' },
      updatedAt: '2026-10-14T00:00:00.000Z', requiresAcknowledgement: true, acknowledgements: [] },
    history: [], idempotency: new Map(), handover: null,
  };
  const tx = {
    getVisit: async id => id === VISIT ? state.visit : null,
    getCareInstructions: async id => id === VISIT ? state.care : null,
    listCareInstructionHistory: async () => state.history,
    saveCareInstructions: async ({ version, instructions, actorId, reason, requiresAcknowledgement, updatedAt }) => {
      state.history.push({ version: state.care.version, instructions: state.care.instructions, actorId: 'old', updatedAt: state.care.updatedAt });
      state.care = { version, instructions, actorId, reason, requiresAcknowledgement, updatedAt, acknowledgements: [] };
      return { visitId: VISIT, version, instructions, requiresAcknowledgement, updatedAt };
    },
    getOfferForSitter: async ({ sitterId }) => [SITTER, REPLACEMENT].includes(sitterId)
      ? { state: 'PENDING', deadline: '2026-10-15T06:00:00.000Z' } : null,
    recordCareInstructionAcknowledgement: async ({ sitterId, version, acknowledgedAt }) => {
      state.care.acknowledgements.push({ sitterId, version, acknowledgedAt });
      return { visitId: VISIT, sitterId, version, acknowledged: true, acknowledgedAt };
    },
    getAccessNotesSnapshot: async () => ({ privateAccessNotes: 'Mã cửa tổng hợp' }),
    getIdempotencyResult: async identity => state.idempotency.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => state.idempotency.set(identity.key, { payloadHash, result }),
    appendAuditAndOutbox: jest.fn(),
  };
  return { state, repository: { runForVisitActor: async (_actor, id, work) => work(tx, id) } };
}

test('versions Customer care instructions and keeps history without silent overwrite', async () => {
  const { state, repository } = createRepository();
  const service = createCareInstructionsService({ repository, clock: () => NOW });
  const result = await service.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'update-key-1', instructions: { allergies: 'Không dùng cá', importantRequests: 'Gọi trước khi vào', accessNotes: 'Cổng trước' } });
  expect(result).toMatchObject({ visitId: VISIT, version: 2, requiresAcknowledgement: true });
  expect(state.history).toHaveLength(1);
  await expect(service.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'update-key-2', instructions: { summary: 'stale' } }))
    .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
});

test('allows exactly two hours and rejects later edits using server time', async () => {
  const atCutoff = createRepository({ startAt: '2026-10-15T02:00:00.000Z' });
  const service = createCareInstructionsService({ repository: atCutoff.repository, clock: () => NOW });
  await expect(service.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'cutoff-key', instructions: { summary: 'Đúng hạn' } })).resolves.toMatchObject({ version: 2 });

  const afterCutoff = createRepository({ startAt: '2026-10-15T01:59:59.999Z' });
  const lateService = createCareInstructionsService({ repository: afterCutoff.repository, clock: () => NOW });
  await expect(lateService.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'late-key-1', instructions: { summary: 'Quá hạn' } }))
    .rejects.toMatchObject({ status: 409, code: 'DEADLINE_PASSED' });
});

test('requires a current instruction acknowledgement before a Sitter can read private notes', async () => {
  const { state, repository } = createRepository();
  const service = createCareInstructionsService({ repository, clock: () => new Date('2026-10-15T02:30:00.000Z') });
  const beforeWindow = await service.getInstructions({ actor: active(SITTER, ['PET_SITTER']), visitId: VISIT });
  expect(beforeWindow.instructions).not.toHaveProperty('accessNotes');
  const accessService = createCareInstructionsService({ repository, clock: () => new Date('2026-10-15T03:30:00.000Z') });
  await expect(accessService.getAccessNotes({ actor: active(SITTER, ['PET_SITTER']), visitId: VISIT }))
    .rejects.toMatchObject({ status: 403, code: 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED' });
  await service.acknowledgeInstructions({ actor: active(SITTER, ['PET_SITTER']), visitId: VISIT,
    instructionVersion: 1, idempotencyKey: 'ack-key-1' });
  expect(state.care.acknowledgements).toHaveLength(1);
  await expect(accessService.getAccessNotes({ actor: active(SITTER, ['PET_SITTER']), visitId: VISIT }))
    .resolves.toMatchObject({ privateAccessNotes: 'Mã cửa tổng hợp' });
});

test('allows an eligible replacement offer to read instructions before handover', async () => {
  const { state, repository } = createRepository();
  state.visit.handoverRequired = true;
  const service = createCareInstructionsService({ repository, clock: () => NOW });
  await expect(service.getInstructions({ actor: active(REPLACEMENT, ['PET_SITTER']), visitId: VISIT }))
    .resolves.toMatchObject({ visitId: VISIT, version: 1, acknowledged: false });
  await expect(service.acknowledgeInstructions({ actor: active(REPLACEMENT, ['PET_SITTER']), visitId: VISIT,
    instructionVersion: 1, idempotencyKey: 'replacement-ack' }))
    .resolves.toMatchObject({ sitterId: REPLACEMENT, acknowledged: true });
});

test('fails closed when acknowledgement persistence is unavailable', async () => {
  const service = createCareInstructionsService({ repository: {
    runForVisitActor: async (_actor, _visitId, work) => work({
      getVisit: async () => ({ id: VISIT, customerId: CUSTOMER, sitterId: SITTER, state: 'ASSIGNED', version: 1,
        startAt: '2026-10-15T04:00:00.000Z', endAt: '2026-10-15T05:00:00.000Z' }),
      getCareInstructions: async () => ({ version: 1, instructions: {} }),
    }),
  }, clock: () => NOW });
  await expect(service.acknowledgeInstructions({ actor: active(SITTER, ['PET_SITTER']), visitId: VISIT,
    instructionVersion: 1, idempotencyKey: 'missing-save' }))
    .rejects.toMatchObject({ status: 503, code: 'CARE_INSTRUCTIONS_UNAVAILABLE' });
});

test('rejects expired sessions, another Customer and idempotency key reuse', async () => {
  const { repository } = createRepository();
  const service = createCareInstructionsService({ repository, clock: () => NOW });
  await expect(service.getInstructions({ actor: active('dddddddddddddddddddddddd', ['CUSTOMER']), visitId: VISIT }))
    .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  await expect(service.getInstructions({ actor: { ...active(CUSTOMER, ['CUSTOMER']), expiresAt: NOW.getTime() - 1 }, visitId: VISIT }))
    .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  await service.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'replay-key', instructions: { summary: 'same' } });
  await expect(service.updateInstructions({ actor: active(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 1, idempotencyKey: 'replay-key', instructions: { summary: 'different' } }))
    .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
});
