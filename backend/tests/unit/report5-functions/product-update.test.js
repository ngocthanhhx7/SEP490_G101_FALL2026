// PRODUCT-02 — chỉ kiểm thử update; mỗi UTCID là một test riêng.
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
test("PRODUCT-02-UTCID01 [N] Sửa giá không đổi mã hoặc stock của sản phẩm", async () => {
  const f = fixture(); f.product.stockOnHand = 10;
  const actual = await f.service.update(f.actor, PRODUCT, { version: 1, sellingPrice: 12000 });
  expect(actual).toMatchObject({ code: 'SP-0001', sellingPrice: 12000 }); expect(f.product.stockOnHand).toBe(10);
});

// SRS: UC-57; SRS III.21.2.1 Product Management, dòng 5659–5715.
test("PRODUCT-02-UTCID02 [N] Ẩn sản phẩm khỏi danh sách cho khách", async () => {
  const f = fixture();
  await expect(f.service.update(f.actor, PRODUCT, { version: 1, visible: false })).resolves.toMatchObject({ visible: false });
});

// SRS: UC-57 actor Admin; Permission Matrix; GBR-02
test("PRODUCT-02-UTCID03 [A] Customer không được sửa sản phẩm", async () => {
  const f = fixture(); f.actor.roles = ['CUSTOMER'];
  await expect(f.service.update(f.actor, PRODUCT, { version: 1, sellingPrice: 12000 })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
