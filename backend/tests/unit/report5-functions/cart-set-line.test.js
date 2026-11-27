// CART-03 — chỉ kiểm thử setLine; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/models/product.model.js', () => ({ productSalesModels: c => c.models }));
const { createProductCartService } = await import('../../../src/services/product-sales/product-cart.service.js');
const OWNER = '111111111111111111111111', PRODUCT = '222222222222222222222222';
function query(value) { const q = { session: () => q, lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: OWNER, roles: ['CUSTOMER'], state: 'ACTIVE' };
  const product = { _id: PRODUCT, code: 'SP-0001', name: 'Thức ăn tổng hợp', category: 'FOOD', petType: 'DOG', visible: true,
    sellingPrice: 10000, stockOnHand: 10, quantityHeld: 2 };
  const cart = { customerId: OWNER, lines: [{ productId: PRODUCT, quantity: 2 }], version: 1 };
  const Product = { find: jest.fn(() => query([product])), findOne: jest.fn(() => query(product)), updateOne: jest.fn() };
  const ProductCart = { findOne: jest.fn(filter => query(filter.customerId === OWNER ? cart : null)),
    updateOne: jest.fn(async (_filter, update) => {
      if (update.$push) cart.lines.push({ ...update.$push.lines });
      if (update.$pull) cart.lines = cart.lines.filter(line => line.productId !== update.$pull.lines.productId);
      if (update.$set?.['lines.$.quantity'] !== undefined) cart.lines[0].quantity = update.$set['lines.$.quantity'];
      return { matchedCount: 1, modifiedCount: 1 };
    }) };
  const connection = { models: { Product, ProductCart }, transaction: async work => work({}) };
  const eligibility = { read: async () => ({ tierCode: 'MEMBER', discountBps: 0, prepaidOnly: false }) };
  const service = createProductCartService({ connection, eligibility });
  return { actor, product, cart, Product, ProductCart, service };
}

// SRS: UC-61; SRS III.23.1.1 dòng 5825,5833–5834.
test("CART-03-UTCID01 [B] Cho phép đổi lượng về mức tối thiểu 1", async () => {
  const f = fixture();
  const actual = await f.service.setLine(f.actor, PRODUCT, { quantity: 1 });
  expect(actual.lines[0].quantity).toBe(1); expect(actual.total).toBe(10000);
});

// SRS: UC-61; SRS III.23.1.1 dòng 5825,5833–5834.
test("CART-03-UTCID02 [B] Số lượng 0 không hợp lệ", async () => {
  const f = fixture();
  await expect(f.service.setLine(f.actor, PRODUCT, { quantity: 0 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
});

// SRS: UC-61; SRS III.23.1.1 dòng 5825,5833–5834.
test("CART-03-UTCID03 [B] Không đổi lượng cao hơn lượng có thể bán", async () => {
  const f = fixture();
  await expect(f.service.setLine(f.actor, PRODUCT, { quantity: 9 })).rejects.toMatchObject({ code: 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE', status: 409 });
});
