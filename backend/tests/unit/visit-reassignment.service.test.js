import { describe, expect, test } from '@jest/globals';
import { createVisitReassignmentService } from '../../src/services/visit-reassignment.service.js';

const STAFF = { userId: 'staff-1', roles: ['STAFF'], state: 'ACTIVE' };
const SITTER = 'sitter-1';
const REPLACEMENT = 'sitter-2';
const now = Date.parse('2026-10-15T00:00:00.000Z');

function makeRepository(seed = {}) {
  const state = { visit: { id: 'visit-1', state: 'ASSIGNED', sitterId: SITTER, version: 4,
    startAt: '2026-10-16T02:00:00.000Z', endAt: '2026-10-16T03:00:00.000Z' }, calls: [], ...seed };
  const operations = new Map();
  return { state, async runVisitCommand(command) {
    const existing = operations.get(command.idempotencyKey);
    const fingerprint = JSON.stringify(command.payload);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw Object.assign(new Error(), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      return globalThis.structuredClone(existing.result);
    }
    const tx = {
      getVisit: async () => globalThis.structuredClone(state.visit),
      getSitter: async ({ sitterId }) => ({ sitterId, status: state.sitterStatus ?? 'ACTIVE' }),
      recheckEligibility: async ({ sitterId }) => ({ eligible: sitterId === REPLACEMENT && state.eligible !== false }),
      checkSlotAvailability: async () => state.slotAvailable !== false,
      reassignVisit: async ({ oldSitterId, newSitterId, expectedVersion, handoverRequired }) => {
        state.calls.push({ oldSitterId, newSitterId, handoverRequired });
        state.visit = { ...state.visit, sitterId: newSitterId, version: expectedVersion + 1, handoverRequired };
        return { state: 'ASSIGNED', sitterId: newSitterId, version: expectedVersion + 1 };
      },
      appendAuditAndOutbox: async event => state.calls.push(event.type),
      notify: async event => state.calls.push(event.type)
    };
    const result = await command.execute(tx);
    operations.set(command.idempotencyKey, { fingerprint, result: globalThis.structuredClone(result) });
    return result;
  }};
}

describe('staff visit reassignment', () => {
  test('rechecks eligibility/slot and marks handover without changing schedule or payout', async () => {
    const repository = makeRepository();
    const service = createVisitReassignmentService({ repository, clock: () => now });
    const result = await service.reassign({ actor: STAFF, visitId: 'visit-1', newSitterId: REPLACEMENT,
      expectedVersion: 4, idempotencyKey: 'reassign-visit-1', reason: 'Sitter unavailable' });
    expect(result).toMatchObject({ state: 'ASSIGNED', sitterId: REPLACEMENT, previousSitterId: SITTER,
      version: 5, handoverRequired: true, scheduleChanged: false, payoutChanged: false });
    expect(repository.state.calls).toEqual([
      { oldSitterId: SITTER, newSitterId: REPLACEMENT, handoverRequired: true },
      'VisitReassigned', 'VISIT_REASSIGNED'
    ]);
  });

  test.each([
    ['suspended', { sitterStatus: 'SUSPENDED' }, 'SITTER_SUSPENDED'],
    ['ineligible', { eligible: false }, 'SITTER_NOT_ELIGIBLE'],
    ['occupied', { slotAvailable: false }, 'SLOT_UNAVAILABLE']
  ])('rejects %s replacement before mutation', async (_name, seed, code) => {
    const repository = makeRepository(seed);
    const service = createVisitReassignmentService({ repository, clock: () => now });
    await expect(service.reassign({ actor: STAFF, visitId: 'visit-1', newSitterId: REPLACEMENT,
      expectedVersion: 4, idempotencyKey: `reassign-${_name}`, reason: 'Replacement' })).rejects.toMatchObject({ code });
    expect(repository.state.calls).toEqual([]);
  });

  test('requires operational staff and preserves idempotency', async () => {
    const repository = makeRepository();
    const service = createVisitReassignmentService({ repository, clock: () => now });
    await expect(service.reassign({ actor: { ...STAFF, roles: ['PET_SITTER'] }, visitId: 'visit-1', newSitterId: REPLACEMENT,
      expectedVersion: 4, idempotencyKey: 'reassign-forbidden', reason: 'Replacement' })).rejects.toMatchObject({ status: 403 });
    const input = { actor: STAFF, visitId: 'visit-1', newSitterId: REPLACEMENT, expectedVersion: 4,
      idempotencyKey: 'reassign-replay', reason: 'Replacement' };
    const first = await service.reassign(input);
    const replay = await service.reassign(input);
    expect(replay).toEqual(first);
    expect(repository.state.calls.filter(item => item === 'VisitReassigned')).toHaveLength(1);
  });
});
