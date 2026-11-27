import { describe, expect, test } from '@jest/globals';
import { parseConfirmReturned } from '../../src/validators/product-order-management.validator.js';

const productId = 'a'.repeat(24);
const other = 'b'.repeat(24);
const body = (extra = {}) => ({ reason: 'SHOP_FAULT', lines: [{ productId, resellableQuantity: 1 }], ...extra });
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('ORDER-MGMT-IN-03 parseConfirmReturned', () => {
  test('accepts a valid reason and unique return lines', () => {
    expect(parseConfirmReturned(body())).toEqual({ reason: 'SHOP_FAULT', lines: [{ productId, resellableQuantity: 1 }] });
  });
  test('normalizes optional note and leaves quantity validation to the order service', () => {
    expect(parseConfirmReturned(body({ note: ' Box torn\r\nSecond line ' })).note).toBe('Box torn\nSecond line');
    expect(parseConfirmReturned(body({ note: '   ' }))).not.toHaveProperty('note');
    expect(parseConfirmReturned(body({ lines: [{ productId, resellableQuantity: 99 }, { productId: other, resellableQuantity: -1 }] })).lines).toHaveLength(2);
  });
  test.each([undefined, {}, body({ reason: 'OTHER' }), { lines: body().lines }, { reason: 'SHOP_FAULT' }, body({ extra: 1 }), body({ lines: [] }), body({ lines: 'x' }),
    body({ lines: [{ productId }] }), body({ lines: [{ resellableQuantity: 1 }] }), body({ lines: [{ productId: 'bad', resellableQuantity: 1 }] }), body({ lines: [{ productId, resellableQuantity: 1, extra: 1 }] }),
    body({ lines: [{ productId, resellableQuantity: 1 }, { productId, resellableQuantity: 0 }] }), body({ note: 5 }), body({ note: 'x'.repeat(501) }), body({ note: 'a\u0007b' }),
    body({ lines: Array.from({ length: 31 }, (_, index) => ({ productId: String(index).padStart(24, '0'), resellableQuantity: 0 })) })])
    ('rejects invalid confirmed-return DTO %p', (input) => {
      expect(code(() => parseConfirmReturned(input))).toBe('VALIDATION_FAILED');
    });
});
