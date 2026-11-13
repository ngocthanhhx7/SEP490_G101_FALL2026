import { AppError } from '../utils/app-error.js';
import { PRODUCT_LIMITS } from '../constants/product-fields.js';
import { COUNTER_CONTACT_MAX_LENGTH } from '../constants/counter-sale-fields.js';
import { parseObjectId, parseQuantity, requireOnlyKeys } from './product.validator.js';
import { parsePageQuery, PAGE_QUERY_KEYS } from './pagination.validator.js';

const invalid = fields => new AppError(422, 'VALIDATION_FAILED', 'Counter sale input is invalid', { fields });
function parseLines(lines, allowEmpty) {
  if (!Array.isArray(lines) || lines.length < (allowEmpty ? 0 : 1) || lines.length > PRODUCT_LIMITS.maxCartLines) {
    throw invalid({ lines: 'INVALID' });
  }
  const parsed = lines.map(line => {
    requireOnlyKeys(line, ['productId', 'quantity'], ['productId', 'quantity']);
    return { productId: parseObjectId(line.productId, 'productId').toLowerCase(), quantity: parseQuantity(line.quantity) };
  });
  if (new Set(parsed.map(line => line.productId)).size !== parsed.length) throw invalid({ lines: 'DUPLICATE' });
  return parsed;
}
export function parseCounterCreate(body) {
  requireOnlyKeys(body, ['lines', 'customerId'], ['lines']);
  return { lines: parseLines(body.lines, false),
    ...(body.customerId === undefined ? {} : { customerId: parseObjectId(body.customerId, 'customerId').toLowerCase() }) };
}
export function parseCounterPreview(body) {
  requireOnlyKeys(body, ['lines', 'customerId'], ['lines']);
  return { lines: parseLines(body.lines, true),
    ...(body.customerId === undefined ? {} : { customerId: parseObjectId(body.customerId, 'customerId').toLowerCase() }) };
}
export function parseCounterPage(query = {}) {
  if (Object.keys(query).some(key => !PAGE_QUERY_KEYS.includes(key))) throw invalid({ query: 'INVALID' });
  return parsePageQuery(query);
}
export function parseCounterProductQuery(query = {}) {
  if (Object.keys(query).some(key => ![...PAGE_QUERY_KEYS, 'search'].includes(key))) throw invalid({ query: 'INVALID' });
  const out = parsePageQuery(query);
  if (query.search !== undefined) {
    if (typeof query.search !== 'string' || /[\u0000-\u001f\u007f]/u.test(query.search)) throw invalid({ search: 'INVALID' });
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength) throw invalid({ search: 'TOO_LONG' });
    if (search) out.search = search;
  }
  return out;
}
export function parseCounterContact(body) {
  requireOnlyKeys(body, ['contact'], ['contact']);
  if (typeof body.contact !== 'string' || /[\u0000-\u001f\u007f]/u.test(body.contact)) throw invalid({ contact: 'INVALID' });
  const contact = body.contact.trim();
  if (!contact) throw invalid({ contact: 'REQUIRED' });
  if (contact.length > COUNTER_CONTACT_MAX_LENGTH) throw invalid({ contact: 'TOO_LONG' });
  return contact;
}
