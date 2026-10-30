import { describe, test, expect, jest } from '@jest/globals';
import { createEarningsService } from '../../src/services/dashboards/earnings.service.js';
import { filters } from '../../src/services/dashboards/read-projection.js';
const id = 'a'.repeat(24);
const actor = { userId: id, state: 'ACTIVE', roles: ['PET_SITTER'], expiresAt: Date.now() + 3600000 };
const entry = { id: 'b'.repeat(24), visitId: 'c'.repeat(24), sitterId: id,
  visitState: 'COMPLETED', accrued: 100, pending: 10, available: 20, held: 30, reserved: 40, paid: 0,
  completedAt: '2026-10-15T01:00:00Z', explanation: 'Theo sổ đã duyệt', ledgerReference: 'journal-1',
  homeAccess: 'private', bank: 'private' };
const setup = (patch = {}) => {
  const repository = { readSnapshot: jest.fn(async ({ scope }) => ({ ready: true, scope,
    sourceVersion: 'synthetic-v1', policyVersion: 'synthetic-approved', decisionIds: [],
    asOf: '2026-10-15T02:00:00Z', items: [entry], nextCursor: null, ...patch })) };
  return { repository, service: createEarningsService({ repository }) };
};
describe('P28 earnings read boundary (synthetic source)', () => {
  test('partitions ledger amounts and projects no secrets; no payout from accrued', async () => {
    const { service, repository } = setup();
    const result = await service.read({ actor });
    expect(result.data.items[0]).not.toHaveProperty('homeAccess');
    expect(result.data.items[0]).not.toHaveProperty('bank');
    expect(result.data.metrics.find(row => row.key === 'paid').value).toBe(0);
    expect(result.data.metrics.find(row => row.key === 'accrued').value).toBe(100);
    expect(result.data.totalsScope).toBe('PAGE');
    expect(repository.readSnapshot.mock.calls[0][0].scope.userId).toBe(id);
  });
  test('excludes cancelled visits rather than treating cancellation as income', async () => {
    const { service } = setup({ items: [{ ...entry, visitState: 'CANCELLED' }] });
    const result = await service.read({ actor });
    expect(result.data.items).toEqual([]);
    expect(result.data.metrics.every(row => row.value === 0)).toBe(true);
  });
  test.each(['CUSTOMER', 'STAFF', 'ADMIN'])('rejects %s before data read', async role => {
    const { service, repository } = setup();
    await expect(service.read({ actor: { ...actor, roles: [role] } })).rejects.toMatchObject({ status: 403 });
    expect(repository.readSnapshot).not.toHaveBeenCalled();
  });
  test('expired session cannot read directly', async () => {
    await expect(setup().service.read({ actor: { ...actor, expiresAt: 0 } })).rejects.toMatchObject({ status: 401 });
  });
  test('fails closed for another sitter and scope mismatch', async () => {
    await expect(setup({ items: [{ ...entry, sitterId: 'd'.repeat(24) }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
    await expect(setup({ scope: {} }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
  });
  test.each([{ accrued: 100.5 }, { held: -1 }, { paid: 5 }, { accrued: Number.MAX_SAFE_INTEGER }, { visitState: 'ASSIGNED' }])('rejects invalid ledger projection %j', async patch => {
    await expect(setup({ items: [{ ...entry, ...patch }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
  });
  test('requires transfer evidence for paid partition', async () => {
    await expect(setup({ items: [{ ...entry, available: 0, paid: 20 }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
    const result = await setup({ items: [{ ...entry, available: 0, paid: 20, transferRecordedAt: '2026-10-15T03:00:00Z' }] }).service.read({ actor });
    expect(result.data.items[0].paid).toBe(20);
  });
  test.each([{ ready: false }, { policyVersion: '' }, { decisionIds: ['FIN-07-ELIG'] }])('missing eligibility never returns zero balance %j', async patch => {
    expect(await setup(patch).service.read({ actor })).toEqual({ pending: true, kind: 'earnings' });
  });
  test('absent source remains pending; transport errors propagate', async () => {
    expect(await createEarningsService().read({ actor })).toMatchObject({ pending: true });
    const repository = { readSnapshot: async () => { throw new Error('offline'); } };
    await expect(createEarningsService({ repository }).read({ actor })).rejects.toThrow('offline');
  });
  test.each([{ sitterId: id }, { limit: '51' }, { from: '2026-02-30' }, { from: '2026-10-20', to: '2026-10-19' }, { search: {} }, { cursor: '$where' }])('rejects untrusted filters %j', query => {
    expect(() => filters(query)).toThrow();
  });
  test('passes bounded page and Vietnam date semantics to source', async () => {
    const { service, repository } = setup();
    await service.read({ actor, query: { from: '2026-10-18', to: '2026-10-19', limit: '50', cursor: 'signed_cursor' } });
    expect(repository.readSnapshot.mock.calls[0][0].query).toEqual({ from: '2026-10-18', to: '2026-10-19', limit: 50, cursor: 'signed_cursor', timeZone: 'Asia/Ho_Chi_Minh' });
  });
});
