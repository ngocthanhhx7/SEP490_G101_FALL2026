import { describe, test, expect } from '@jest/globals';
import { priceProductOrder, sellableQuantity } from '../../src/services/product-sales/product-order-pricing.js';

describe('priceProductOrder', () => {
  const lines = [{ unitPrice: 250000, quantity: 2 }, { unitPrice: 100000, quantity: 1 }];

  test('adds the flat demo delivery fee for DELIVERY in integer VND', () => {
    expect(priceProductOrder({ lines, receiveMethod: 'DELIVERY' }))
      .toEqual({ lineTotals: [500000, 100000], subtotal: 600000, shippingFee: 25000, total: 625000 });
  });

  test('charges no delivery fee for PICKUP', () => {
    expect(priceProductOrder({ lines, receiveMethod: 'PICKUP' })).toMatchObject({ shippingFee: 0, total: 600000 });
  });

  test('rejects empty orders, non-integer money and unsafe amounts', () => {
    expect(() => priceProductOrder({ lines: [], receiveMethod: 'PICKUP' })).toThrow(TypeError);
    expect(() => priceProductOrder({ lines: [{ unitPrice: 1000.5, quantity: 1 }], receiveMethod: 'PICKUP' })).toThrow(TypeError);
    expect(() => priceProductOrder({ lines: [{ unitPrice: 1000, quantity: 0 }], receiveMethod: 'PICKUP' })).toThrow(TypeError);
    expect(() => priceProductOrder({ lines: [{ unitPrice: Number.MAX_SAFE_INTEGER, quantity: 2 }], receiveMethod: 'PICKUP' })).toThrow(TypeError);
  });
});

describe('sellableQuantity', () => {
  test('is stock on hand minus held quantity and never negative', () => {
    expect(sellableQuantity({ stockOnHand: 15, quantityHeld: 4 })).toBe(11);
    expect(sellableQuantity({ stockOnHand: 2, quantityHeld: 5 })).toBe(0);
  });
});
