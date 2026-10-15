import { expect, jest, test } from '@jest/globals';
import { createSitterReviewService } from '../../src/services/reviews/sitter-review.service.js';

const SITTER = 'sitter-1'; const CUSTOMER = 'customer-1'; const VISIT = 'visit-1';
const actor = (userId, roles) => ({ userId, roles, state: 'ACTIVE', expiresAt: Date.parse('2026-11-01T00:00:00.000Z') });

function setup({ state = 'COMPLETED', existing = null, allow = true } = {}) {
  const data = { now: new Date('2026-10-15T00:00:00.000Z'), visit: { id: VISIT, sitterId: SITTER, customerId: CUSTOMER, state, version: 4 }, review: existing, operations: new Map(), audit: [] };
  const tx = {
    getVisit: async () => data.visit,
    findReview: async query => query.direction === 'SITTER_TO_CUSTOMER' ? data.review : null,
    createReview: async record => { data.review = { ...record, id: 'review-1' }; return data.review; },
    getIdempotencyResult: async identity => data.operations.get(identity.key) ?? null,
    saveIdempotencyResult: async ({ identity, payloadHash, result }) => data.operations.set(identity.key, { payloadHash, result }),
    appendAuditAndOutbox: jest.fn(async event => data.audit.push(event))
  };
  let lock = Promise.resolve();
  const run = (_actor, _id, work) => { const current = lock.then(() => work(tx)); lock = current.then(() => undefined, () => undefined); return current; };
  return { data, tx, repository: { runForVisitActor: run }, policy: { getSitterRatingDecision: jest.fn(async () => ({ allow, decisionIds: ['SITTER-FEEDBACK-V1'], visibility: 'ROLE_SCOPED', reviewState: 'SUBMITTED' })) } };
}

test('rates an assigned completed visit in the sitter direction and replays idempotently', async () => {
  const setupData = setup(); const service = createSitterReviewService({ repository: setupData.repository, policy: setupData.policy, clock: () => setupData.data.now });
  const input = { actor: actor(SITTER, ['PET_SITTER']), visitId: VISIT, expectedVersion: 4, idempotencyKey: 'sitter-key-1', rating: 5, comment: 'Tốt' };
  const result = await service.rateCustomer(input);
  expect(result).toMatchObject({ visitId: VISIT, review: { direction: 'SITTER_TO_CUSTOMER', rating: 5 } });
  expect(setupData.policy.getSitterRatingDecision).toHaveBeenCalled();
  expect(setupData.tx.appendAuditAndOutbox).toHaveBeenCalledWith(expect.objectContaining({ type: 'SitterRatedCustomer' }));
  await expect(service.rateCustomer(input)).resolves.toEqual(result);
});

test('rejects wrong sitter, cancelled visit, duplicate direction and missing policy decision', async () => {
  const wrong = setup(); const wrongService = createSitterReviewService({ repository: wrong.repository, policy: wrong.policy, clock: () => wrong.data.now });
  await expect(wrongService.rateCustomer({ actor: actor('other', ['PET_SITTER']), visitId: VISIT, idempotencyKey: 'sitter-key-2', rating: 4 })).rejects.toMatchObject({ status: 404 });
  const cancelled = setup({ state: 'CANCELLED' }); const cancelledService = createSitterReviewService({ repository: cancelled.repository, policy: cancelled.policy, clock: () => cancelled.data.now });
  await expect(cancelledService.rateCustomer({ actor: actor(SITTER, ['PET_SITTER']), visitId: VISIT, idempotencyKey: 'sitter-key-3', rating: 4 })).rejects.toMatchObject({ code: 'VISIT_NOT_ELIGIBLE' });
  const duplicate = setup({ existing: { id: 'review-1', direction: 'SITTER_TO_CUSTOMER' } }); const duplicateService = createSitterReviewService({ repository: duplicate.repository, policy: duplicate.policy, clock: () => duplicate.data.now });
  await expect(duplicateService.rateCustomer({ actor: actor(SITTER, ['PET_SITTER']), visitId: VISIT, idempotencyKey: 'sitter-key-4', rating: 4 })).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });
  const undecided = setup({ allow: false }); const undecidedService = createSitterReviewService({ repository: undecided.repository, policy: undecided.policy, clock: () => undecided.data.now });
  await expect(undecidedService.rateCustomer({ actor: actor(SITTER, ['PET_SITTER']), visitId: VISIT, idempotencyKey: 'sitter-key-5', rating: 4 })).rejects.toMatchObject({ code: 'DECISION_REQUIRED' });
});

test('fails closed when the policy omits visibility or moderation state', async () => {
  const missingFields = setup();
  missingFields.policy.getSitterRatingDecision.mockResolvedValue({ allow: true, decisionIds: ['SITTER-FEEDBACK-V1'] });
  const service = createSitterReviewService({ repository: missingFields.repository, policy: missingFields.policy, clock: () => missingFields.data.now });
  await expect(service.rateCustomer({ actor: actor(SITTER, ['PET_SITTER']), visitId: VISIT, idempotencyKey: 'sitter-key-6', rating: 4 }))
    .rejects.toMatchObject({ code: 'DECISION_REQUIRED' });
  expect(missingFields.data.review).toBeNull();
});
