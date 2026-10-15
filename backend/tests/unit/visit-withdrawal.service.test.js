import { describe, expect, test } from '@jest/globals';
import { createVisitWithdrawalService } from '../../src/services/visit-withdrawal.service.js';

const SITTER = { userId: 'sitter-1', roles: ['PET_SITTER'], state: 'ACTIVE' };
const now = Date.parse('2026-10-15T00:00:00.000Z');
const startAt = now + 60 * 60 * 1000;

function repository(overrides = {}) {
  const state = { visit: { id: 'visit-1', sitterId: SITTER.userId, state: 'ASSIGNED', version: 2,
    startAt: new Date(startAt).toISOString(), checkInAt: null }, calls: [], ...overrides };
  const operations = new Map();
  return { state, async runVisitCommand(command) {
    const previous = operations.get(command.idempotencyKey);
    const fingerprint = JSON.stringify(command.payload);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw Object.assign(new Error(), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      return globalThis.structuredClone(previous.result);
    }
    const tx = {
      getVisit: async () => globalThis.structuredClone(state.visit),
      withdrawAssignment: async ({ expectedVersion }) => {
        state.visit = { ...state.visit, state: 'WITHDRAWN', version: expectedVersion + 1 };
        state.calls.push('withdraw');
        return { state: 'WITHDRAWN', version: expectedVersion + 1 };
      },
      appendAuditAndOutbox: async event => state.calls.push(event.type)
    };
    const result = await command.execute(tx);
    operations.set(command.idempotencyKey, { fingerprint, result: globalThis.structuredClone(result) });
    return result;
  }};
}

describe('sitter withdrawal boundary and operational semantics', () => {
  test('allows exactly 60 minutes before start and never requests payout or reschedule', async () => {
    const repo = repository();
    const service = createVisitWithdrawalService({ repository: repo, clock: () => now });
    await expect(service.withdraw({ actor: SITTER, visitId: 'visit-1', expectedVersion: 2,
      idempotencyKey: 'withdraw-visit-1', reason: 'Unexpected conflict' })).resolves.toMatchObject({
      state: 'WITHDRAWN', needsReassignment: true, scheduleChanged: false, payoutRequested: false, version: 3
    });
    expect(repo.state.calls).toEqual(['withdraw', 'VisitAssignmentWithdrawn']);
  });

  test('blocks 59:59 and routes the sitter to Staff', async () => {
    const repo = repository();
    const service = createVisitWithdrawalService({ repository: repo, clock: () => now + 1000 });
    await expect(service.withdraw({ actor: SITTER, visitId: 'visit-1', expectedVersion: 2,
      idempotencyKey: 'withdraw-too-late', reason: 'Unexpected conflict' })).rejects.toMatchObject({
      code: 'WITHDRAWAL_WINDOW_CLOSED', details: { route: 'STAFF', minLeadMinutes: 60 }
    });
    expect(repo.state.calls).toEqual([]);
  });

  test.each([
    ['wrong sitter', { visit: { id: 'visit-1', sitterId: 'other', state: 'ASSIGNED', version: 2, startAt: new Date(startAt).toISOString() } }, 'FORBIDDEN'],
    ['checked in', { visit: { id: 'visit-1', sitterId: SITTER.userId, state: 'ASSIGNED', version: 2, startAt: new Date(startAt).toISOString(), checkInAt: new Date(now).toISOString() } }, 'VISIT_ALREADY_STARTED'],
    ['not assigned', { visit: { id: 'visit-1', sitterId: SITTER.userId, state: 'IN_PROGRESS', version: 2, startAt: new Date(startAt).toISOString(), checkInAt: null } }, 'VISIT_NOT_WITHDRAWABLE']
  ])('rejects %s without mutation', async (_name, seed, code) => {
    const repo = repository(seed);
    const service = createVisitWithdrawalService({ repository: repo, clock: () => now });
    await expect(service.withdraw({ actor: SITTER, visitId: 'visit-1', expectedVersion: 2,
      idempotencyKey: `withdraw-${_name.replace(/ /g, '-')}`, reason: 'Reason' })).rejects.toMatchObject({ code });
    expect(repo.state.calls).toEqual([]);
  });

  test('replays an idempotent withdrawal without applying twice', async () => {
    const repo = repository();
    const service = createVisitWithdrawalService({ repository: repo, clock: () => now });
    const input = { actor: SITTER, visitId: 'visit-1', expectedVersion: 2, idempotencyKey: 'withdraw-replay', reason: 'Reason' };
    const first = await service.withdraw(input);
    const replay = await service.withdraw(input);
    expect(replay).toEqual(first);
    expect(repo.state.calls.filter(item => item === 'withdraw')).toHaveLength(1);
  });
});
