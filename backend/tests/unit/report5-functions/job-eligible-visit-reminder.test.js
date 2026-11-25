// JOB-VISIT-01 — chỉ kiểm thử isEligibleVisitReminder; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { isEligibleVisitReminder } from '../../../src/jobs/visit-reminder.job.js';
const NOW = new Date('2026-11-18T03:00:00.000Z');
function visit(lead = 120) { return { visitId: 'visit-1', bookingId: 'booking-1', state: 'ASSIGNED', customerId: 'customer-1', sitterId: 'sitter-1', scheduleVersion: 1, startAt: new Date(+NOW + lead * 60000).toISOString() }; }


// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-01-UTCID01 [B] Đúng 2 giờ trước buổi đã có sitter thì đủ điều kiện", async () => {
  expect(isEligibleVisitReminder(visit(), NOW, 120)).toMatchObject({ visitId: 'visit-1', recipients: ['customer-1','sitter-1'] });
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-01-UTCID02 [B] Sớm hơn 2 giờ chưa nhắc", async () => {
  expect(isEligibleVisitReminder(visit(120 + 1 / 60000), NOW, 120)).toBeNull();
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-01-UTCID03 [A] Buổi đã hủy không đủ điều kiện nhắc", async () => {
  expect(isEligibleVisitReminder({ ...visit(), state: 'CANCELLED' }, NOW, 120)).toBeNull();
});

// SRS: JOB-01 dòng 6179–6194; GBR-47 dòng 6710–6714: nhắc Customer và Sitter 2 giờ trước visit, một lần, không nhắc nếu hủy/chưa có sitter.
test("JOB-VISIT-01-UTCID04 [A] Buổi chưa có sitter không đủ điều kiện nhắc", async () => {
  expect(isEligibleVisitReminder({ ...visit(), state: 'DISPATCH_PENDING', sitterId: null }, NOW, 120)).toBeNull();
});
