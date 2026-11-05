import { describe, test, expect } from '@jest/globals';
import {
  parseManagementListQuery, parseHandToCarrier, parseNoBody, parseMarkReturning, parseConfirmReturned
} from '../../src/validators/product-order-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('parseManagementListQuery', () => {
  test('defaults to every order and normalises the search text', () => {
    expect(parseManagementListQuery({})).toEqual({ page: 1, tab: 'ALL', limit: 20 });
    expect(parseManagementListQuery({ tab: 'PREPARE', search: '  Hoàng   Mai ', limit: '5' }))
      .toEqual({ page: 1, tab: 'PREPARE', search: 'Hoàng Mai', limit: 5 });
    expect(parseManagementListQuery({ search: '   ' })).toEqual({ page: 1, tab: 'ALL', limit: 20 });
  });

  test('AC-19 reads a whole phone number in the search as its +84 form and ignores partial numbers', () => {
    for (const typed of ['0912345678', ' 0912 345 678 ', '0912.345.678', '(0912) 345-678', '84912345678', '+84912345678']) {
      expect(parseManagementListQuery({ search: typed }).phone).toBe('+84912345678');
    }
    for (const typed of ['0912', '091234567', '09123456789', '+8491234567', 'DH-0012', 'Mai 0912345678', '1912345678']) {
      expect(parseManagementListQuery({ search: typed })).not.toHaveProperty('phone');
    }
    expect(parseManagementListQuery({ search: '0912345678' }).search).toBe('0912345678');
  });

  test('rejects unknown keys, tabs, arrays and out-of-range limits', () => {
    expect(code(() => parseManagementListQuery({ tab: 'DONE' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseManagementListQuery({ status: 'PLACED' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseManagementListQuery({ search: ['a'] }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseManagementListQuery({ limit: '0' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseManagementListQuery({ limit: '51' }))).toBe('VALIDATION_FAILED');
  });
});

describe('parseHandToCarrier', () => {
  test('trims the tracking code and reports a missing or blank one as empty', () => {
    expect(parseHandToCarrier({ trackingCode: ' VN7290018342 ' })).toEqual({ trackingCode: 'VN7290018342' });
    expect(parseHandToCarrier({})).toEqual({ trackingCode: '' });
    expect(parseHandToCarrier(undefined)).toEqual({ trackingCode: '' });
    expect(parseHandToCarrier({ trackingCode: '   ' })).toEqual({ trackingCode: '' });
  });

  test('rejects malformed codes, wrong types and extra keys', () => {
    expect(code(() => parseHandToCarrier({ trackingCode: 'ab' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseHandToCarrier({ trackingCode: 'VN 729' }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseHandToCarrier({ trackingCode: 'A'.repeat(65) }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseHandToCarrier({ trackingCode: 12345 }))).toBe('VALIDATION_FAILED');
    expect(code(() => parseHandToCarrier({ trackingCode: 'VN7290018342', status: 'DELIVERED' }))).toBe('VALIDATION_FAILED');
  });
});

describe('parseMarkReturning', () => {
  test('AC-04 requires the carrier reason and trims it', () => {
    expect(parseMarkReturning({ carrierReason: '  Customer not at home ' })).toEqual({ carrierReason: 'Customer not at home' });
    expect(parseMarkReturning({ carrierReason: 'x'.repeat(300) }).carrierReason).toHaveLength(300);
  });

  test('AC-04 rejects a missing, blank, long or malformed reason and extra keys', () => {
    for (const body of [undefined, null, {}, { carrierReason: '' }, { carrierReason: '   ' }, { carrierReason: 7 }, { carrierReason: 'x'.repeat(301) },
      { carrierReason: 'a\nb' }, { carrierReason: 'ok', status: 'RETURNED' }]) {
      expect(code(() => parseMarkReturning(body))).toBe('VALIDATION_FAILED');
    }
  });
});

describe('parseConfirmReturned', () => {
  const productId = 'a'.repeat(24), other = 'b'.repeat(24);
  const body = (extra = {}) => ({ reason: 'SHOP_FAULT', lines: [{ productId, resellableQuantity: 1 }], ...extra });

  test('AC-04 keeps the reason, the optional note and the quantity of each line as sent', () => {
    expect(parseConfirmReturned(body())).toEqual({ reason: 'SHOP_FAULT', lines: [{ productId, resellableQuantity: 1 }] });
    expect(parseConfirmReturned(body({ note: ' Box torn\r\nSecond line ' })).note).toBe('Box torn\nSecond line');
    expect(parseConfirmReturned(body({ note: '   ' }))).not.toHaveProperty('note');
    // Whether a quantity is allowed depends on the order (MSG104), so odd values pass through to the service.
    expect(parseConfirmReturned(body({ lines: [{ productId, resellableQuantity: 99 }, { productId: other, resellableQuantity: -1 }] })).lines).toHaveLength(2);
  });

  test('AC-04 rejects an unknown reason, a bad shape, duplicates and control characters', () => {
    const bad = [undefined, {}, body({ reason: 'OTHER' }), { lines: body().lines }, { reason: 'SHOP_FAULT' }, body({ extra: 1 }),
      body({ lines: [] }), body({ lines: 'x' }), body({ lines: [{ productId }] }), body({ lines: [{ resellableQuantity: 1 }] }),
      body({ lines: [{ productId: 'nope', resellableQuantity: 1 }] }), body({ lines: [{ productId, resellableQuantity: 1, extra: 1 }] }),
      body({ lines: [{ productId, resellableQuantity: 1 }, { productId, resellableQuantity: 0 }] }),
      body({ note: 5 }), body({ note: 'x'.repeat(501) }), body({ note: 'a\u0007b' }),
      body({ lines: Array.from({ length: 51 }, (_, i) => ({ productId: String(i).padStart(24, '0'), resellableQuantity: 0 })) })];
    for (const input of bad) expect(code(() => parseConfirmReturned(input))).toBe('VALIDATION_FAILED');
  });
});

describe('parseNoBody', () => {
  test('accepts an empty body and rejects any field', () => {
    expect(code(() => parseNoBody({}))).toBeNull();
    expect(code(() => parseNoBody(undefined))).toBeNull();
    expect(code(() => parseNoBody({ status: 'DELIVERED' }))).toBe('VALIDATION_FAILED');
  });
});
