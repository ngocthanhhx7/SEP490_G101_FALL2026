import { validateSupplierForm } from '../../src/utils/supplier-validation.js';

const form = (overrides = {}) => ({ name: 'Công ty Minh An', phone: '0936 452 118', email: '', ...overrides });

describe('FE-SUP-03 validateSupplierForm', () => {
  test('TC01 normal: returns no errors for a valid normalized phone and does not mutate the form', () => {
    const values = Object.freeze(form());

    const result = validateSupplierForm(values);

    expect(result).toEqual({});
    expect(values).toEqual({ name: 'Công ty Minh An', phone: '0936 452 118', email: '' });
  });

  test('TC02 normal: returns no errors when email is the only contact', () => {
    const values = form({ phone: '', email: 'kinhdoanh@minhanpet.vn' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({});
  });

  test('TC03 boundary: accepts the 10-digit phone after spaces, dots, and hyphens are removed', () => {
    const values = form({ phone: ' 0936.452-118 ' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({});
  });

  test('TC04 boundary: accepts an email at the 254-character maximum', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`;
    const values = form({ phone: '', email });

    const result = validateSupplierForm(values);

    expect(email).toHaveLength(254);
    expect(result).toEqual({});
  });

  test('TC05 abnormal: reports REQUIRED for a whitespace-only name', () => {
    const values = form({ name: '   ' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({ name: 'REQUIRED' });
  });

  test('TC06 abnormal: reports INVALID for a phone that cannot be saved', () => {
    const values = form({ phone: '+84936452118' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({ phone: 'INVALID' });
  });

  test('TC07 abnormal: reports INVALID for an email with an invalid address shape', () => {
    const values = form({ phone: '', email: 'not-an-email' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({ email: 'INVALID' });
  });

  test('TC08 boundary: reports INVALID for an email exceeding 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`;
    const values = form({ phone: '', email });

    const result = validateSupplierForm(values);

    expect(email).toHaveLength(255);
    expect(result).toEqual({ email: 'INVALID' });
  });

  test('TC09 abnormal: reports CONTACT_REQUIRED on both contacts when neither is supplied', () => {
    const values = form({ phone: '  ', email: ' ' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
  });

  test('TC10 abnormal: aggregates name, phone, and email errors without CONTACT_REQUIRED', () => {
    const values = form({ name: '', phone: 'x', email: 'nope' });

    const result = validateSupplierForm(values);

    expect(result).toEqual({ name: 'REQUIRED', phone: 'INVALID', email: 'INVALID' });
  });

  test('TC11 exception: throws TypeError when values is null', () => {
    expect(() => validateSupplierForm(null)).toThrow(TypeError);
  });

  test('TC12 exception: throws TypeError when values is undefined', () => {
    expect(() => validateSupplierForm(undefined)).toThrow(TypeError);
  });

  test('TC13 exception: throws TypeError when the required name property is missing', () => {
    expect(() => validateSupplierForm({ phone: '0936452118', email: '' })).toThrow(TypeError);
  });
});
