import { SUPPLIER_FORM_LIMITS } from '../constants/supplier-management.js';

const PHONE = /^0\d{9}$/u;
// The same shape the backend accepts (utils/mailbox.js); the backend checks it again.
const EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

// MSG03: ten digits starting with 0; spaces, dots and hyphens are dropped. Returns { value } (empty when not given) or { error }.
export function parseSupplierPhoneInput(raw) {
  const digits = (typeof raw === 'string' ? raw : '').trim().replace(/[\s.-]/gu, '');
  if (!digits) return { value: '' };
  return PHONE.test(digits) ? { value: digits } : { error: 'INVALID' };
}

// MSG02. Returns { value } (empty when not given) or { error }.
export function parseSupplierEmailInput(raw) {
  const value = (typeof raw === 'string' ? raw : '').trim();
  if (!value) return { value: '' };
  const [local = ''] = value.split('@');
  return value.length <= SUPPLIER_FORM_LIMITS.emailMax && local.length <= 64 && EMAIL.test(value) ? { value } : { error: 'INVALID' };
}

// The reason each field of the supplier form is wrong, or nothing when it can be sent:
// REQUIRED is MSG01, phone INVALID is MSG03, email INVALID is MSG02, CONTACT_REQUIRED (phone and email) is MSG125.
export function validateSupplierForm(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'REQUIRED';
  const phone = parseSupplierPhoneInput(values.phone);
  const email = parseSupplierEmailInput(values.email);
  if (phone.error) errors.phone = phone.error;
  if (email.error) errors.email = email.error;
  if (!phone.error && !email.error && !phone.value && !email.value) {
    errors.phone = 'CONTACT_REQUIRED';
    errors.email = 'CONTACT_REQUIRED';
  }
  return errors;
}
