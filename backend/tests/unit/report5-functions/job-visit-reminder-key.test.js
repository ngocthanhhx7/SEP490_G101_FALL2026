// JOB-VISIT-02 — chỉ kiểm thử visitReminderKey; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { visitReminderKey } from '../../../src/jobs/visit-reminder.job.js';
const NOW = new Date('2026-11-18T03:00:00.000Z');
function visit(lead = 120) { return { visitId: 'visit-1', bookingId: 'booking-1', state: 'ASSIGNED', customerId: 'customer-1', sitterId: 'sitter-1', scheduleVersion: 1, startAt: new Date(+NOW + lead * 60000).toISOString() }; }


// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-02-UTCID01 [N] Cùng buổi và lịch tạo cùng khóa để chống nhắc trùng", async () => {
  const row = visit();
  expect(visitReminderKey(row.visitId, 1, row.startAt, 120)).toBe(visitReminderKey(row.visitId, 1, row.startAt, 120));
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-02-UTCID02 [N] Buổi khác không dùng chung khóa nhắc", async () => {
  const row = visit();
  expect(visitReminderKey('visit-1', 1, row.startAt, 120)).not.toBe(visitReminderKey('visit-2', 1, row.startAt, 120));
});
