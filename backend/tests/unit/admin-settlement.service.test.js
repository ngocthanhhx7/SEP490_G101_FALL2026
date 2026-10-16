import { test, expect } from '@jest/globals';
import { createAdminSettlementService } from '../../src/services/settlements/admin-settlement.service.js';

const actor = { userId: 'admin', roles: ['ADMIN'], state: 'ACTIVE' };
function setup() {
  let state = { row: { id: 'r1', sitterId: 's1', amountVnd: 123000, status: 'SUBMITTED',
    version: 0, requestWeekKey: '2026-10-12', submittedAt: '2026-10-12T00:00:00Z' },
  commands: {}, events: [], reserved: 123000, paid: 0, quotaUsed: true };
  let queue = Promise.resolve();
  const repository = {
    findCommand: async scope => state.commands[JSON.stringify(scope)],
    saveCommand: async command => { const { actorId, operation, key } = command;
      state.commands[JSON.stringify({ actorId, operation, key })] = command; },
    getById: async id => id === state.row.id ? state.row : null,
    compareAndSet: async (_id, version, patch) => {
      if (version !== state.row.version) return null;
      state.row = { ...state.row, ...patch }; return state.row;
    },
    appendEvent: async event => { state.events.push(event); },
    settleReservation: async () => { if (!state.reserved) return false;
      state.paid += state.reserved; state.reserved = 0; return true; },
    releaseReservation: async () => { state.reserved = 0; return true; },
    listPayroll: async () => ({ items: [{ ...state.row, bankAccount: 'private' }], decisionIds: [] })
  };
  const unitOfWork = { run(callback) {
    const next = queue.then(async () => {
      const snapshot = JSON.parse(JSON.stringify(state));
      try { return await callback({}); } catch (error) { state = snapshot; throw error; }
    }); queue = next.catch(() => {}); return next;
  } };
  const policy = { resolve: async () => ({ ready: true, policyVersion: 'test', decisionVersion: 'test', decisionIds: [] }) };
  const service = createAdminSettlementService({ unitOfWork, repository, policy,
    clock: () => new Date('2026-10-15T03:00:00Z') });
  const decide = { actor, requestId: 'r1', expectedVersion: 0, decision: 'APPROVE', reason: 'Evidence checked', idempotencyKey: 'approve-1' };
  const transfer = { actor, requestId: 'r1', expectedVersion: 1, outcome: 'CONFIRMED',
    amountVnd: 123000, reference: 'bank-1', evidenceReference: 'private-1', paidAt: '2026-10-15T09:00:00+07:00', idempotencyKey: 'transfer-1' };
  return { service, repository, policy, state: () => state, decide, transfer };
}

test('approval is not paid; exact confirmed transfer consumes reservation only once', async () => {
  const f = setup();
  expect((await f.service.decide(f.decide)).status).toBe('APPROVED');
  expect(f.state().paid).toBe(0);
  const result = await f.service.recordTransfer(f.transfer);
  expect(result.status).toBe('PAID');
  expect(await f.service.recordTransfer(f.transfer)).toEqual(result);
  expect(f.state().paid).toBe(123000);
  expect(f.state().events).toHaveLength(2);
});

test('reject releases reservation while consuming quota; cannot reject after approval', async () => {
  const f = setup();
  await f.service.decide({ ...f.decide, decision: 'REJECT' });
  expect(f.state().reserved).toBe(0);
  expect(f.state().quotaUsed).toBe(true);
  const approved = setup();
  await approved.service.decide(approved.decide);
  await expect(approved.service.decide({ ...approved.decide, decision: 'REJECT', expectedVersion: 1,
    idempotencyKey: 'reject-22' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

test.each(['UNKNOWN', 'MISMATCH'])('%s preserves reservation for reconciliation', async outcome => {
  const f = setup(); await f.service.decide(f.decide);
  const result = await f.service.recordTransfer({ ...f.transfer,
    outcome: outcome === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED', amountVnd: 1 });
  expect(result.status).toBe('TRANSFER_PENDING');
  expect(f.state().reserved).toBe(123000);
  expect(f.state().paid).toBe(0);
  await expect(f.service.decide({ ...f.decide, decision: 'REJECT', expectedVersion: 2,
    idempotencyKey: 'reject-22' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

test('two concurrent transfers cannot pay twice', async () => {
  const f = setup(); await f.service.decide(f.decide);
  const results = await Promise.allSettled(['transfer-1', 'transfer-2'].map(idempotencyKey =>
    f.service.recordTransfer({ ...f.transfer, idempotencyKey })));
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(f.state().paid).toBe(123000);
});

test('missing policy, foreign role, stale version and missing evidence fail', async () => {
  const f = setup();
  await expect(f.service.list({ actor: { ...actor, roles: ['STAFF'] } })).rejects.toMatchObject({ status: 403 });
  await expect(f.service.decide({ ...f.decide, expectedVersion: 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await expect(f.service.recordTransfer({ ...f.transfer, evidenceReference: '' })).rejects.toMatchObject({ status: 422 });
  f.policy.resolve = async () => null;
  await expect(f.service.decide(f.decide)).rejects.toMatchObject({ code: 'DECISION_REQUIRED' });
  expect(f.state().row.status).toBe('SUBMITTED');
});

test('audit failure rolls back reservation, state and paid amount', async () => {
  const f = setup(); await f.service.decide(f.decide);
  f.repository.appendEvent = async () => { throw new Error('audit unavailable'); };
  await expect(f.service.recordTransfer(f.transfer)).rejects.toThrow('audit unavailable');
  expect(f.state().row.status).toBe('APPROVED');
  expect(f.state().paid).toBe(0);
  expect(f.state().reserved).toBe(123000);
});

test('time must have offset and not precede submission or exceed server time', async () => {
  const f = setup(); await f.service.decide(f.decide);
  for (const paidAt of ['2026-10-15T09:00:00', '2026-10-16T00:00:00Z', '2026-10-01T00:00:00Z']) {
    await expect(f.service.recordTransfer({ ...f.transfer, paidAt })).rejects.toMatchObject({ status: 422 });
  }
});

test('private metadata is not serialized', async () => {
  const f = setup();
  expect(JSON.stringify(await f.service.list({ actor }))).not.toContain('private');
});
