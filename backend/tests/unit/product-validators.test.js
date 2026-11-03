import { describe, test, expect } from '@jest/globals';
import { parseProductQuery } from '../../src/validators/product.validator.js';
import { parseAddCartLine, parseSetCartLine } from '../../src/validators/product-cart.validator.js';
import { parsePlaceOrder, parseIdempotencyKey, parseOrderListQuery } from '../../src/validators/product-order.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('parseProductQuery', () => {
  test('normalises a valid query and applies the default page size', () => {
    expect(parseProductQuery({ search: '  Thức   ăn ', category: 'FOOD', petType: 'DOG' }))
      .toEqual({ search: 'Thức ăn', category: 'FOOD', petType: 'DOG', limit: 20 });
    expect(parseProductQuery({ search: '   ' })).toEqual({ limit: 20 });
  });

  test('rejects unknown keys, enums, arrays and out-of-range limits', () => {
    expect(code(() => parseProductQuery({ category: 'TOYS' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseProductQuery({ petType: 'BIRD' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseProductQuery({ search: ['a', 'b'] }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseProductQuery({ limit: '0' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseProductQuery({ limit: '51' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseProductQuery({ sort: 'price' }))).toBe('VALIDATION_FAILED');
  });
});

describe('cart line validators', () => {
  test('accept a product id and a bounded integer quantity', () => {
    expect(parseAddCartLine({ productId: id, quantity: 2 })).toEqual({ productId: id, quantity: 2 });
    expect(parseSetCartLine(id, { quantity: 99 })).toEqual({ productId: id, quantity: 99 });
  });

  test('reject extra fields, zero, fractions, strings and bad ids', () => {
    expect(code(() => parseAddCartLine({ productId: id, quantity: 0 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseAddCartLine({ productId: id, quantity: 1.5 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseAddCartLine({ productId: id, quantity: '2' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseAddCartLine({ productId: id, quantity: 100 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseAddCartLine({ productId: 'nope', quantity: 1 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseAddCartLine({ productId: id, quantity: 1, price: 1 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseSetCartLine('nope', { quantity: 1 }))).toBe('VALIDATION_FAILED');
  });
});

describe('parsePlaceOrder', () => {
  test('pairs delivery with COD and an address, pickup with pay-at-shop and no address', () => {
    expect(parsePlaceOrder({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: id }))
      .toEqual({ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: id });
    expect(parsePlaceOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }))
      .toEqual({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' });
  });

  test('asks for an address on delivery (MSG101) and rejects mismatched pairs', () => {
    expect(code(() => parsePlaceOrder({ receiveMethod: 'DELIVERY', paymentMethod: 'COD' }))).toBe('ADDRESS_REQUIRED');
    expect(code(() => parsePlaceOrder({ receiveMethod: 'DELIVERY', paymentMethod: 'PAY_AT_SHOP', addressId: id }))).toBe('VALIDATION_FAILED');
    expect(code(() => parsePlaceOrder({ receiveMethod: 'PICKUP', paymentMethod: 'COD' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parsePlaceOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', addressId: id }))).toBe('VALIDATION_FAILED');
    expect(code(() => parsePlaceOrder({ receiveMethod: 'SHIP', paymentMethod: 'COD' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parsePlaceOrder({ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP', total: 1 }))).toBe('VALIDATION_FAILED');
  });
});

describe('idempotency key and order list query', () => {
  test('require a bounded key and a bounded limit', () => {
    expect(parseIdempotencyKey('synthetic-key-000001')).toBe('synthetic-key-000001');
    expect(code(() => parseIdempotencyKey(undefined))).toBe('VALIDATION_FAILED');
    expect(code(() => parseIdempotencyKey('short'))).toBe('VALIDATION_FAILED');
    expect(parseOrderListQuery({})).toEqual({ limit: 20 });
    expect(code(() => parseOrderListQuery({ limit: '500' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseOrderListQuery({ page: '2' }))).toBe('VALIDATION_FAILED');
  });
});
