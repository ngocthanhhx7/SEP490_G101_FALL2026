// PRODUCT-01 — chỉ kiểm thử create; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/models/product.model.js', () => ({ productSalesModels: c => c.models }));
const { createProductManagementService } = await import('../../../src/services/product-sales/product-management.service.js');
const OWNER = '111111111111111111111111', PRODUCT = '222222222222222222222222';
function query(value) { const q = { session: () => q, sort: () => q, limit: () => q, lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: OWNER, state: 'ACTIVE', roles: ['ADMIN'] };
  const product = { _id: PRODUCT, code: 'SP-0001', name: 'Thức ăn tổng hợp', category: 'FOOD', petType: 'DOG', sellingPrice: 10000,
    visible: true, stockOnHand: 0, quantityHeld: 0, version: 1, detailsVersion: 1, deletedAt: null };
  const Product = { find: jest.fn(() => query([product])), findOne: jest.fn(() => query(product)), exists: jest.fn(async () => true),
    create: jest.fn(async rows => rows.map(row => ({ toObject: () => ({ ...row, _id: PRODUCT }) }))),
    findOneAndUpdate: jest.fn((_filter, update) => { Object.assign(product, update.$set); product.detailsVersion++; return query(product); }),
    updateOne: jest.fn(async (_filter, update) => { Object.assign(product, update.$set); return { modifiedCount: 1 }; }) };
  const ProductCounter = { findOneAndUpdate: jest.fn(async () => ({ value: 2 })) };
  const ProductOrder = { exists: jest.fn(() => query(false)) };
  // Mongoose queries are thenable in production; exists is awaited after session.
  ProductOrder.exists.mockImplementation(() => { const q = query(false); q.then = (resolve, reject) => Promise.resolve(false).then(resolve, reject); return q; });
  const service = createProductManagementService({ connection: { models: { Product, ProductCounter, ProductOrder }, transaction: async work => work({}) } });
  return { actor, product, Product, ProductCounter, ProductOrder, service };
}

// SRS: UC-57; SRS III.21.2.1 Product Management, dòng 5659–5715.
test("PRODUCT-01-UTCID01 [N] Tạo sản phẩm ẩn có giá và mã do hệ thống cấp", async () => {
  const f = fixture();
  const actual = await f.service.create(f.actor, { name: 'Thức ăn tổng hợp', category: 'FOOD', petType: 'DOG', sellingPrice: 10000 });
  expect(actual).toMatchObject({ code: 'SP-0002', name: 'Thức ăn tổng hợp', visible: false, sellingPrice: 10000 });
  expect(f.Product.create.mock.calls[0][0][0]).toMatchObject({ stockOnHand: 0, quantityHeld: 0 });
});

// SRS: UC-57; SRS III.21.2.1 Product Management, dòng 5659–5715.
test("PRODUCT-01-UTCID02 [A] Thiếu tên bắt buộc không lưu sản phẩm", async () => {
  const f = fixture();
  await expect(f.service.create(f.actor, { category: 'FOOD', petType: 'DOG', sellingPrice: 10000 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  expect(f.Product.create).not.toHaveBeenCalled();
});

// SRS: UC-57; SRS III.21.2.1 Product Management, dòng 5659–5715.
test("PRODUCT-01-UTCID03 [B] Giá bán 0 không hợp lệ", async () => {
  const f = fixture();
  await expect(f.service.create(f.actor, { name: 'Thức ăn tổng hợp', category: 'FOOD', petType: 'DOG', sellingPrice: 0 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});
