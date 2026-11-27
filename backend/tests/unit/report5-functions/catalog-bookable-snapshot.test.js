// CATALOG-04 — chỉ kiểm thử bookableSnapshot; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { createServiceCatalogService } from '../../../src/services/service-catalog.service.js';
const ID = '111111111111111111111111', ADMIN = '222222222222222222222222';
const NOW = Date.parse('2026-11-18T03:00:00Z');
function query(value) { const q = { session: () => q, sort: () => q, select: () => q, lean: async () => value }; return q; }
function fixture() {
  const data = { version: { serviceId: new Types.ObjectId(ID), version: 1, name: 'Chăm sóc tại nhà', description: '', scope: 'Chăm sóc chó mèo',
    species: ['DOG'], state: 'ACTIVE', effectiveAt: new Date(NOW) },
    policy: { serviceId: new Types.ObjectId(ID), version: 1, state: 'PUBLISHED', title: 'Trách nhiệm chăm sóc', body: 'Điều khoản tổng hợp', effectiveAt: new Date(NOW) } };
  const Service = { findById: jest.fn(() => query({ _id: new Types.ObjectId(ID), code: 'synthetic-care' })),
    create: jest.fn(async rows => [{ ...rows[0], _id: new Types.ObjectId(ID) }]) };
  const ServiceVersion = { findOne: jest.fn(() => query(data.version)), create: jest.fn(async rows => rows) };
  const PolicyVersion = { findOne: jest.fn(() => query(data.policy)), create: jest.fn(async rows => rows) };
  const priceProvider = { getActivePrice: jest.fn(async () => ({ amountVnd: 100000, currency: 'VND', unitLabel: 'mỗi buổi', version: 1, effectiveAt: new Date(NOW) })) };
  const service = createServiceCatalogService({ connection: { transaction: async work => work({}) }, Service, ServiceVersion, PolicyVersion,
    priceProvider, catalogSettings: { isEnabledAt: async () => true }, clock: () => NOW });
  const body = { code: 'synthetic-care', name: 'Chăm sóc tại nhà', description: '', scope: 'Chăm sóc chó mèo', species: ['DOG'],
    state: 'ACTIVE', effectiveAt: new Date(NOW).toISOString(), reason: 'Cấu hình tổng hợp' };
  return { service, data, Service, ServiceVersion, PolicyVersion, priceProvider, body, actor: { userId: ADMIN, roles: ['ADMIN'], state: 'ACTIVE' } };
}

// SRS: UC-25; SRS III.6.1 dòng 4267–4268; data rule Price snapshot, dòng 816–820.
test("CATALOG-04-UTCID01 [N] Snapshot giữ giá và policy tại thời điểm đặt", async () => {
  const f = fixture();
  const actual = await f.service.bookableSnapshot(ID);
  expect(actual.price.amountVnd).toBe(100000); expect(actual.policy.body).toBe('Điều khoản tổng hợp');
  f.data.policy.body = 'Nội dung thay đổi sau đó'; f.data.version.name = 'Tên mới';
  expect(actual.policy.body).toBe('Điều khoản tổng hợp'); expect(actual.service.name).toBe('Chăm sóc tại nhà');
});

// SRS: UC-25; SRS III.6.1 dòng 4267–4268; data rule Price snapshot, dòng 816–820.
test("CATALOG-04-UTCID02 [A] Service đã tắt không thể tạo snapshot cho booking mới", async () => {
  const f = fixture(); f.data.version.state = 'INACTIVE';
  await expect(f.service.bookableSnapshot(ID)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 409 });
});

// SRS: UC-25 Normal Flow: xem giá trước xác nhận; UC-23 cấu hình giá
test("CATALOG-04-UTCID03 [A] Chưa có giá thì chưa cung cấp snapshot để đặt dịch vụ", async () => {
  const f = fixture(); f.priceProvider.getActivePrice.mockResolvedValue(null);
  await expect(f.service.bookableSnapshot(ID)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 409 });
});
