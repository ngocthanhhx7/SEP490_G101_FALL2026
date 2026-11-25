import { test, expect } from '@jest/globals';
import { createCustomerBookingsService } from '../../../src/services/customer-bookings.service.js';
const OWNER = '111111111111111111111111';
const OTHER = '222222222222222222222222';
const ACTOR = { userId: OWNER, roles: ['CUSTOMER'], state: 'ACTIVE' };
const NOW = new Date('2026-11-15T03:00:00.000Z');
function fixture({ empty = false, overdue = false } = {}) {
  const rows = empty ? [] : [
    { _id: '333333333333333333333333', customerId: OWNER, state: overdue ? 'AWAITING_PAYMENT' : 'CONFIRMED',
      createdAt: new Date('2026-11-12T03:00:00Z'), paymentDeadlineAt: new Date(NOW.getTime() - 1),
      billFinalizedAt: new Date(NOW.getTime() - 48 * 3600000 - 1),
      paymentSnapshot: { amountVnd: 120000 }, checkoutSnapshot: { customerVisits: [
        { startAt: new Date('2026-11-12T04:00:00Z'), snapshots: { pets: [{ name: 'Milo' }], serviceName: 'Chăm sóc tại nhà' } }] } },
    { _id: '444444444444444444444444', customerId: OWNER, state: 'PAID', createdAt: NOW,
      checkoutSnapshot: { customerVisits: [] } },
    { _id: '555555555555555555555555', customerId: OTHER, state: 'CONFIRMED', createdAt: NOW }
  ];
  const connection = { db: {
    listCollections: () => ({ toArray: async () => [{ name: 'bookings' }] }),
    collection: () => ({ find: filter => {
      let limit = Infinity;
      const q = { sort: () => q, limit: n => { limit = n; return q; }, toArray: async () =>
        rows.filter(row => row.customerId === String(filter.customerId)
          && (!filter.state || row.state === filter.state)
          && (!filter._id || row._id < String(filter._id.$lt)))
          .sort((a, b) => b._id.localeCompare(a._id)).slice(0, limit) };
      return q;
    } })
  } };
  return { list: createCustomerBookingsService({ connection, enabled: true,
    cursorSecret: 'synthetic-booking-cursor-secret-32-bytes', clock: () => NOW.getTime() }).list };
}

// SRS: UC-26; III.7.1.2 Booking List; GBR-01/02.
test("BKG-HISTORY-01-UTCID01 [N] Chỉ trả booking mình theo thứ tự mới nhất và thông tin dịch vụ", async () => {
  const f = fixture();
  const actual = await f.list(ACTOR);
  expect(actual.items.map(row => row.id)).toEqual(['444444444444444444444444', '333333333333333333333333']);
  expect(actual.items[1]).toMatchObject({ serviceName: 'Chăm sóc tại nhà', petNames: ['Milo'], visitCount: 1 });
});

// SRS: UC-26; III.7.1.2 Booking List; GBR-01/02.
test("BKG-HISTORY-01-UTCID02 [N] Chưa có booking trả danh sách rỗng", async () => {
  const f = fixture({ empty: true });
  expect(await f.list(ACTOR)).toMatchObject({ items: [], nextCursor: null });
});

// SRS: Report 3 23/11; UC-26; GBR-17: booking chờ thanh toán quá 15 phút hiển thị PAYMENT_EXPIRED.
test("BKG-HISTORY-01-UTCID03 [A] Quá hạn thanh toán 15 phút hiển thị PAYMENT_EXPIRED", async () => {
  const f = fixture({ overdue: true });
  const actual = await f.list(ACTOR);
  expect(actual.items.find(row => row.id === '333333333333333333333333').state).toBe('PAYMENT_EXPIRED');
});

// SRS: UC-26; III.7.1.2 Booking List; GBR-01/02.
// DEF_BKG_HISTORY_STATUS_FILTER: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("BKG-HISTORY-01-UTCID04 [N] Tab Paid chỉ trả booking Paid", async () => {
  const f = fixture();
  const actual = await f.list(ACTOR, { state: 'PAID' });
  expect(actual.items.map(row => row.id)).toEqual(['444444444444444444444444']);
});

// SRS: UC-26; III.7.1.2 Booking List; GBR-01/02.
test("BKG-HISTORY-01-UTCID05 [A] Chưa đăng nhập không đọc lịch sử", async () => {
  const f = fixture();
  await expect(f.list(null)).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
});

// SRS: UC-26; III.7.1.2 Booking List; GBR-01/02.
test("BKG-HISTORY-01-UTCID06 [A] Pet sitter không đọc danh sách booking Customer", async () => {
  const f = fixture();
  await expect(f.list({ ...ACTOR, roles: ['PET_SITTER'] })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
});
