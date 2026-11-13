import { expect, test } from '@jest/globals';
import { priceProductOrder } from '../../src/services/product-sales/product-order-pricing.js';

test('AC-10 floors the discount per unit before multiplying and excludes delivery fees', () => {
  const lines = [{ unitPrice: 101, quantity: 3 }, { unitPrice: 59, quantity: 2 }];
  expect(priceProductOrder({ lines, receiveMethod: 'DELIVERY', discountBps: 500 })).toMatchObject({
    lineTotals: [303, 118], unitDiscounts: [5, 2], subtotal: 421, tierDiscount: 19, shippingFee: 25000, total: 25402
  });
});

test('AC-10 keeps integer amounts exact at the safe-integer boundary', () => {
  const unitPrice = Number.MAX_SAFE_INTEGER;
  const expected = Number(BigInt(unitPrice) * 9999n / 10000n);
  expect(priceProductOrder({ lines: [{ unitPrice, quantity: 1 }], discountBps: 9999 })).toMatchObject({
    unitDiscounts: [expected], tierDiscount: expected, total: unitPrice - expected
  });
});

test('AC-10 permits an empty preview only when requested and rejects invalid rates', () => {
  expect(priceProductOrder({ lines: [], allowEmpty: true })).toMatchObject({
    lineTotals: [], unitDiscounts: [], subtotal: 0, tierDiscount: 0, total: 0
  });
  expect(() => priceProductOrder({ lines: [] })).toThrow(TypeError);
  expect(() => priceProductOrder({ lines: [{ unitPrice: 101, quantity: 1 }], discountBps: 10001 })).toThrow(TypeError);
});
