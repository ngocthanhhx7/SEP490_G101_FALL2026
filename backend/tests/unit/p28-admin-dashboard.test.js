import { test, expect, jest } from '@jest/globals';
import { createAdminDashboardService } from '../../src/services/dashboards/admin-dashboard.service.js';
const id = 'a'.repeat(24);
const actor = { userId: id, state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 3600000 };
const row = { id, customerId: id, sitterId: id, state: 'ASSIGNED', startsAt: '2026-10-19T00:00:00+07:00', homeAccess: 'PRIVATE' };
function setup(patch = {}) {
  const repository = { readSnapshot: jest.fn(async ({ scope }) => ({ ready: true, scope,
    sourceVersion: 'synthetic-v1', asOf: '2026-10-15T02:00:00Z', policyVersion: 'approved-test', decisionIds: [],
    metrics: {"pendingApplications": 2, "needsAction": 1}, items: [row], nextCursor: null, ...patch })) };
  return { repository, service: createAdminDashboardService({ repository }) };
}
test('admin-dashboard: scoped projection does not expose private fields', async () => {
  const result = await setup().service.read({ actor });
  expect(result.data.items).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.data.kind).toBe('admin-dashboard');
});
test('admin-dashboard: forbidden role cannot invoke repository', async () => {
  const { service, repository } = setup();
  await expect(service.read({ actor: { ...actor, roles: ['CUSTOMER'] } })).rejects.toMatchObject({ status: 403 });
  expect(repository.readSnapshot).not.toHaveBeenCalled();
});
test('admin-dashboard: missing integration stays pending and unknown owner filter is rejected', async () => {
  expect(await createAdminDashboardService().read({ actor })).toMatchObject({ pending: true });
  await expect(setup().service.read({ actor, query: { ownerId: id } })).rejects.toMatchObject({ status: 422 });
});
test('admin-dashboard: empty source and cursor retained without fake items', async () => {
  const result = await setup({ items: [], nextCursor: 'signed_next' }).service.read({ actor });
  expect(result.data.items).toEqual([]);
  expect(result.data.nextCursor).toBe('signed_next');
});
