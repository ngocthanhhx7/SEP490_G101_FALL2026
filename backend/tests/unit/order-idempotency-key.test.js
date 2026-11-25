import { describe, expect, test } from '@jest/globals';
import { parseIdempotencyKey } from '../../src/validators/product-order.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('ORDER-IN-01 parseIdempotencyKey', () => {
  test.each(['order-01', 'A_b.c:d-0123456789', 'a'.repeat(128)])('accepts bounded key %s', (key) => {
    expect(parseIdempotencyKey(key)).toBe(key);
  });
  test.each([undefined, null, '', '   ', 'short', 'a'.repeat(129), 'order key', 'order/key', 1, {}])('rejects malformed key %p', (key) => {
    expect(code(() => parseIdempotencyKey(key))).toBe('VALIDATION_FAILED');
  });
});
