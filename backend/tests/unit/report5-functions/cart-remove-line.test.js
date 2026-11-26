// CART-04 — chỉ kiểm thử removeLine; mỗi UTCID là một test riêng.
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

// SRS: UC-61; SRS III.23.1.1 dòng 5835–5836; GBR-35.
test("CART-04-UTCID01 [N] Xóa dòng cuối đưa giỏ về rỗng và không đổi stock", async () => {
  const f = fixture();
  const actual = await f.service.removeLine(f.actor, PRODUCT);
  expect(actual).toMatchObject({ lines: [], total: 0, lineCount: 0 });
  expect(f.Product.updateOne).not.toHaveBeenCalled(); expect(f.product.quantityHeld).toBe(2);
});

// SRS: UC-61 actor Customer; GBR-02
test("CART-04-UTCID02 [A] Staff không sửa giỏ Customer", async () => {
  const f = fixture(); f.actor.roles = ['STAFF'];
  await expect(f.service.removeLine(f.actor, PRODUCT)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
