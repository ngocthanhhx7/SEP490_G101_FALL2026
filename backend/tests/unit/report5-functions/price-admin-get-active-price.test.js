// PRICE-ADMIN-03 — chỉ kiểm thử getActivePrice; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createServicePriceService } from '../../../src/services/service-price.service.js';
const ID = '111111111111111111111111', ADMIN = '222222222222222222222222';
const NOW = Date.parse('2026-11-18T03:00:00Z');
function query(value) { const q = { session: () => q, sort: () => q, lean: async () => value }; return q; }
function fixture() {
  const previous = { serviceId: ID, version: 1, amountVnd: 100000, currency: 'VND', unitLabel: 'mỗi buổi', effectiveAt: new Date(NOW - 1000) };
  const PriceVersion = { findOne: jest.fn(() => query(previous)), create: jest.fn(async rows => rows.map(row => ({ toObject: () => row }))) };
  const service = createServicePriceService({ connection: { transaction: async work => work({}) }, PriceVersion, serviceExists: async () => true, clock: () => NOW });
  const body = { expectedVersion: 1, amountVnd: 120000, unitLabel: 'mỗi buổi', effectiveAt: new Date(NOW).toISOString(), reason: 'Cập nhật giá tổng hợp' };
  return { service, PriceVersion, previous, body, actor: { userId: ADMIN, state: 'ACTIVE', roles: ['ADMIN'] } };
}

// SRS: UC-23; SRS III.6.2.2 dòng 4305,4326–4327; UC-25 xem giá trước xác nhận.
test("PRICE-ADMIN-03-UTCID01 [N] Đọc giá áp dụng của service", async () => {
  const f = fixture();
  await expect(f.service.getActivePrice(ID)).resolves.toMatchObject({ serviceId: ID, amountVnd: 100000, version: 1 });
});

// SRS: UC-23; SRS III.6.2.2 dòng 4305,4326–4327; UC-25 xem giá trước xác nhận.
test("PRICE-ADMIN-03-UTCID02 [A] Không tự tạo giá khi service chưa có bản giá", async () => {
  const f = fixture(); f.PriceVersion.findOne.mockReturnValue(query(null));
  await expect(f.service.getActivePrice(ID)).resolves.toBeNull();
});
