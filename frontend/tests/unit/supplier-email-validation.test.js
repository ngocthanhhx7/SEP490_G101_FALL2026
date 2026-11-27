import { parseSupplierEmailInput } from '../../src/utils/supplier-validation.js';

describe('FE-SUP-02 parseSupplierEmailInput', () => {
  test('TC01 normal: trims a valid email and returns the saved value', () => {
    const raw = ' kinhdoanh@minhanpet.vn ';

    const result = parseSupplierEmailInput(raw);

    expect(result).toEqual({ value: 'kinhdoanh@minhanpet.vn' });
  });

  test('TC02 boundary: accepts a valid email at the 254-character maximum', () => {
    const raw = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`;

    const result = parseSupplierEmailInput(raw);

    expect(raw).toHaveLength(254);
    expect(result).toEqual({ value: raw });
  });

  test('TC03 normal: returns an empty value for an empty string', () => {
    const result = parseSupplierEmailInput('');

    expect(result).toEqual({ value: '' });
  });

  test('TC04 abnormal: returns an empty value for whitespace only', () => {
    const result = parseSupplierEmailInput('   ');

    expect(result).toEqual({ value: '' });
  });

  test('TC05 abnormal: returns an empty value for undefined', () => {
    const result = parseSupplierEmailInput(undefined);

    expect(result).toEqual({ value: '' });
  });

  test('TC06 abnormal: returns an empty value for null', () => {
    const result = parseSupplierEmailInput(null);

    expect(result).toEqual({ value: '' });
  });

  test('TC07 abnormal: reports INVALID when the address has no domain', () => {
    const result = parseSupplierEmailInput('kinhdoanh@');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC08 abnormal: reports INVALID when the address contains whitespace', () => {
    const result = parseSupplierEmailInput('kinh doanh@minhanpet.vn');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC09 boundary: reports INVALID when the local part exceeds 64 characters', () => {
    const raw = `${'a'.repeat(65)}@minhanpet.vn`;

    const result = parseSupplierEmailInput(raw);

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC10 boundary: reports INVALID when the address exceeds 254 characters', () => {
    const raw = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;

    const result = parseSupplierEmailInput(raw);

    expect(raw).toHaveLength(255);
    expect(result).toEqual({ error: 'INVALID' });
  });
});
