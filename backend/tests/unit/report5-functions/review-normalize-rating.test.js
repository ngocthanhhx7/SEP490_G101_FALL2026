// REVIEW-01 — chỉ kiểm thử normalizeRating; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { normalizeRating } from '../../../src/services/reviews/review.service.js';

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID01 [B] Chấp nhận mức thấp nhất 1 sao", async () => {
  expect(normalizeRating({ rating: 1 }).rating).toBe(1);
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID02 [N] Chấp nhận 3 sao kèm nhận xét", async () => {
  expect(normalizeRating({ rating: 3, comment: 'Cần đúng giờ hơn' })).toMatchObject({ rating: 3, comment: 'Cần đúng giờ hơn' });
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID03 [B] Chấp nhận mức cao nhất 5 sao", async () => {
  expect(normalizeRating({ rating: 5 }).rating).toBe(5);
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID04 [B] Từ chối 0 sao dưới biên", async () => {
  expect(() => normalizeRating({ rating: 0 })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID05 [B] Từ chối 6 sao trên biên", async () => {
  expect(() => normalizeRating({ rating: 6 })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID06 [A] Thiếu số sao bắt buộc không hợp lệ", async () => {
  expect(() => normalizeRating({})).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});

// SRS: SRS III.18.1.1, dòng 5406–5418: từ 1 đến 5 sao, bắt buộc số sao, nhận xét tùy chọn.
test("REVIEW-01-UTCID07 [N] Nhận xét được để trống", async () => {
  expect(normalizeRating({ rating: 4 })).toMatchObject({ rating: 4, comment: null });
});
