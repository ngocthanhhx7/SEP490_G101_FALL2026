// NOTIFY-02 — chỉ kiểm thử list; mỗi UTCID là một test riêng.
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
test("NOTIFY-02-UTCID01 [N] Danh sách trả tiêu đề nội dung thời gian và liên kết của mình", async () => {
  const f = fixture();
  await expect(f.service.list({ actor: f.actor })).resolves.toMatchObject({ unreadCount: 1, items: [{ id: f.row.id, title: f.row.title, message: f.row.message, createdAt: f.row.createdAt, deepLink: f.row.deepLink }] });
});

// SRS: UC-88; SRS III.19.1 dòng 5508–5527; GBR-46 dòng 6705–6709.
test("NOTIFY-02-UTCID02 [N] Tab Unread chuyển bộ lọc cùng người dùng hiện tại", async () => {
  const f = fixture();
  await f.service.list({ actor: f.actor, unreadOnly: true });
  expect(f.repository.list).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'customer-1', unreadOnly: true }));
});

// SRS: UC-88; SRS III.19.1 dòng 5508–5527; GBR-46 dòng 6705–6709.
test("NOTIFY-02-UTCID03 [A] Không trả thông báo của người khác dù port chứa dòng đó", async () => {
  const f = fixture(); f.row.recipientId = 'other-customer';
  await expect(f.service.list({ actor: f.actor })).resolves.toMatchObject({ items: [] });
});

// SRS: UC-88; SRS III.19.1 dòng 5508–5527; GBR-46 dòng 6705–6709.
test("NOTIFY-02-UTCID04 [A] Chưa đăng nhập không đọc thông báo", async () => {
  const f = fixture();
  await expect(f.service.list({ actor: null })).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
});
