import { parseSupplierPhoneInput, parseSupplierEmailInput, validateSupplierForm } from '../../src/utils/supplier-validation.js';

test('AC-30 MSG03: a phone is ten digits starting with 0, with spaces, dots and hyphens dropped', () => {
  for (const [typed, value] of [['0936452118', '0936452118'], ['0936 452 118', '0936452118'], [' 0936.452.118 ', '0936452118'], ['0936-452-118', '0936452118']]) {
    expect(parseSupplierPhoneInput(typed)).toEqual({ value });
  }
  for (const typed of ['+84936452118', '84936452118', '936452118', '09364521180', '024 3825 1234', '0936 452 11a', 'abc', '(0936) 452 118']) {
    expect(parseSupplierPhoneInput(typed)).toEqual({ error: 'INVALID' });
  }
  for (const typed of ['', '   ', undefined, null]) expect(parseSupplierPhoneInput(typed)).toEqual({ value: '' });
});

test('AC-30 MSG02: an email must look like an address; empty is allowed here', () => {
  expect(parseSupplierEmailInput(' kinhdoanh@minhanpet.vn ')).toEqual({ value: 'kinhdoanh@minhanpet.vn' });
  for (const typed of ['not-an-email', 'a@b', '@example.test', 'a b@example.test', `${'x'.repeat(250)}@example.test`, `${'x'.repeat(65)}@example.test`]) {
    expect(parseSupplierEmailInput(typed)).toEqual({ error: 'INVALID' });
  }
  for (const typed of ['', '  ', undefined]) expect(parseSupplierEmailInput(typed)).toEqual({ value: '' });
});

test('AC-30 the form reports MSG01, MSG03, MSG02 and MSG125 by field', () => {
  const form = (over = {}) => ({ name: 'Công ty A', phone: '0936 452 118', email: '', ...over });
  expect(validateSupplierForm(form())).toEqual({});
  expect(validateSupplierForm(form({ phone: '', email: 'a@example.test' }))).toEqual({});
  expect(validateSupplierForm(form({ name: '  ' }))).toEqual({ name: 'REQUIRED' });
  expect(validateSupplierForm(form({ phone: '12' }))).toEqual({ phone: 'INVALID' });
  expect(validateSupplierForm(form({ phone: '', email: 'nope' }))).toEqual({ email: 'INVALID' });
  expect(validateSupplierForm(form({ phone: '', email: '' }))).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
  expect(validateSupplierForm(form({ name: '', phone: 'x', email: 'y' }))).toEqual({ name: 'REQUIRED', phone: 'INVALID', email: 'INVALID' });
  expect(validateSupplierForm(form({ phone: 'x', email: '' }))).toEqual({ phone: 'INVALID' });
});
