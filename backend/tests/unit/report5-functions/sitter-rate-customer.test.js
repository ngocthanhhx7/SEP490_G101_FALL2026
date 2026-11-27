// SITTER-REVIEW-02 — chỉ kiểm thử rateCustomer; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createSitterReviewService as createReviewService } from '../../../src/services/reviews/sitter-review.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z');
const actor = (id, role) => ({ userId: id, roles: [role], state: 'ACTIVE', expiresAt: NOW + 86400000 });
function fixture() {
  const state = { visit: { id: 'visit-1', customerId: 'customer-1', sitterId: 'sitter-1', state: 'COMPLETED', version: 1,
    endAt: new Date(NOW - 86400000), completedAt: new Date(NOW - 86400000) }, existing: null };
  const tx = { getVisit: async () => state.visit, findReview: async () => state.existing,
    createReview: jest.fn(async record => record), appendAuditAndOutbox: jest.fn(async () => {}),
    getIdempotencyResult: async () => null, saveIdempotencyResult: async () => {} };
  const service = createReviewService({ repository: { runForVisitActor: async (_a, _id, work) => work(tx) }, clock: () => NOW, policy: { getSitterRatingDecision: async () => ({ allow: true, visibility: 'ROLE_SCOPED', reviewState: 'SUBMITTED' }) } });
  const input = { actor: actor('customer-1', 'CUSTOMER'), visitId: 'visit-1', expectedVersion: 1,
    idempotencyKey: 'synthetic-rating-key', rating: 5, comment: 'Chăm sóc chu đáo' };
  return { service, input, state, tx };
}

// SRS: GBR-48, dòng 6715–6718; SRS III.18.1.1 dòng 5409: Pet sitters do not rate customers.
test("SITTER-REVIEW-02-UTCID01 [A] Sitter không được đánh giá Customer kể cả policy legacy cho phép", async () => {
  const f = fixture(); f.input.actor = actor('sitter-1', 'PET_SITTER');
  await expect(f.service.rateCustomer(f.input)).rejects.toBeDefined();
  expect(f.tx.createReview).not.toHaveBeenCalled();
});
