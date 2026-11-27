import { describe, expect, test } from '@jest/globals';
import { parseSetCartLine } from '../../src/validators/product-cart.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('CART-IN-02 parseSetCartLine', () => {
  test('accepts a valid path product id and quantity one', () => {
    expect(parseSetCartLine(id, { quantity: 1 })).toEqual({ productId: id, quantity: 1 });
  });
  test.each([100, 150, Number.MAX_SAFE_INTEGER])('CART-IN-02-UTCID07 accepts safe integer quantity %p', (quantity) => {
    expect(parseSetCartLine(id, { quantity })).toEqual({ productId: id, quantity });
  });
  test.each([undefined, null, '', 'bad', 1])('rejects missing or malformed path productId %p', (productId) => {
    expect(code(() => parseSetCartLine(productId, { quantity: 1 }))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null])('rejects missing or null quantity %p', (quantity) => {
    expect(code(() => parseSetCartLine(id, { quantity }))).toBe('VALIDATION_FAILED');
  });
  test.each([0, -1])('rejects zero or negative quantity %p', (quantity) => {
    expect(code(() => parseSetCartLine(id, { quantity }))).toBe('VALIDATION_FAILED');
  });
  test.each([1.5, '2'])('rejects fractional or string quantity %p', (quantity) => {
    expect(code(() => parseSetCartLine(id, { quantity }))).toBe('VALIDATION_FAILED');
  });
  test('rejects an unsafe integer', () => {
    const quantity = Number.MAX_SAFE_INTEGER + 1;
    expect(code(() => parseSetCartLine(id, { quantity }))).toBe('VALIDATION_FAILED');
  });
  test('rejects unknown body fields', () => {
    expect(code(() => parseSetCartLine(id, { quantity: 1, price: 1 }))).toBe('VALIDATION_FAILED');
  });
  test('rejects an empty payload', () => {
    expect(code(() => parseSetCartLine(id, {}))).toBe('VALIDATION_FAILED');
  });
});
