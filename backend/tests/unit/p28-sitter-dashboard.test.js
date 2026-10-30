import { test, expect, jest } from '@jest/globals';
import { createSitterDashboardService } from '../../src/services/dashboards/sitter-dashboard.service.js';
const id = 'a'.repeat(24);
const actor = { userId: id, state: 'ACTIVE', roles: ['PET_SITTER'], expiresAt: Date.now() + 3600000 };
const row = { id, customerId: id, sitterId: id, state: 'ASSIGNED', startsAt: '2026-10-19T00:00:00+07:00', homeAccess: 'PRIVATE' };
function setup(patch = {}) {
  const repository = { readSnapshot: jest.fn(async ({ scope }) => ({ ready: true, scope,
    sourceVersion: 'synthetic-v1', asOf: '2026-10-15T02:00:00Z', policyVersion: 'approved-test', decisionIds: [],
    metrics: {"assignedVisits": 1, "pendingOffers": 0}, items: [row], nextCursor: null, ...patch })) };
  return { repository, service: createSitterDashboardService({ repository }) };
}
test('sitter-dashboard: scoped projection does not expose private fields', async () => {
  const result = await setup().service.read({ actor });
  expect(result.data.items).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.data.kind).toBe('sitter-dashboard');
});
test('sitter-dashboard: forbidden role cannot invoke repository', async () => {
  const { service, repository } = setup();
  await expect(service.read({ actor: { ...actor, roles: ['CUSTOMER'] } })).rejects.toMatchObject({ status: 403 });
  expect(repository.readSnapshot).not.toHaveBeenCalled();
});
test('sitter-dashboard: missing integration stays pending and unknown owner filter is rejected', async () => {
  expect(await createSitterDashboardService().read({ actor })).toMatchObject({ pending: true });
  await expect(setup().service.read({ actor, query: { ownerId: id } })).rejects.toMatchObject({ status: 422 });
});
test('sitter-dashboard: empty source and cursor retained without fake items', async () => {
  const result = await setup({ items: [], nextCursor: 'signed_next' }).service.read({ actor });
  expect(result.data.items).toEqual([]);
  expect(result.data.nextCursor).toBe('signed_next');
});

test('rejects another owner row', async () => {
  await expect(setup({ items: [{ ...row, sitterId: 'b'.repeat(24) }] }).service.read({ actor })).rejects.toMatchObject({ status: 503 });
});
