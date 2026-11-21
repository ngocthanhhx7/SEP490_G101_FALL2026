// JOB-PAY-01 — chỉ kiểm thử runOnce; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createPaymentReminderOverdueJob } from '../../../src/jobs/payment-reminder-overdue.job.js';
const NOW = '2026-11-18T03:00:00.000Z';
function fixture() {
  const row = { paymentId: 'payment-1', paymentStatus: 'UNPAID', holdStatus: 'CLEAR', providerStatus: 'NONE', dueAt: NOW };
  const repository = { findDueUnpaidPayments: jest.fn(async () => [row]) };
  const notifier = { sendPaymentDueReminder: jest.fn(async () => ({ status: 'ACCEPTED' })) };
  const job = createPaymentReminderOverdueJob({ repository, notifier, clock: () => new Date(NOW) });
  return { row, repository, notifier, job };
}

// SRS: JOB-03 dòng 6216–6234; GBR-47: nhắc trước hạn 24 giờ, bỏ qua ON_HOLD và đã thanh toán.
test("JOB-PAY-01-UTCID01 [B] Hóa đơn đến hạn chưa trả được gửi nhắc", async () => {
  const f = fixture();
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 1 });
  expect(f.notifier.sendPaymentDueReminder).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'payment-1' }));
});

// SRS: JOB-03 dòng 6216–6234; GBR-47: nhắc trước hạn 24 giờ, bỏ qua ON_HOLD và đã thanh toán.
test("JOB-PAY-01-UTCID02 [B] Hóa đơn còn 24 giờ tới hạn phải được nhắc", async () => {
  const f = fixture(); f.row.dueAt = new Date(Date.parse(NOW) + 24 * 3600000).toISOString();
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 1 });
});

// SRS: JOB-03 dòng 6216–6234; GBR-47: nhắc trước hạn 24 giờ, bỏ qua ON_HOLD và đã thanh toán.
test("JOB-PAY-01-UTCID03 [A] Hóa đơn On hold không được nhắc", async () => {
  const f = fixture(); f.row.holdStatus = 'ON_HOLD';
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 0, skipped: 1 });
  expect(f.notifier.sendPaymentDueReminder).not.toHaveBeenCalled();
});

// SRS: JOB-03 dòng 6216–6234; GBR-47: nhắc trước hạn 24 giờ, bỏ qua ON_HOLD và đã thanh toán.
test("JOB-PAY-01-UTCID04 [A] Đã thanh toán không được nhắc trả tiền", async () => {
  const f = fixture(); f.row.paymentStatus = 'PAID';
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 0, skipped: 1 });
});

// SRS: JOB-03 dòng 6216–6234; GBR-47: nhắc trước hạn 24 giờ, bỏ qua ON_HOLD và đã thanh toán.
test("JOB-PAY-01-UTCID05 [A] Provider gửi nhắc lỗi không ghi nhận đã nhắc", async () => {
  const f = fixture(); f.notifier.sendPaymentDueReminder.mockRejectedValue(new Error('Synthetic failure'));
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 0, failed: 1 });
});
