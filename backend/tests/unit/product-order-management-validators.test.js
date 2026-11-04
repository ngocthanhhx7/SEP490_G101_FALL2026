import { describe, test, expect } from '@jest/globals';
import { parseManagementListQuery, parseHandToCarrier, parseNoBody } from '../../src/validators/product-order-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('parseManagementListQuery', () => {
  test('defaults to every order and normalises the search text', () => {
    expect(parseManagementListQuery({})).toEqual({ tab: 'ALL', limit: 20 });
    expect(parseManagementListQuery({ tab: 'PREPARE', search: '  Hoàng   Mai ', limit: '5' }))
      .toEqual({ tab: 'PREPARE', search: 'Hoàng Mai', limit: 5 });
    expect(parseManagementListQuery({ search: '   ' })).toEqual({ tab: 'ALL', limit: 20 });
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

describe('parseNoBody', () => {
  test('accepts an empty body and rejects any field', () => {
    expect(code(() => parseNoBody({}))).toBeNull();
    expect(code(() => parseNoBody(undefined))).toBeNull();
    expect(code(() => parseNoBody({ status: 'DELIVERED' }))).toBe('VALIDATION_FAILED');
  });
});
