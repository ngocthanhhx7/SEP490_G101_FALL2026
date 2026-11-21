import { describe, expect, test } from '@jest/globals';
import { parseMarkReturning } from '../../src/validators/product-order-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('ORDER-MGMT-IN-02 parseMarkReturning', () => {
  test.each([[' Customer not at home ', 'Customer not at home'], ['x'.repeat(300), 'x'.repeat(300)]])('accepts and normalizes reason %s', (raw, carrierReason) => {
    expect(parseMarkReturning({ carrierReason: raw })).toEqual({ carrierReason });
  });
  test.each([undefined, null, {}, { carrierReason: '' }, { carrierReason: '   ' }, { carrierReason: 7 }, { carrierReason: 'x'.repeat(301) }, { carrierReason: 'a\nb' }, { carrierReason: 'ok', status: 'RETURNED' }])
    ('rejects invalid returning DTO %p', (body) => {
      expect(code(() => parseMarkReturning(body))).toBe('VALIDATION_FAILED');
    });
});
