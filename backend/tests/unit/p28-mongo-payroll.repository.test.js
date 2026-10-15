import { describe, test, expect, jest } from '@jest/globals';
import { createMongoPayrollRepository } from '../../src/services/dashboards/mongo-payroll.repository.js';

const secret = 's'.repeat(32);
const scope = { kind: 'payroll', userId: 'admin-1', targetId: 'admin-1' };
const source = {
  asOf: new Date('2026-10-15T03:00:00.000Z'),
  policyVersions: ['fin-v1'], total: 2
};
const rows = [
  { id: 'request-2', sitterId: 'sitter-2', status: 'APPROVED', amountVnd: 20000,
    requestWeekKey: '2026-10-12', submittedAt: new Date('2026-10-15T02:00:00.000Z'),
    updatedAt: new Date('2026-10-15T02:30:00.000Z'), policyVersion: 'fin-v1', decisionVersion: 'decision-1',
    displayName: 'Beta sitter', transferRecordedAt: null },
  { id: 'request-1', sitterId: 'sitter-1', status: 'PAID', amountVnd: 10000,
    requestWeekKey: '2026-10-05', submittedAt: new Date('2026-10-14T02:00:00.000Z'),
    updatedAt: new Date('2026-10-14T02:30:00.000Z'), policyVersion: 'fin-v1', decisionVersion: 'decision-1',
    displayName: 'Alpha sitter', transferRecordedAt: new Date('2026-10-15T02:45:00.000Z') }
];

function harness(result = { items: rows, source: [source] }, aggregateShape = 'cursor') {
  const aggregateResult = aggregateShape === 'promise'
    ? Promise.resolve([result])
    : aggregateShape === 'exec'
      ? { exec: async () => [result] }
      : { toArray: async () => [result] };
  const requests = { aggregate: jest.fn(() => aggregateResult) };
  return { requests, repository: createMongoPayrollRepository({ requests, cursorSecret: secret }) };
}

describe('durable P28 payroll Mongo adapter', () => {
  test('projects a bounded persisted page and signs a scope/query cursor', async () => {
    const { requests, repository } = harness();
    const snapshot = await repository.readSnapshot({ scope, query: {
      from: '2026-10-01', to: '2026-10-31', limit: 1, search: '', timeZone: 'Asia/Ho_Chi_Minh'
    } });
    expect(snapshot).toMatchObject({ ready: true, scope, policyVersion: 'fin-v1', decisionIds: [] });
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({ id: 'request-2', displayName: 'Beta sitter', state: 'APPROVED' });
    expect(snapshot.items[0]).not.toHaveProperty('policyVersion');
    expect(snapshot.items[0]).not.toHaveProperty('decisionVersion');
    expect(snapshot.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(snapshot.sourceVersion).toMatch(/^settlement-request\//);
    const pipeline = requests.aggregate.mock.calls[0][0];
    expect(requests.aggregate.mock.calls[0][1]).toEqual({ allowDiskUse: false });
    expect(pipeline[0].$match.submittedAt.$gte).toEqual(new Date('2026-09-30T17:00:00.000Z'));
    expect(pipeline.at(-1).$facet.items[0].$limit).toBe(2);
  });

  test('binds cursor to scope and query and rejects tampering', async () => {
    const { repository } = harness();
    const query = { limit: 1, search: '', timeZone: 'Asia/Ho_Chi_Minh' };
    const first = await repository.readSnapshot({ scope, query });
    await expect(repository.readSnapshot({ scope: { ...scope, userId: 'other-admin' },
      query: { ...query, cursor: first.nextCursor } })).rejects.toMatchObject({ status: 422 });
    const tampered = `${first.nextCursor.slice(0, -1)}${first.nextCursor.endsWith('A') ? 'B' : 'A'}`;
    await expect(repository.readSnapshot({ scope, query: { ...query, cursor: tampered } }))
      .rejects.toMatchObject({ status: 422 });
  });

  test('uses escaped literal search and does not expose transfer evidence', async () => {
    const { requests, repository } = harness();
    await repository.readSnapshot({ scope, query: { limit: 20, search: 'a+b', timeZone: 'Asia/Ho_Chi_Minh' } });
    const pipeline = requests.aggregate.mock.calls[0][0];
    const search = pipeline.find(stage => stage.$match?.['sitter.displayName']);
    expect(search.$match['sitter.displayName'].$regex).toBe('a\\+b');
    expect(JSON.stringify(pipeline)).not.toContain('evidenceReference');
  });

  test.each(['promise', 'exec'])('supports %s aggregate return shape used by Mongoose adapters', async aggregateShape => {
    const { repository } = harness(undefined, aggregateShape);
    await expect(repository.readSnapshot({ scope, query: { limit: 1 } }))
      .resolves.toMatchObject({ ready: true, items: [{ id: 'request-2' }] });
  });

  test.each([
    { items: [], source: [] },
    { items: [{ ...rows[0], displayName: null }], source: [source] },
    { items: [{ ...rows[0], policyVersion: '' }], source: [{ ...source, policyVersions: [null] }] },
    { items: [{ ...rows[0], decisionVersion: null }], source: [source] }
  ])('fails closed when persisted source is incomplete: %j', async result => {
    const { repository } = harness(result);
    await expect(repository.readSnapshot({ scope, query: { limit: 20 } }))
      .resolves.toEqual({ ready: false });
  });
});
