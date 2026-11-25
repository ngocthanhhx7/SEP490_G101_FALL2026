// SUPPLIER-01 — chỉ kiểm thử create; mỗi UTCID là một test riêng.
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

// SRS: UC-69; SRS III.25.1.1 dòng 6058–6086.
test("SUPPLIER-01-UTCID01 [N] Tạo nhà cung cấp với tên và số điện thoại", async () => {
  const f = fixture();
  await expect(f.service.create(f.actor, f.body)).resolves.toMatchObject({ name: f.body.name, phone: '0912345678', status: 'ACTIVE' });
});

// SRS: III.25.1.1 dòng 6079–6080; MSG125
test("SUPPLIER-01-UTCID02 [A] Thiếu cả số điện thoại và email không được lưu", async () => {
  const f = fixture(); f.body.phone = '';
  await expect(f.service.create(f.actor, f.body)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});

// SRS: III.25.1.1 dòng 6075–6076; MSG116
test("SUPPLIER-01-UTCID03 [A] Tên đã tồn tại không được tạo thêm", async () => {
  const f = fixture(); f.Supplier.create.mockRejectedValue({ code: 11000 });
  await expect(f.service.create(f.actor, f.body)).rejects.toMatchObject({ code: 'SUPPLIER_NAME_TAKEN', status: 409 });
});
