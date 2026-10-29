import { test, expect, jest } from '@jest/globals';
import { createSitterListService } from '../../src/services/dashboards/sitter-list.service.js';
const id = 'a'.repeat(24);
const actor = { userId: id, state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 3600000 };
const row = { id, approved: true, displayName: 'Sitter tổng hợp', bio: 'Chăm sóc chó mèo', areas: ['Q1'], reviewCount: 0, rating: null, phone: 'PRIVATE', document: 'PRIVATE' };
function setup(patch = {}) {
  const repository = { readSnapshot: jest.fn(async ({ scope }) => ({ ready: true, scope,
    sourceVersion: 'synthetic-v1', asOf: '2026-10-15T02:00:00Z', policyVersion: 'approved-test', decisionIds: [],
    metrics: {}, items: [row], nextCursor: null, ...patch })) };
  return { repository, service: createSitterListService({ repository }) };
}
test('sitter-list: scoped projection does not expose private fields', async () => {
  const result = await setup().service.read({ actor });
  expect(result.data.items).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.data.kind).toBe('sitter-list');
});
test('sitter-list: forbidden role cannot invoke repository', async () => {
  const { service, repository } = setup();
  await expect(service.read({ actor: { ...actor, roles: ['PET_SITTER'] } })).rejects.toMatchObject({ status: 403 });
  expect(repository.readSnapshot).not.toHaveBeenCalled();
});
test('sitter-list: missing integration stays pending and unknown owner filter is rejected', async () => {
  expect(await createSitterListService().read({ actor })).toMatchObject({ pending: true });
  await expect(setup().service.read({ actor, query: { ownerId: id } })).rejects.toMatchObject({ status: 422 });
});
test('sitter-list: empty source and cursor retained without fake items', async () => {
  const result = await setup({ items: [], nextCursor: 'signed_next' }).service.read({ actor });
  expect(result.data.items).toEqual([]);
  expect(result.data.nextCursor).toBe('signed_next');
});
