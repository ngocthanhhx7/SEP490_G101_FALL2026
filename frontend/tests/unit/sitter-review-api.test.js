import { expect, jest, test } from '@jest/globals';
import { createSitterReviewApi } from '../../src/services/sitter-review-api.js';

const review = { id: 'review-1', kind: 'REVIEW', visitId: 'visit-1', direction: 'SITTER_TO_CUSTOMER', rating: 5, state: 'SUBMITTED' };
test('rates Customer through the sitter direction and preserves idempotency', async () => {
  const request = jest.fn().mockResolvedValue({ data: { review }, meta: { schemaVersion: 1 } });
  const api = createSitterReviewApi({ request, createIdempotencyKey: () => 'sitter-key-1' });
  await expect(api.rateCustomer({ visitId: 'visit-1', expectedVersion: 4, rating: 5, comment: 'Tốt' })).resolves.toMatchObject({ data: { review } });
  expect(request).toHaveBeenCalledWith('/reviews/sitter/visits/visit-1', { method: 'POST', body: { expectedVersion: 4, rating: 5, comment: 'Tốt' }, idempotencyKey: 'sitter-key-1' });
});

test('does not accept a Customer-direction or pending response as a sitter rating', async () => {
  const wrong = jest.fn().mockResolvedValue({ data: { review: { ...review, direction: 'CUSTOMER_TO_SITTER' } } });
  await expect(createSitterReviewApi({ request: wrong, createIdempotencyKey: () => 'sitter-key-2' }).rateCustomer({ visitId: 'visit-1', rating: 4 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const pending = jest.fn().mockResolvedValue({ pending: true, status: 202 });
  await expect(createSitterReviewApi({ request: pending, createIdempotencyKey: () => 'sitter-key-3' }).rateCustomer({ visitId: 'visit-1', rating: 4 })).resolves.toMatchObject({ pending: true });
});
