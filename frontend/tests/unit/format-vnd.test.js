import { formatVnd } from '../../src/utils/product-format.js';

describe('FE-MONEY-03 formatVnd', () => {
  test('UTCID01 normal: formats zero VND', () => {
    expect(formatVnd(0)).toBe('0 đ');
  });

  test('UTCID02 normal: adds Vietnamese grouping and the VND suffix', () => {
    expect(formatVnd(250000)).toBe('250.000 đ');
  });

  test('UTCID03 normal: preserves a negative safe integer for a signed monetary amount', () => {
    expect(formatVnd(-1234)).toBe('-1.234 đ');
  });

  test('UTCID04 boundary: formats Number.MAX_SAFE_INTEGER', () => {
    expect(formatVnd(Number.MAX_SAFE_INTEGER)).toBe('9.007.199.254.740.991 đ');
  });

  test('UTCID05 boundary: formats Number.MIN_SAFE_INTEGER', () => {
    expect(formatVnd(Number.MIN_SAFE_INTEGER)).toBe('-9.007.199.254.740.991 đ');
  });

  test('UTCID06 abnormal: returns empty text for a fractional amount', () => {
    expect(formatVnd(1.5)).toBe('');
  });

  test('UTCID07 abnormal: returns empty text for NaN', () => {
    expect(formatVnd(Number.NaN)).toBe('');
  });

  test('UTCID08 abnormal: returns empty text for infinity', () => {
    expect(formatVnd(Number.POSITIVE_INFINITY)).toBe('');
  });

  test('UTCID09 abnormal: returns empty text for a numeric string', () => {
    expect(formatVnd('250000')).toBe('');
  });

  test('UTCID10 abnormal: returns empty text for null and undefined', () => {
    expect(formatVnd(null)).toBe('');
    expect(formatVnd(undefined)).toBe('');
  });
});
