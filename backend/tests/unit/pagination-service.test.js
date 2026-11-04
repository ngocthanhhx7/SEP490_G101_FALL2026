import { describe, test, expect } from '@jest/globals';
import { paginate } from '../../src/services/pagination.service.js';

// A stand-in for a Mongoose model that records how the page was asked for.
function fakeModel({ rows = [], total = rows.length } = {}) {
  const calls = { find: [], sort: [], skip: [], limit: [], count: [], collation: [] };
  const query = {
    collation(value) { calls.collation.push(value); return this; },
    sort(value) { calls.sort.push(value); return this; },
    skip(value) { calls.skip.push(value); return this; },
    limit(value) { calls.limit.push(value); return this; },
    lean: async () => rows
  };
  return {
    calls,
    find(filter) { calls.find.push(filter); return query; },
    countDocuments: async (filter) => { calls.count.push(filter); return total; }
  };
}

describe('paginate', () => {
  test('asks for the page by skipping the earlier ones, and counts with the same filter', async () => {
    const model = fakeModel({ rows: [{ n: 1 }, { n: 2 }], total: 45 });
    const result = await paginate(model, { filter: { status: 'ACTIVE' }, sort: { name: 1 }, page: 3, limit: 20 });
    expect(result).toEqual({ items: [{ n: 1 }, { n: 2 }], page: 3, limit: 20, total: 45 });
    expect(model.calls).toEqual({ find: [{ status: 'ACTIVE' }], sort: [{ name: 1 }], skip: [40], limit: [20], count: [{ status: 'ACTIVE' }], collation: [] });
  });

  test('the first page skips nothing', async () => {
    const model = fakeModel({ rows: [{ n: 1 }], total: 1 });
    await paginate(model, { filter: {}, sort: { code: 1 }, page: 1, limit: 50 });
    expect(model.calls.skip).toEqual([0]);
    expect(model.calls.limit).toEqual([50]);
  });

  test('without a filter every row is listed and counted', async () => {
    const model = fakeModel({ rows: [], total: 7 });
    const result = await paginate(model, { sort: { code: 1 }, page: 1, limit: 20 });
    expect(result.total).toBe(7);
    expect(model.calls.find).toEqual([{}]);
    expect(model.calls.count).toEqual([{}]);
  });

  test('a page past the end is empty and still reports the real total, so the screen can step back', async () => {
    const model = fakeModel({ rows: [], total: 5 });
    const result = await paginate(model, { filter: {}, sort: { code: 1 }, page: 4, limit: 2 });
    expect(result).toEqual({ items: [], page: 4, limit: 2, total: 5 });
    expect(model.calls.skip).toEqual([6]);
  });

  test('a collation, when given, orders the page and is not used for the count', async () => {
    const model = fakeModel({ rows: [{ n: 1 }], total: 1 });
    await paginate(model, { sort: { name: 1 }, collation: { locale: 'vi' }, page: 1, limit: 20 });
    expect(model.calls.collation).toEqual([{ locale: 'vi' }]);
    expect(model.calls.count).toEqual([{}]);
  });

  test('a failing count or query is passed on, not swallowed', async () => {
    const model = fakeModel();
    model.countDocuments = async () => { throw new Error('count failed'); };
    await expect(paginate(model, { sort: {}, page: 1, limit: 1 })).rejects.toThrow('count failed');
  });
});
