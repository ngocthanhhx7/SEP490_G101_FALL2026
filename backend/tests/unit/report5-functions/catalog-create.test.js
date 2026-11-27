// CATALOG-01 — chỉ kiểm thử create; mỗi UTCID là một test riêng.
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

// SRS: UC-22; SRS III.6.1 Manage Services, dòng 4241–4270.
test("CATALOG-01-UTCID01 [N] Admin tạo service cho chó với tên và mô tả", async () => {
  const f = fixture();
  const actual = await f.service.create({ actor: f.actor, body: f.body });
  expect(actual).toMatchObject({ name: 'Chăm sóc tại nhà', species: ['DOG'], state: 'ACTIVE' });
  expect(f.ServiceVersion.create).toHaveBeenCalledTimes(1);
});

// SRS: SRS III.6.1 dòng 4259–4260: Short description Optional
test("CATALOG-01-UTCID02 [N] Mô tả ngắn là tùy chọn", async () => {
  const f = fixture(); f.body.description = '';
  await expect(f.service.create({ actor: f.actor, body: f.body })).resolves.toMatchObject({ description: '' });
});

// SRS: SRS III.6.1 dòng 4253–4254
test("CATALOG-01-UTCID03 [A] Tên service bắt buộc không được bỏ trống", async () => {
  const f = fixture(); f.body.name = '';
  await expect(f.service.create({ actor: f.actor, body: f.body })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  expect(f.Service.create).not.toHaveBeenCalled();
});
