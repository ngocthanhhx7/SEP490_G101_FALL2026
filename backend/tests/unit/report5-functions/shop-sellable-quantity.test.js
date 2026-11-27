import { test, expect } from '@jest/globals';
import { sellableQuantity } from '../../../src/services/product-sales/product-order-pricing.js';

// SRS: GBR-35; III Stock List: available = stock on hand − held.
test("SHOP-PRICE-02-UTCID01 [N] Số có thể bán bằng tồn thực tế trừ lượng đang giữ", async () => {
  const actual = sellableQuantity({ stockOnHand: 10, quantityHeld: 3 });
  expect(actual).toBe(7);
});

// SRS: GBR-35; III Stock List: available = stock on hand − held.
test("SHOP-PRICE-02-UTCID02 [B] Toàn bộ tồn đã được giữ thì không còn hàng có thể bán", async () => {
  const actual = sellableQuantity({ stockOnHand: 10, quantityHeld: 10 });
  expect(actual).toBe(0);
});

// SRS: GBR-35; III Stock List: available = stock on hand − held.
test("SHOP-PRICE-02-UTCID03 [B] Một đơn vị còn lại vẫn có thể bán", async () => {
  const actual = sellableQuantity({ stockOnHand: 10, quantityHeld: 9 });
  expect(actual).toBe(1);
});
