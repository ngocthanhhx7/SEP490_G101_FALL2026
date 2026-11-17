// Một file chỉ gọi paymentModeForOriginalVisitCount; xem giới hạn kiểm thử trong README.
import { test, expect } from '@jest/globals';
import { paymentModeForOriginalVisitCount } from '../../../src/services/billing/billing.service.js';

// SRS: UC-25 Description/Postconditions; III.7.1; UC-49 — không thu trước booking.
test("BILL-01-UTCID01 [B] Booking một lượt thanh toán sau khi kết thúc", () => {
  expect(paymentModeForOriginalVisitCount(1)).toBe('POSTPAY');
});

// SRS: UC-25 Description/Postconditions; III.7.1; GBR-17 — không phân biệt trả trước theo số lượt.
// Defect: DEF_BILL_PAYMENT_MODE_01 — giữ expected theo SRS, không skip/failing.
test("BILL-01-UTCID02 [N] Booking hai lượt vẫn thanh toán sau khi kết thúc", () => {
  expect(paymentModeForOriginalVisitCount(2)).toBe('POSTPAY');
});

// SRS: GBR-09 — biên suy ra 30 ngày × 2; UC-25/GBR-17 — trả sau booking.
// Defect: DEF_BILL_PAYMENT_MODE_01 — giữ expected theo SRS, không skip/failing.
test("BILL-01-UTCID03 [B] Booking đủ 60 lượt vẫn thanh toán sau khi kết thúc", () => {
  expect(paymentModeForOriginalVisitCount(60)).toBe('POSTPAY');
});
