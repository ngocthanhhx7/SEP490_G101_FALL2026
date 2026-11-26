// PRICE-ADMIN-01 — chỉ kiểm thử parsePriceVersionInput; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createServicePriceService, parsePriceVersionInput } from '../../../src/services/service-price.service.js';
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

// SRS: UC-23; SRS III.6.2.2 dòng 4310–4327: nhập và kiểm tra giá trước khi lưu.
test("PRICE-ADMIN-01-UTCID01 [N] Đọc giá cơ bản Admin nhập để chuẩn bị lưu", async () => {
  const f = fixture();
  expect(parsePriceVersionInput(f.body)).toMatchObject({ amountVnd: 120000, unitLabel: 'mỗi buổi' });
});

// SRS: UC-23; SRS III.6.2.2 dòng 4312–4313,4322–4323
test("PRICE-ADMIN-01-UTCID02 [A] Thiếu giá cơ bản thì không có cấu hình giá hợp lệ", async () => {
  const f = fixture(); delete f.body.amountVnd;
  expect(() => parsePriceVersionInput(f.body)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});
