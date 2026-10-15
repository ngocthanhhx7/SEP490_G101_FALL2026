import { expect, jest, test } from '@jest/globals';
import { createReviewService } from '../../src/services/reviews/review.service.js';

const NOW = new Date('2026-10-15T00:00:00.000Z');
const CUSTOMER = 'customer-1'; const SITTER = 'sitter-1'; const VISIT = 'visit-1';
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: NOW.getTime() + 3600000 });

function setup(state = 'COMPLETED') {
  const data = { visit: { id: VISIT, customerId: CUSTOMER, sitterId: SITTER, state, version: 2, completedAt: '2026-10-14T00:00:00.000Z' }, reviews: [], operations: new Map(), audit: [] };
  const tx = {
    getVisit: async () => data.visit,
    findReview: async ({ visitId }) => data.reviews.find(item => item.visitId === visitId),
    createReview: async record => { data.reviews.push(record); return record; },
    getIdempotencyResult: async identity => data.operations.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => data.operations.set(identity.key, { payloadHash, result }),
    appendAuditAndOutbox: jest.fn(async item => data.audit.push(item))
  };
  return { data, tx, repository: { runForVisitActor: async (_actor, _id, work) => work(tx) } };
}

test('rates one completed visit and returns a private role-scoped projection', async () => {
  const { data, repository, tx } = setup();
  const service = createReviewService({ repository, clock: () => NOW });
  const result = await service.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 2, idempotencyKey: 'review-key-1', rating: 5, comment: 'Rất tốt', tags: ['Punctual'] });
  expect(result).toMatchObject({ visitId: VISIT, state: 'SUBMITTED', review: { rating: 5, comment: 'Rất tốt' } });
  expect(result.review).not.toHaveProperty('customerId');
  expect(tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'VisitRated' }));
  expect(data.reviews).toHaveLength(1);
  expect(await service.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT,
    expectedVersion: 2, idempotencyKey: 'review-key-1', rating: 5, comment: 'Rất tốt', tags: ['Punctual'] })).toEqual(result);
});

test.each([
  ['wrong Customer', actor('other-customer', ['CUSTOMER']), 404],
  ['Staff actor', actor('staff-1', ['STAFF']), 403],
])('rejects %s before writing', async (_name, current, status) => {
  const { repository, data } = setup(); const service = createReviewService({ repository, clock: () => NOW });
  await expect(service.rateVisit({ actor: current, visitId: VISIT, idempotencyKey: 'review-key-2', rating: 4 })).rejects.toMatchObject({ status });
  expect(data.reviews).toHaveLength(0);
});

test('requires completed or Staff-closed state and rejects stale versions', async () => {
  const pending = setup('ASSIGNED');
  const service = createReviewService({ repository: pending.repository, clock: () => NOW });
  await expect(service.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'review-key-3', rating: 3 })).rejects.toMatchObject({ code: 'VISIT_NOT_ELIGIBLE' });
  const closed = setup('STAFF_CLOSED'); const closedService = createReviewService({ repository: closed.repository, clock: () => NOW });
  await expect(closedService.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, expectedVersion: 1, idempotencyKey: 'review-key-4', rating: 3 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});

test('validates rating and idempotency conflicts', async () => {
  const { repository } = setup(); const service = createReviewService({ repository, clock: () => NOW });
  await expect(service.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'short', rating: 5 })).rejects.toMatchObject({ status: 422 });
  await expect(service.rateVisit({ actor: actor(CUSTOMER, ['CUSTOMER']), visitId: VISIT, idempotencyKey: 'review-key-5', rating: 6 })).rejects.toMatchObject({ status: 422 });
});
