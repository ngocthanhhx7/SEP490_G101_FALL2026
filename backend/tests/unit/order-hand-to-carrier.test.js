import { describe, expect, test } from '@jest/globals';
import { parseHandToCarrier } from '../../src/validators/product-order-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('ORDER-MGMT-IN-01 parseHandToCarrier', () => {
  test.each([[' VN7290018342 ', 'VN7290018342'], ['A_1', 'A_1'], ['A'.repeat(64), 'A'.repeat(64)]])('trims valid tracking code %s', (raw, trackingCode) => {
    expect(parseHandToCarrier({ trackingCode: raw })).toEqual({ trackingCode });
  });
  test.each([undefined, {}, { trackingCode: null }, { trackingCode: '   ' }])('returns empty tracking code for missing input %p', (body) => {
    expect(parseHandToCarrier(body)).toEqual({ trackingCode: '' });
  });
  test.each([{ trackingCode: 'ab' }, { trackingCode: 'VN 729' }, { trackingCode: 'A'.repeat(65) }, { trackingCode: 123 }, { trackingCode: 'VN729', status: 'DELIVERED' }])
    ('rejects invalid tracking DTO %p', (body) => {
      expect(code(() => parseHandToCarrier(body))).toBe('VALIDATION_FAILED');
    });
});
