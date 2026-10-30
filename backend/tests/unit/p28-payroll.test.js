import { test, expect, jest } from '@jest/globals';
import { createPayrollService } from '../../src/services/dashboards/payroll.service.js';
const id = 'a'.repeat(24);
const actor = { userId: id, state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 3600000 };
const row = { id, sitterId: id, displayName: 'Sitter tổng hợp', state: 'Approved', amountVnd: 100, requestWeekKey: '2026-10-12', bank: 'PRIVATE' };
function setup(patch = {}) {
  const repository = { readSnapshot: jest.fn(async ({ scope }) => ({ ready: true, scope,
    sourceVersion: 'synthetic-v1', asOf: '2026-10-15T02:00:00Z', policyVersion: 'approved-test', decisionIds: [],
    metrics: {}, items: [row], nextCursor: null, ...patch })) };
  return { repository, service: createPayrollService({ repository }) };
}
test('payroll: scoped projection does not expose private fields', async () => {
  const result = await setup().service.read({ actor });
  expect(result.data.items).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.data.kind).toBe('payroll');
});
test('payroll: forbidden role cannot invoke repository', async () => {
  const { service, repository } = setup();
  await expect(service.read({ actor: { ...actor, roles: ['CUSTOMER'] } })).rejects.toMatchObject({ status: 403 });
  expect(repository.readSnapshot).not.toHaveBeenCalled();
});
test('payroll: missing integration stays pending and unknown owner filter is rejected', async () => {
  expect(await createPayrollService().read({ actor })).toMatchObject({ pending: true });
  await expect(setup().service.read({ actor, query: { ownerId: id } })).rejects.toMatchObject({ status: 422 });
});
test('payroll: empty source and cursor retained without fake items', async () => {
  const result = await setup({ items: [], nextCursor: 'signed_next' }).service.read({ actor });
  expect(result.data.items).toEqual([]);
  expect(result.data.nextCursor).toBe('signed_next');
});

test('Staff cannot read payroll and unknown decisions stay pending', async () => {
  await expect(setup().service.read({ actor: { ...actor, roles: ['STAFF'] } })).rejects.toMatchObject({ status: 403 });
  expect(await setup({ decisionIds: ['FIN-07-ELIG'] }).service.read({ actor })).toMatchObject({ pending: true });
});

test('Paid requires evidence and request week must be Monday in Vietnam', async () => {
  await expect(setup({ items: [{ ...row, state: 'Paid' }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
  await expect(setup({ items: [{ ...row, requestWeekKey: '2026-10-18' }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
});
