// SUPPLIER-03 — chỉ kiểm thử stop; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/models/product.model.js', () => ({ productSalesModels: c => c.models }));
const { createSupplierManagementService } = await import('../../../src/services/product-sales/supplier-management.service.js');
const OWNER = '111111111111111111111111', SUPPLIER = '333333333333333333333333';
function query(value) { const q = { lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: OWNER, state: 'ACTIVE', roles: ['ADMIN'] };
  const supplier = { _id: SUPPLIER, name: 'Nhà cung cấp tổng hợp', contactName: 'Liên hệ mẫu', phone: '0912345678', email: '', productIds: [], status: 'ACTIVE', version: 1 };
  const Supplier = { create: jest.fn(async data => ({ toObject: () => ({ ...data, _id: SUPPLIER }) })),
    findById: jest.fn(() => query(supplier)), findOneAndUpdate: jest.fn((filter, update) => {
      if (filter.status && supplier.status !== filter.status) return query(null);
      Object.assign(supplier, update.$set); supplier.version++; return query(supplier);
    }) };
  const Product = { find: jest.fn(() => query([])) };
  const service = createSupplierManagementService({ connection: { models: { Supplier, Product } } });
  const body = { name: supplier.name, phone: supplier.phone, contactName: supplier.contactName, email: '', productIds: [] };
  return { actor, supplier, Supplier, Product, service, body };
}

// SRS: UC-69; SRS III.25.1.1 dòng 6061–6062,6085–6086.
test("SUPPLIER-03-UTCID01 [N] Ngừng hợp tác vẫn giữ nhà cung cấp và dữ liệu liên hệ", async () => {
  const f = fixture();
  await expect(f.service.stop(f.actor, SUPPLIER, { version: 1 })).resolves.toMatchObject({ id: SUPPLIER, status: 'STOPPED', phone: '0912345678' });
});

// SRS: UC-69; SRS III.25.1.1 dòng 6061–6062,6085–6086.
test("SUPPLIER-03-UTCID02 [A] Customer không được ngừng nhà cung cấp", async () => {
  const f = fixture(); f.actor.roles = ['CUSTOMER'];
  await expect(f.service.stop(f.actor, SUPPLIER, { version: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
