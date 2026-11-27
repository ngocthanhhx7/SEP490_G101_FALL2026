// Một file chỉ gọi paymentModeForOriginalVisitCount; xem giới hạn kiểm thử trong README.
import { test, expect } from '@jest/globals';
import { paymentModeForOriginalVisitCount } from '../../../src/services/billing/billing.service.js';

// SRS: UC-25 Description/Postconditions; III.7.1; UC-49 — không thu trước booking.
test("BILL-01-UTCID01 [B] Booking một lượt thanh toán sau khi kết thúc", () => {
  expect(paymentModeForOriginalVisitCount(1)).toBe('POSTPAY');
});

// SRS: GBR-17; approved-decisions: booking từ hai lượt trở lên thanh toán trả trước PREPAY.
test("BILL-01-UTCID02 [N] Booking hai lượt áp dụng thanh toán trả trước PREPAY", () => {
  expect(paymentModeForOriginalVisitCount(2)).toBe('PREPAY');
});

// SRS: GBR-09/17 — biên 60 lượt áp dụng thanh toán trả trước PREPAY.
test("BILL-01-UTCID03 [B] Booking đủ 60 lượt áp dụng thanh toán trả trước PREPAY", () => {
  expect(paymentModeForOriginalVisitCount(60)).toBe('PREPAY');
});
