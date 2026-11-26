import { parseSupplierPhoneInput } from '../../src/utils/supplier-validation.js';

describe('FE-SUP-01 parseSupplierPhoneInput', () => {
  test('TC01 normal: keeps a valid 10-digit phone starting with zero', () => {
    const result = parseSupplierPhoneInput('0936452118');

    expect(result).toEqual({ value: '0936452118' });
  });

  test('TC02 normal: removes spaces before returning a valid phone', () => {
    const result = parseSupplierPhoneInput(' 0936 452 118 ');

    expect(result).toEqual({ value: '0936452118' });
  });

  test('TC03 normal: removes dots before returning a valid phone', () => {
    const result = parseSupplierPhoneInput('0936.452.118');

    expect(result).toEqual({ value: '0936452118' });
  });

  test('TC04 normal: removes hyphens before returning a valid phone', () => {
    const result = parseSupplierPhoneInput('0936-452-118');

    expect(result).toEqual({ value: '0936452118' });
  });

  test('TC05 abnormal: returns an empty value for an empty string', () => {
    const result = parseSupplierPhoneInput('');

    expect(result).toEqual({ value: '' });
  });

  test('TC06 abnormal: returns an empty value for whitespace only', () => {
    const result = parseSupplierPhoneInput('   ');

    expect(result).toEqual({ value: '' });
  });

  test('TC07 abnormal: returns an empty value for undefined', () => {
    const result = parseSupplierPhoneInput(undefined);

    expect(result).toEqual({ value: '' });
  });

  test('TC08 abnormal: returns an empty value for null', () => {
    const result = parseSupplierPhoneInput(null);

    expect(result).toEqual({ value: '' });
  });

  test('TC09 abnormal: reports INVALID for the unsupported +84 form', () => {
    const result = parseSupplierPhoneInput('+84936452118');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC10 abnormal: reports INVALID for parentheses that are not normalized', () => {
    const result = parseSupplierPhoneInput('(0936) 452 118');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC11 boundary: reports INVALID for a 9-digit phone', () => {
    const result = parseSupplierPhoneInput('936452118');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC12 boundary: reports INVALID for an 11-digit landline', () => {
    const result = parseSupplierPhoneInput('02438251234');

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC13 abnormal: reports INVALID for a numeric value, matching the backend parser', () => {
    const result = parseSupplierPhoneInput(936452118);

    expect(result).toEqual({ error: 'INVALID' });
  });

  test('TC14 abnormal: reports INVALID for an object value, matching the backend parser', () => {
    const result = parseSupplierPhoneInput({ phone: '0936452118' });

    expect(result).toEqual({ error: 'INVALID' });
  });
});
