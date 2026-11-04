import { AppError } from '../utils/app-error.js';
import { isMailbox } from '../utils/mailbox.js';
import { supplierNameKey } from '../utils/supplier-name.js';
import { SUPPLIER_TABS, SUPPLIER_LIMITS } from '../constants/supplier-fields.js';
import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import { parseObjectId, requireOnlyKeys } from './product.validator.js';
import { parseText } from './product-management.validator.js';

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);

// A field that does not pass is reported as `fields: { phone: 'INVALID' }` so the screen can show the right message:
// REQUIRED is MSG01, phone INVALID is MSG03, email INVALID is MSG02, CONTACT_REQUIRED (on phone and email) is MSG125.
function fieldsError(fields) {
  return new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { fields });
}

export function parseSupplierQuery(query = {}) {
  if (Object.keys(query).some((key) => ![...PAGE_QUERY_KEYS, 'status'].includes(key))) throw invalid('Query is invalid');
  const out = parsePageQuery(query);
  out.status = 'ALL';
  if (query.status !== undefined) {
    if (!SUPPLIER_TABS.includes(query.status)) throw invalid('status is invalid');
    out.status = query.status;
  }
  return out;
}

// Each parser returns `{ value }` or `{ error }`.
const PHONE = /^0\d{9}$/u;

// MSG03: ten digits starting with 0. Spaces, dots and hyphens between the digits are dropped, so "0936 452 118" is fine;
// +84 forms and eleven-digit landlines are not. Empty means "not given" (MSG125 decides whether that is allowed).
export function parseSupplierPhone(raw) {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'INVALID' };
  const digits = raw.trim().replace(/[\s.-]/gu, '');
  if (!digits) return { value: '' };
  return PHONE.test(digits) ? { value: digits } : { error: 'INVALID' };
}

// MSG02. Empty means "not given".
export function parseSupplierEmail(raw) {
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw !== 'string') return { error: 'INVALID' };
  const value = raw.trim();
  if (!value) return { value: '' };
  return value.length <= SUPPLIER_LIMITS.emailMax && isMailbox(value) ? { value } : { error: 'INVALID' };
}

function parseProductIds(raw) {
  if (!Array.isArray(raw)) return { error: 'INVALID' };
  if (raw.length > SUPPLIER_LIMITS.productsMax) return { error: 'TOO_MANY' };
  const ids = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return { error: 'INVALID' };
    let id;
    try { id = parseObjectId(entry, 'productId'); } catch { return { error: 'INVALID' }; }
    if (!ids.includes(String(id))) ids.push(String(id));
  }
  return { value: ids };
}

const parsers = {
  name: (raw) => {
    const result = parseText(raw, { max: SUPPLIER_LIMITS.nameMax, required: true });
    return result.error ? result : { value: result.value.replace(/\s+/gu, ' ') };
  },
  contactName: (raw) => parseText(raw, { max: SUPPLIER_LIMITS.contactNameMax, required: false }),
  phone: parseSupplierPhone,
  email: parseSupplierEmail,
  productIds: parseProductIds
};

// Every wrong field is collected, so one answer tells the screen about all of them.
function collectFields(body, names) {
  const values = {};
  const fields = {};
  for (const name of names) {
    const result = parsers[name](body[name]);
    if (result.error) fields[name] = result.error;
    else values[name] = result.value;
  }
  return { values, fields };
}

// A supplier needs a phone number or an email (MSG125). Called with the values that will be saved.
const lacksContact = ({ phone, email }) => !phone && !email;
export function requireContact(contact) {
  if (lacksContact(contact)) throw fieldsError({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
}

// What gets saved for a name: the name as shown, and the key it is compared by.
const withNameKey = (values) => (values.name === undefined ? values : { ...values, nameKey: supplierNameKey(values.name) });

const EDITABLE = ['name', 'contactName', 'phone', 'email', 'productIds'];

// A new supplier: the name is needed, and at least a phone number or an email. Status and version are the system's.
export function parseCreateSupplier(body) {
  requireOnlyKeys(body, EDITABLE);
  const { values, fields } = collectFields({ productIds: [], ...body }, EDITABLE);
  // A missing contact is reported together with the other wrong fields, unless a given phone or email was itself wrong.
  if (!fields.phone && !fields.email && lacksContact(values)) {
    fields.phone = 'CONTACT_REQUIRED';
    fields.email = 'CONTACT_REQUIRED';
  }
  if (Object.keys(fields).length) throw fieldsError(fields);
  return withNameKey(values);
}

// An edit: `version` (the one the Admin saw) and any of the editable fields. The contact rule is checked again by the
// service against what is saved, because an edit may clear one of the two.
export function parseUpdateSupplier(body) {
  requireOnlyKeys(body, ['version', ...EDITABLE], ['version']);
  if (!Number.isSafeInteger(body.version) || body.version < 0) throw invalid('version is invalid');
  const present = EDITABLE.filter((name) => body[name] !== undefined);
  if (present.length === 0) throw invalid('Nothing to change');
  const { values, fields } = collectFields(body, present);
  if (Object.keys(fields).length) throw fieldsError(fields);
  return { version: body.version, ...withNameKey(values) };
}

// Stop and resume carry only the version the Admin saw.
export function parseSupplierVersion(body) {
  requireOnlyKeys(body ?? {}, ['version'], ['version']);
  if (!Number.isSafeInteger(body.version) || body.version < 0) throw invalid('version is invalid');
  return body.version;
}
