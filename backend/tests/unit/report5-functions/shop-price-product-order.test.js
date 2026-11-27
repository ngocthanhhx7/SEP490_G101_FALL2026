import { test, expect } from '@jest/globals';
import { priceProductOrder } from '../../../src/services/product-sales/product-order-pricing.js';

// SRS: UC-62 Normal 4; III Product Checkout; GBR-35.
test("SHOP-PRICE-01-UTCID01 [N] Tính tiền từng sản phẩm và tổng hàng theo giá bán", async () => {
  const actual = priceProductOrder({ receiveMethod: 'PICKUP', lines: [
    { unitPrice: 100000, quantity: 2 }, { unitPrice: 40000, quantity: 3 } ] });
  expect(actual).toEqual({ lineTotals: [200000, 120000], unitDiscounts: [0, 0], subtotal: 320000, tierDiscount: 0, shippingFee: 0, total: 320000 });
});

// SRS: III Shopping Cart Quantity; III Product Checkout pickup; UC-62 Normal 2/4.
test("SHOP-PRICE-01-UTCID02 [B] Một sản phẩm số lượng một tại cửa hàng không có phí giao", async () => {
  const actual = priceProductOrder({ receiveMethod: 'PICKUP', lines: [{ unitPrice: 100000, quantity: 1 }] });
  expect(actual).toEqual({ lineTotals: [100000], unitDiscounts: [0], subtotal: 100000, tierDiscount: 0, shippingFee: 0, total: 100000 });
});
