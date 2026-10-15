import { expect, jest, test } from '@jest/globals';
import { createReviewApi } from '../../src/services/review-api.js';

const visitId = 'visit-1';
const response = { data: { review: { id: 'review-1', visitId, rating: 5, state: 'SUBMITTED', kind: 'REVIEW' } }, meta: { schemaVersion: 1 } };

test('rates a visit using the reviews route and idempotency key', async () => {
  const request = jest.fn().mockResolvedValue(response);
  const api = createReviewApi({ request, createIdempotencyKey: () => 'review-key-1' });
  await expect(api.rateVisit({ visitId, expectedVersion: 2, rating: 5, comment: 'Tốt' })).resolves.toEqual(response);
  expect(request).toHaveBeenCalledWith('/reviews/visits/visit-1', { method: 'POST', body: { expectedVersion: 2, rating: 5, comment: 'Tốt' }, expectedVersion: undefined, idempotencyKey: 'review-key-1' });
});

test.each([{ rating: 0 }, { rating: 6 }, { rating: 2.5 }])('rejects invalid rating %j before request', async input => {
  const request = jest.fn(); const api = createReviewApi({ request, createIdempotencyKey: () => 'review-key-2' });
  await expect(api.rateVisit({ visitId, ...input })).rejects.toMatchObject({ code: 'INVALID_RATING' });
  expect(request).not.toHaveBeenCalled();
});

test('fails closed when a response includes a wrong visit or pending state is returned', async () => {
  const pending = jest.fn().mockResolvedValue({ pending: true, status: 202 });
  await expect(createReviewApi({ request: pending, createIdempotencyKey: () => 'review-key-3' }).rateVisit({ visitId, rating: 4 })).resolves.toMatchObject({ pending: true });
  const wrong = jest.fn().mockResolvedValue({ data: { review: { id: 'review-1', visitId: 'other', rating: 4, state: 'SUBMITTED' } }, meta: { schemaVersion: 1 } });
  await expect(createReviewApi({ request: wrong, createIdempotencyKey: () => 'review-key-4' }).rateVisit({ visitId, rating: 4 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
