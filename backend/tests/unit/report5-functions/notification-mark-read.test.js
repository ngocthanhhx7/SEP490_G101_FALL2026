// NOTIFY-03 — chỉ kiểm thử markRead; mỗi UTCID là một test riêng.
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
test("NOTIFY-03-UTCID01 [N] Đánh dấu thông báo của mình đã đọc", async () => {
  const f = fixture();
  await expect(f.service.markRead({ actor: f.actor, notificationId: f.row.id })).resolves.toMatchObject({ status: 'READ', notificationId: f.row.id, readAt: new Date(NOW).toISOString() });
  expect(f.repository.markRead).toHaveBeenCalledWith(expect.objectContaining({ recipientId: f.actor.userId, notificationId: f.row.id }));
});

// SRS: UC-88; SRS III.19.1 dòng 5508–5527; GBR-46 dòng 6705–6709.
test("NOTIFY-03-UTCID02 [A] Không đánh dấu thông báo của người khác", async () => {
  const f = fixture(); f.row.recipientId = 'other-customer';
  await expect(f.service.markRead({ actor: f.actor, notificationId: f.row.id })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
