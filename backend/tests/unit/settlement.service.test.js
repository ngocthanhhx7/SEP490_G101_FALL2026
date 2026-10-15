import { test, expect } from '@jest/globals';
import { createSettlementService } from '../../src/services/settlements/settlement.service.js';
import { vietnamRequestWeek } from '../../src/services/settlements/week.js';

const sitter = { userId: 'sitter-a', roles: ['PET_SITTER'], state: 'ACTIVE' };
// Serialized transactional double with rollback: verifies orchestration, not Mongo concurrency.
function fixture() {
  let state = { commands: {}, claims: {}, rows: [], events: [], earnings: {
    old: { sitterId: sitter.userId, available: true, amountVnd: 123000 },
    held: { sitterId: sitter.userId, available: false, amountVnd: 100 },
    other: { sitterId: 'sitter-b', available: true, amountVnd: 100 }
  } };
  let queue = Promise.resolve();
  let now = '2026-10-18T16:59:59.000Z';
  const repository = {
    findCommand: async scope => state.commands[JSON.stringify(scope)],
    saveCommand: async command => { const { actorId, operation, key } = command;
      state.commands[JSON.stringify({ actorId, operation, key })] = command; },
    claimWeek: async ({ sitterId, requestWeekKey }) => {
      const key = `${sitterId}:${requestWeekKey}`;
      if (state.claims[key]) return null;
      return state.claims[key] = { id: `request-${Object.keys(state.claims).length}` };
    },
    reserveEarnings: async ({ sitterId, earningIds }) => {
      if (earningIds.some(id => !state.earnings[id]?.available || state.earnings[id].sitterId !== sitterId)) return null;
      const amountVnd = earningIds.reduce((sum, id) => sum + state.earnings[id].amountVnd, 0);
      earningIds.forEach(id => { state.earnings[id].available = false; });
      return { amountVnd };
    },
    create: async row => { state.rows.push(row); return row; },
    appendEvent: async event => { state.events.push(event); },
    readOwn: async ({ sitterId }) => ({ sitterId })
  };
  const unitOfWork = { run(callback) {
    const next = queue.then(async () => {
      const snapshot = JSON.parse(JSON.stringify(state));
      try { return await callback({}); } catch (error) { state = snapshot; throw error; }
    });
    queue = next.catch(() => {}); return next;
  } };
  const policy = { resolve: async () => ({ ready: true, decisionIds: [], policyVersion: 'test', decisionVersion: 'test' }) };
  const service = createSettlementService({ unitOfWork, repository, policy, clock: () => new Date(now) });
  return { service, repository, unitOfWork, policy, state: () => state, clock: value => { now = value; } };
}

test.each([
  ['2026-10-18T16:59:59.999Z', '2026-10-12'],
  ['2026-10-18T17:00:00.000Z', '2026-10-19'],
  ['2027-01-01T00:00:00.000Z', '2026-12-28'],
  ['2027-01-03T17:00:00.000Z', '2027-01-04']
])('Vietnam week boundary %s', (now, key) => {
  const week = vietnamRequestWeek(now);
  expect(week.requestWeekKey).toBe(key);
  expect(Date.parse(now)).toBeGreaterThanOrEqual(Date.parse(week.startsAt));
  expect(Date.parse(now)).toBeLessThan(Date.parse(week.endsAt));
});

test('concurrent devices consume one week, one reservation and one ledger event', async () => {
  const f = fixture();
  const outcomes = await Promise.allSettled(['device-1', 'device-2'].map(idempotencyKey =>
    f.service.submit({ actor: sitter, earningIds: ['old'], idempotencyKey })));
  expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(row => row.status === 'rejected').reason.code).toBe('WEEKLY_QUOTA_USED');
  expect(f.state().events).toHaveLength(1);
});

test('replay across weeks returns original request; new key cannot reserve old earning', async () => {
  const f = fixture();
  const input = { actor: sitter, earningIds: ['old'], idempotencyKey: 'device-1' };
  const first = await f.service.submit(input);
  f.clock('2026-10-18T17:00:00Z');
  expect(await f.service.submit(input)).toEqual(first);
  await expect(f.service.submit({ ...input, idempotencyKey: 'device-2' })).rejects.toMatchObject({ code: 'EARNINGS_UNAVAILABLE' });
  expect(Object.keys(f.state().claims)).toHaveLength(1);
  expect(f.state().events).toHaveLength(1);
});

test.each(['held', 'other', 'unknown'])('unavailable/foreign earning %s rolls back quota', async id => {
  const f = fixture();
  await expect(f.service.submit({ actor: sitter, earningIds: [id], idempotencyKey: 'negative-1' }))
    .rejects.toMatchObject({ code: 'EARNINGS_UNAVAILABLE' });
  expect(Object.keys(f.state().claims)).toHaveLength(0);
});

test('atomic ledger failure rolls back reservation and request', async () => {
  const f = fixture();
  f.repository.appendEvent = async () => { throw new Error('storage failed'); };
  await expect(f.service.submit({ actor: sitter, earningIds: ['old'], idempotencyKey: 'negative-1' })).rejects.toThrow('storage failed');
  expect(f.state().earnings.old.available).toBe(true);
  expect(f.state().rows).toHaveLength(0);
});

test('missing decision writes nothing', async () => {
  const f = fixture();
  f.policy.resolve = async () => ({ ready: false, decisionIds: ['FIN-07-ELIG'] });
  await expect(f.service.submit({ actor: sitter, earningIds: ['old'], idempotencyKey: 'negative-1' }))
    .rejects.toMatchObject({ code: 'DECISION_REQUIRED', details: { decisionIds: ['FIN-07-ELIG'] } });
  expect(f.state().rows).toHaveLength(0);
});

test('role, payload and idempotency collisions are rejected', async () => {
  const f = fixture();
  await expect(f.service.readOwn({ actor: { ...sitter, roles: ['STAFF'] } })).rejects.toMatchObject({ status: 403 });
  await expect(f.service.readOwn({ actor: null })).rejects.toMatchObject({ status: 401 });
  const input = { actor: sitter, earningIds: ['old'], idempotencyKey: 'device-1' };
  await f.service.submit(input);
  await expect(f.service.submit({ ...input, earningIds: ['held'] })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  await expect(f.service.submit({ ...input, earningIds: ['old', 'old'] })).rejects.toMatchObject({ status: 422 });
});

test('read projection refuses foreign records and strips private metadata', async () => {
  const f = fixture();
  const projection = { balances: { accrued: 1, available: 1, reserved: 0, paid: 0 },
    earnings: [{ id: 'old', sitterId: sitter.userId, availableVnd: 1, earningPeriodKey: 'old-week', bankAccount: 'private' }],
    requests: [], quotaUsed: false, decisionIds: [], privateNotes: 'private' };
  f.repository.readOwn = async () => projection;
  const result = await f.service.readOwn({ actor: sitter });
  expect(JSON.stringify(result)).not.toContain('private');
  projection.earnings[0].sitterId = 'someone-else';
  await expect(f.service.readOwn({ actor: sitter })).rejects.toMatchObject({ code: 'LEDGER_SCOPE_INVALID' });
});
