import { describe, expect, jest, test } from '@jest/globals';
import { createSitterRecommendationApi } from '../../src/services/sitter-recommendation-api.js';
const id = 'a'.repeat(24);
const input = { serviceId: id, petIds: [id], addressId: id, startAt: '2026-11-02T10:00:00+07:00', endAt: '2026-11-02T10:30:00+07:00' };
const result = { status: 'INSUFFICIENT_ELIGIBLE_SITTERS', matchId: id, expiresAt: '2026-11-01T10:00:00Z',
  candidates: [], shortfall: 5, searchTruncated: false, rankingSource: 'EXPLAINABLE_RULES' };
describe('matching API remains independent of prices and invitations', () => {
  test('sends the selection unchanged to recommendations, with no quote or invite request', async () => {
    const request = jest.fn(async () => ({ data: result, status: 201 }));
    const api = createSitterRecommendationApi({ request });
    await expect(api.recommend(input)).resolves.toEqual(result);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/ai/recommendations', { method: 'POST', body: input, signal: undefined });
  });
  test.each([{ ...result, matchId: 'broken' }, { ...result, status: 'ASSIGNED' },
    { ...result, candidates: [{ sitterId: id, score: 999 }] }])('rejects malformed or misleading results', async data => {
    const api = createSitterRecommendationApi({ request: async () => ({ data }) });
    await expect(api.recommend(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('propagates routing or authorization failure instead of inventing an empty list', async () => {
    const failure = Object.assign(new Error(), { code: 'ROUTING_UNAVAILABLE' });
    const api = createSitterRecommendationApi({ request: async () => { throw failure; } });
    await expect(api.recommend(input)).rejects.toBe(failure);
  });
  test('uses matching pet-care endpoints, not the unmounted legacy pet route', async () => {
    const request = jest.fn(async path => ({ data: ({
      '/services': { available: false, services: [] },
      '/pet-care/pets': [{ _id: id, name: 'Miu', species: 'CAT', careNeedsConfirmed: true }],
      '/pet-care/addresses': [{ _id: id, label: 'Home', pointConfirmedAt: '2026-11-01' }],
      '/pet-care/catalog': { breeds: [] }
    })[path] }));
    const api = createSitterRecommendationApi({ request });
    await expect(api.setup()).resolves.toMatchObject({ pets: [{ id, confirmed: true }], addresses: [{ id, confirmed: true }] });
    expect(request.mock.calls.map(call => call[0])).not.toContain('/pets');
  });
});
