import { describe, expect, test } from '@jest/globals';
import { parseDeleteProduct } from '../../src/validators/product-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const reason = 'x'.repeat(20);

describe('PRODUCT-IN-03 parseDeleteProduct', () => {
  test('trims a valid minimum-length reason', () => {
    expect(parseDeleteProduct({ version: 1, reason: ` ${reason} ` })).toEqual({ version: 1, reason });
  });
  test('accepts version zero and a 1000-character reason', () => {
    expect(parseDeleteProduct({ version: 0, reason: 'x'.repeat(1000) })).toEqual({ version: 0, reason: 'x'.repeat(1000) });
  });
  test.each([{ reason }, { version: undefined, reason }])('rejects missing version %p', (body) => {
    expect(code(() => parseDeleteProduct(body))).toBe('VALIDATION_FAILED');
  });
  test.each([-1, 1.5, '1', null])('rejects invalid version %p', (version) => {
    expect(code(() => parseDeleteProduct({ version, reason }))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, 1, ''])('rejects missing or non-string reason %p', (value) => {
    expect(code(() => parseDeleteProduct({ version: 1, reason: value }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a reason shorter than 20 characters', () => {
    expect(code(() => parseDeleteProduct({ version: 1, reason: 'x'.repeat(19) }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a reason longer than 1000 characters', () => {
    expect(code(() => parseDeleteProduct({ version: 1, reason: 'x'.repeat(1001) }))).toBe('VALIDATION_FAILED');
  });
  test('rejects control characters in the reason', () => {
    expect(code(() => parseDeleteProduct({ version: 1, reason: `${reason}\u0007` }))).toBe('VALIDATION_FAILED');
  });
  test('rejects unknown fields', () => {
    expect(code(() => parseDeleteProduct({ version: 1, reason, force: true }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a DTO with invalid version and reason together', () => {
    expect(code(() => parseDeleteProduct({ version: -1, reason: 'short' }))).toBe('VALIDATION_FAILED');
  });
});
