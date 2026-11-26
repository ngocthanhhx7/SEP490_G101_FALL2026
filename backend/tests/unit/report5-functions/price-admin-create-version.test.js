// PRICE-ADMIN-02 — chỉ kiểm thử createVersion; mỗi UTCID là một test riêng.
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

// SRS: UC-23; SRS III.6.2.2 dòng 4322–4327.
test("PRICE-ADMIN-02-UTCID01 [N] Giá mới được lưu bằng version kế tiếp", async () => {
  const f = fixture();
  const actual = await f.service.createVersion({ serviceId: ID, actor: f.actor, body: f.body });
  expect(actual).toMatchObject({ version: 2, amountVnd: 120000 }); expect(f.previous.amountVnd).toBe(100000);
});

// SRS: UC-23; SRS III.6.2.2 dòng 4322–4327.
test("PRICE-ADMIN-02-UTCID02 [A] Lưu giá lỗi không thay dữ liệu giá đã lưu", async () => {
  const f = fixture(); const error = new Error('Synthetic persistence failure');
  f.PriceVersion.create.mockRejectedValue(error);
  await expect(f.service.createVersion({ serviceId: ID, actor: f.actor, body: f.body })).rejects.toBe(error);
  expect(f.previous.amountVnd).toBe(100000);
});
