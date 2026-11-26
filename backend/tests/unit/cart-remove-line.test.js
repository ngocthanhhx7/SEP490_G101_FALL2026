import { describe, expect, test } from '@jest/globals';
import { parseRemoveCartLine } from '../../src/validators/product-cart.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('CART-IN-03 parseRemoveCartLine', () => {
  test('accepts a valid path product id', () => {
    expect(parseRemoveCartLine(id)).toEqual({ productId: id });
  });
  test.each([undefined, null, ''])('rejects a missing productId %p', (productId) => {
    expect(code(() => parseRemoveCartLine(productId))).toBe('VALIDATION_FAILED');
  });
  test('rejects a malformed productId', () => {
    expect(code(() => parseRemoveCartLine('nope'))).toBe('VALIDATION_FAILED');
  });
  test.each([1, {}, []])('rejects a non-string productId %p', (productId) => {
    expect(code(() => parseRemoveCartLine(productId))).toBe('VALIDATION_FAILED');
  });
  test('does not accept quantity because this validator only receives the path productId', () => {
    expect(parseRemoveCartLine(id)).toEqual({ productId: id });
  });
});
