// CATALOG-03 — chỉ kiểm thử setPolicy; mỗi UTCID là một test riêng.
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

// SRS: UC-24; SRS III.6.3.1 dòng 4338,4374–4380; data rule snapshot dòng 816–820.
test("CATALOG-03-UTCID01 [N] Lưu nội dung policy ở phiên bản mới", async () => {
  const f = fixture(); const old = globalThis.structuredClone(f.data.policy);
  const body = { expectedVersion: 1, state: 'PUBLISHED', title: 'Chính sách trách nhiệm', body: 'Nội dung được Admin nhập', effectiveAt: new Date(NOW).toISOString(), reason: 'Cập nhật tổng hợp' };
  const actual = await f.service.setPolicy({ serviceId: ID, actor: f.actor, body });
  expect(actual).toMatchObject({ version: 2, body: 'Nội dung được Admin nhập' }); expect(f.data.policy).toEqual(old);
});

// SRS: SRS III.6.3.1 dòng 4374–4378: policy free text required
test("CATALOG-03-UTCID02 [A] Policy bắt buộc không được lưu nội dung rỗng", async () => {
  const f = fixture(); const body = { expectedVersion: 1, state: 'PUBLISHED', title: 'Chính sách trách nhiệm', body: '', effectiveAt: new Date(NOW).toISOString(), reason: 'Cập nhật tổng hợp' };
  await expect(f.service.setPolicy({ serviceId: ID, actor: f.actor, body })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});
