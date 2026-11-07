import { AppError } from '../utils/app-error.js';
import { PRODUCT_CATEGORIES, PRODUCT_PET_TYPES, PRODUCT_LIMITS, PRODUCT_MANAGEMENT_LIMITS } from '../constants/product-fields.js';
import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import { requireOnlyKeys } from './product.validator.js';

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);

export function parseDeleteProduct(body) {
  requireOnlyKeys(body, ['version', 'reason'], ['version', 'reason']);
  if (!Number.isSafeInteger(body.version) || body.version < 0) throw invalid('version is invalid');
  if (typeof body.reason !== 'string') throw invalid('reason is required');
  const reason = body.reason.normalize('NFC').trim();
  if (reason.length < 20 || reason.length > 1000 || /[\u0000-\u001f\u007f]/u.test(reason)) {
    throw invalid('Deletion reason must contain 20 to 1000 characters without control characters');
  }
  return { version: body.version, reason };
}

// A field that does not pass is reported as `fields: { name: 'REQUIRED' }` so the screen can show the right message:
// REQUIRED is MSG01, WHOLE_NUMBER is MSG113; TOO_LARGE, TOO_LONG and INVALID have no R3 message.
function fieldsError(fields) {
  return new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { fields });
}

export function parseAdminProductQuery(query = {}) {
  const allowed = ['search', 'category', 'petType', ...PAGE_QUERY_KEYS];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid('Query is invalid');
  const out = parsePageQuery(query);
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid('search is invalid');
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) throw invalid('search is invalid');
    if (search) out.search = search;
  }
  if (query.category !== undefined) {
    if (!PRODUCT_CATEGORIES.includes(query.category)) throw invalid('category is invalid');
    out.category = query.category;
  }
  if (query.petType !== undefined) {
    if (!PRODUCT_PET_TYPES.includes(query.petType)) throw invalid('petType is invalid');
    out.petType = query.petType;
  }
  return out;
}

// Each parser returns `{ value }` or `{ error }`.
export function parseText(raw, { max, required, multiline = false }) {
  if (raw === undefined || raw === null) return required ? { error: 'REQUIRED' } : { value: '' };
  if (typeof raw !== 'string') return { error: 'INVALID' };
  const value = raw.normalize('NFC').replace(/\r\n?/gu, '\n').trim();
  if (!value) return required ? { error: 'REQUIRED' } : { value: '' };
  const forbidden = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (value.length > max) return { error: 'TOO_LONG' };
  if (forbidden.test(value)) return { error: 'INVALID' };
  return { value };
}

function parseChoice(raw, choices) {
  if (raw === undefined || raw === null || raw === '') return { error: 'REQUIRED' };
  return choices.includes(raw) ? { value: raw } : { error: 'INVALID' };
}

const GROUPED_PRICE = /^[1-9]\d{0,2}(\.\d{3})+$/u;
const PLAIN_PRICE = /^[1-9]\d*$/u;

// Price: a whole number of VND above 0, as 250000 or 250.000 (a number or text). Anything else is WHOLE_NUMBER (MSG113);
// a number above the limit is TOO_LARGE, which the screen's input already prevents.
export function parseSellingPrice(raw) {
  let digits;
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 1) return { error: 'WHOLE_NUMBER' };
    digits = String(raw);
  } else if (typeof raw === 'string') {
    const text = raw.trim();
    if (!GROUPED_PRICE.test(text) && !PLAIN_PRICE.test(text)) return { error: 'WHOLE_NUMBER' };
    digits = text.replaceAll('.', '');
  } else {
    return { error: 'WHOLE_NUMBER' };
  }
  if (digits.length > 12 || Number(digits) > PRODUCT_MANAGEMENT_LIMITS.priceMax) return { error: 'TOO_LARGE' };
  return { value: Number(digits) };
}

const parsers = {
  name: (raw) => parseText(raw, { max: PRODUCT_MANAGEMENT_LIMITS.nameMax, required: true }),
  category: (raw) => parseChoice(raw, PRODUCT_CATEGORIES),
  petType: (raw) => parseChoice(raw, PRODUCT_PET_TYPES),
  sellingPrice: parseSellingPrice,
  description: (raw) => parseText(raw, { max: PRODUCT_MANAGEMENT_LIMITS.descriptionMax, required: false, multiline: true })
};

function parseFields(body, names) {
  const values = {};
  const fields = {};
  for (const name of names) {
    const result = parsers[name](body[name]);
    if (result.error) fields[name] = result.error;
    else values[name] = result.value;
  }
  if (Object.keys(fields).length) throw fieldsError(fields);
  return values;
}

// A new product: name, category, pet type and price are needed; the description is optional.
// The code, the stock and the Hidden state are not the Admin's to send.
export function parseCreateProduct(body) {
  requireOnlyKeys(body, ['name', 'category', 'petType', 'sellingPrice', 'description']);
  return parseFields(body, ['name', 'category', 'petType', 'sellingPrice', 'description']);
}

// An edit: `version` (the one the Admin saw) and any of the editable fields. The code and the stock cannot be sent.
export function parseUpdateProduct(body) {
  requireOnlyKeys(body, ['version', 'name', 'category', 'petType', 'sellingPrice', 'description', 'visible'], ['version']);
  if (!Number.isSafeInteger(body.version) || body.version < 0) throw invalid('version is invalid');
  const present = ['name', 'category', 'petType', 'sellingPrice', 'description'].filter((name) => body[name] !== undefined);
  if (body.visible !== undefined && typeof body.visible !== 'boolean') throw invalid('visible is invalid');
  if (present.length === 0 && body.visible === undefined) throw invalid('Nothing to change');
  return { version: body.version, ...parseFields(body, present), ...(body.visible === undefined ? {} : { visible: body.visible }) };
}
