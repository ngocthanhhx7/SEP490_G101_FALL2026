// NOTIFY-01 — chỉ kiểm thử publish; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createNotificationService } from '../../../src/services/notifications/notification.service.js';
const NOW = Date.parse('2026-11-18T03:00:00Z');
function fixture() {
  const actor = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE' };
  const row = { id: 'notification-1', recipientId: actor.userId, role: 'CUSTOMER', eventType: 'VISIT_REMINDER', title: 'Lịch chăm sóc sắp bắt đầu', message: 'Vui lòng kiểm tra lịch chăm sóc', createdAt: new Date(NOW).toISOString(), readAt: null, deepLink: '/visits/visit-1' };
  const repository = { list: jest.fn(async () => ({ items: [row], unreadCount: 1, nextCursor: null })),
    markRead: jest.fn(async input => input.recipientId === row.recipientId ? { status: 'READ', readAt: input.readAt } : { status: 'FORBIDDEN' }),
    createEvent: jest.fn(async () => ({ status: 'CREATED', notificationIds: ['notification-1'] })) };
  const service = createNotificationService({ repository, clock: () => NOW });
  return { actor, row, repository, service };
}

// SRS: UC-88; SRS III.19.1 dòng 5508–5527; GBR-46 dòng 6705–6709.
test("NOTIFY-01-UTCID01 [N] Tạo thông báo nghiệp vụ qua kênh in-app", async () => {
  const f = fixture();
  await expect(f.service.publish({ eventId: 'event-1', eventType: 'VISIT_REMINDER', title: f.row.title, message: f.row.message, deepLink: f.row.deepLink, recipients: [{ recipientId: f.actor.userId, role: 'CUSTOMER' }] })).resolves.toMatchObject({ status: 'CREATED', notificationIds: ['notification-1'] });
  expect(f.repository.createEvent).toHaveBeenCalledWith(expect.objectContaining({ channel: 'IN_APP', title: f.row.title, message: f.row.message, deepLink: f.row.deepLink, recipients: [{ recipientId: f.actor.userId, role: 'CUSTOMER' }] }));
});

// SRS: GBR-47 dòng 6710–6714: nhắc visit cho Customer và Sitter.
test("NOTIFY-01-UTCID02 [N] Một nhắc visit có thể gửi tới cả Customer và Sitter", async () => {
  const f = fixture();
  await f.service.publish({ eventId: 'event-2', eventType: 'VISIT_REMINDER', title: f.row.title, message: f.row.message, recipients: [{ recipientId: 'customer-1', role: 'CUSTOMER' }, { recipientId: 'sitter-1', role: 'PET_SITTER' }] });
  expect(f.repository.createEvent.mock.calls[0][0].recipients).toEqual([{ recipientId: 'customer-1', role: 'CUSTOMER' }, { recipientId: 'sitter-1', role: 'PET_SITTER' }]);
});
