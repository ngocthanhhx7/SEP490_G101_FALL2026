import { describe, expect, test } from '@jest/globals';
import { parseAddCartLine } from '../../src/validators/product-cart.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('CART-IN-01 parseAddCartLine', () => {
  test('accepts a valid product id and quantity one', () => {
    expect(parseAddCartLine({ productId: id, quantity: 1 })).toEqual({ productId: id, quantity: 1 });
  });
  test('accepts the quantity upper boundary 99', () => {
    expect(parseAddCartLine({ productId: id, quantity: 99 })).toEqual({ productId: id, quantity: 99 });
  });
  test.each([undefined, null, '', 'nope', 1])('rejects missing or malformed productId %p', (productId) => {
    expect(code(() => parseAddCartLine({ productId, quantity: 1 }))).toBe('VALIDATION_FAILED');
  });
  test.each([{}, { productId: id }])('rejects missing quantity %p', (body) => {
    expect(code(() => parseAddCartLine(body))).toBe('VALIDATION_FAILED');
  });
  test.each([null, '2', 1.5])('rejects quantity with a wrong type %p', (quantity) => {
    expect(code(() => parseAddCartLine({ productId: id, quantity }))).toBe('VALIDATION_FAILED');
  });
  test.each([0, -1])('rejects zero or negative quantity %p', (quantity) => {
    expect(code(() => parseAddCartLine({ productId: id, quantity }))).toBe('VALIDATION_FAILED');
  });
  test('rejects quantity 100 above the line limit', () => {
    expect(code(() => parseAddCartLine({ productId: id, quantity: 100 }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a client-supplied price', () => {
    expect(code(() => parseAddCartLine({ productId: id, quantity: 1, price: 1 }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a DTO with multiple invalid fields', () => {
    expect(code(() => parseAddCartLine({ productId: 'bad', quantity: 0, stockOnHand: 1 }))).toBe('VALIDATION_FAILED');
  });
});
