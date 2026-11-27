// REVIEW-02 — chỉ kiểm thử rateVisit; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createReviewService } from '../../../src/services/reviews/review.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z');
const actor = (id, role) => ({ userId: id, roles: [role], state: 'ACTIVE', expiresAt: NOW + 86400000 });
function fixture() {
  const state = { visit: { id: 'visit-1', customerId: 'customer-1', sitterId: 'sitter-1', state: 'COMPLETED', version: 1,
    endAt: new Date(NOW - 86400000), completedAt: new Date(NOW - 86400000) }, existing: null };
  const tx = { getVisit: async () => state.visit, findReview: async () => state.existing,
    createReview: jest.fn(async record => record), appendAuditAndOutbox: jest.fn(async () => {}),
    getIdempotencyResult: async () => null, saveIdempotencyResult: async () => {} };
  const service = createReviewService({ repository: { runForVisitActor: async (_a, _id, work) => work(tx) }, clock: () => NOW });
  const input = { actor: actor('customer-1', 'CUSTOMER'), visitId: 'visit-1', expectedVersion: 1,
    idempotencyKey: 'synthetic-rating-key', rating: 5, comment: 'Chăm sóc chu đáo' };
  return { service, input, state, tx };
}

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID01 [N] Customer đánh giá buổi đã hoàn tất của mình", async () => {
  const f = fixture();
  const actual = await f.service.rateVisit(f.input);
  expect(actual.review).toMatchObject({ rating: 5, comment: 'Chăm sóc chu đáo' });
  expect(f.tx.createReview).toHaveBeenCalledTimes(1);
});

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID02 [A] Không được đánh giá lần thứ hai cho cùng buổi", async () => {
  const f = fixture(); f.state.existing = { id: 'old-review' };
  await expect(f.service.rateVisit(f.input)).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS', status: 409 });
  expect(f.tx.createReview).not.toHaveBeenCalled();
});

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID03 [A] Buổi chưa hoàn tất chưa được đánh giá", async () => {
  const f = fixture(); f.state.visit.state = 'IN_PROGRESS';
  await expect(f.service.rateVisit(f.input)).rejects.toMatchObject({ code: 'VISIT_NOT_ELIGIBLE', status: 409 });
});

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID04 [A] Customer không đánh giá buổi của người khác", async () => {
  const f = fixture(); f.input.actor = actor('other-customer', 'CUSTOMER');
  await expect(f.service.rateVisit(f.input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID05 [B] Đúng 7 ngày sau kết thúc còn được đánh giá", async () => {
  const f = fixture();
  f.state.visit.endAt = f.state.visit.completedAt = new Date(NOW - 7 * 86400000);
  await expect(f.service.rateVisit(f.input)).resolves.toMatchObject({ review: { rating: 5 } });
});

// SRS: UC-87; GBR-48, dòng 6715–6718; SRS III.18.1.1, dòng 5406–5424.
test("REVIEW-02-UTCID06 [B] Sau 7 ngày không còn được gửi đánh giá", async () => {
  const f = fixture();
  f.state.visit.endAt = f.state.visit.completedAt = new Date(NOW - 7 * 86400000 - 1);
  await expect(f.service.rateVisit(f.input)).rejects.toBeDefined();
  expect(f.tx.createReview).not.toHaveBeenCalled();
});
