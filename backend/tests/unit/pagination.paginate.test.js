import { expect, test } from '@jest/globals';
import { paginate } from '../../src/services/pagination.service.js';

const model = ({ items = [], total = items.length, failCount = false } = {}) => {
  const calls = [];
  const query = { sort: value => (calls.push(['sort', value]), query), skip: value => (calls.push(['skip', value]), query), limit: value => (calls.push(['limit', value]), query), lean: async () => items };
  return { calls, find: filter => (calls.push(['find', filter]), query), countDocuments: async filter => {
    calls.push(['count', filter]); if (failCount) throw Error('count failed'); return total;
  } };
};

test('UTCID01 applies the same filter to list and total with the calculated offset', async () => {
  const source = model({ items: [{ id: '1' }], total: 21 });
  await expect(paginate(source, { filter: { state: 'ACTIVE' }, sort: { id: 1 }, page: 2, limit: 20 }))
    .resolves.toEqual({ items: [{ id: '1' }], page: 2, limit: 20, total: 21 });
  expect(source.calls).toEqual([['find', { state: 'ACTIVE' }], ['sort', { id: 1 }], ['skip', 20], ['limit', 20], ['count', { state: 'ACTIVE' }]]);
});
test('UTCID02 returns an empty page past the end without changing total', async () => {
  await expect(paginate(model({ total: 1 }), { sort: { id: 1 }, page: 2, limit: 1 })).resolves.toEqual({ items: [], page: 2, limit: 1, total: 1 });
});
test('UTCID03 propagates a count failure', async () => {
  await expect(paginate(model({ failCount: true }), { sort: {}, page: 1, limit: 1 })).rejects.toThrow('count failed');
});
test('UTCID04 applies collation only to the page query', async () => {
  const source = model();
  const query = source.find({});
  query.collation = value => (source.calls.push(['collation', value]), query);
  await paginate(source, { sort: { name: 1 }, collation: { locale: 'vi' }, page: 1, limit: 1 });
  expect(source.calls).toContainEqual(['collation', { locale: 'vi' }]);
});
