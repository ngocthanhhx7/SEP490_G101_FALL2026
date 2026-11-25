// JOB-VISIT-03 — chỉ kiểm thử runOnce; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createVisitReminderJob } from '../../../src/jobs/visit-reminder.job.js';
const NOW = new Date('2026-11-18T03:00:00.000Z');
function visit(lead = 120) { return { visitId: 'visit-1', bookingId: 'booking-1', state: 'ASSIGNED', customerId: 'customer-1', sitterId: 'sitter-1', scheduleVersion: 1, startAt: new Date(+NOW + lead * 60000).toISOString() }; }
function fixture(leadMinutes = 120) {
  const row = visit();
  const repository = { findUpcomingVisits: jest.fn(async () => [row]), createReminderAtomically: jest.fn(async () => ({ status: 'CREATED' })), markReminderDelivered: jest.fn(async () => {}), markReminderFailed: jest.fn(async () => {}) };
  const notifier = { sendVisitReminder: jest.fn(async () => ({ status: 'ACCEPTED' })) };
  const job = createVisitReminderJob({ repository, notifier, clock: () => NOW, ...(leadMinutes === undefined ? {} : { leadMinutes }) });
  return { row, repository, notifier, job };
}

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-03-UTCID01 [N] Gửi nhắc hai bên và đánh dấu sau khi chấp nhận", async () => {
  const f = fixture();
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 1, failed: 0 });
  expect(f.notifier.sendVisitReminder).toHaveBeenCalledWith(expect.objectContaining({ recipients: ['customer-1','sitter-1'], leadMinutes: 120 }));
  expect(f.repository.markReminderDelivered).toHaveBeenCalledTimes(1);
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-03-UTCID02 [A] Gửi lỗi không ghi marker thành công để còn thử lại", async () => {
  const f = fixture(); f.notifier.sendVisitReminder.mockRejectedValue(new Error('Synthetic failure'));
  await expect(f.job.runOnce()).resolves.toMatchObject({ reminded: 0, failed: 1 });
  expect(f.repository.markReminderDelivered).not.toHaveBeenCalled(); expect(f.repository.markReminderFailed).toHaveBeenCalledTimes(1);
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-03-UTCID03 [N] Đã nhắc trước đó không gửi lần nữa", async () => {
  const f = fixture(); f.repository.createReminderAtomically.mockResolvedValue({ status: 'DELIVERED' });
  await expect(f.job.runOnce()).resolves.toMatchObject({ alreadyHandled: 1, reminded: 0 });
  expect(f.notifier.sendVisitReminder).not.toHaveBeenCalled();
});
