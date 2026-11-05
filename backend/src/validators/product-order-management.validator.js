import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import { AppError } from '../utils/app-error.js';
import { PRODUCT_ORDER_TABS, PRODUCT_LIMITS, PRODUCT_RETURN_REASONS, PRODUCT_RETURN_LIMITS } from '../constants/product-fields.js';
import { requireOnlyKeys, parseObjectId } from './product.validator.js';

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);
const TRACKING_CODE = /^[A-Za-z0-9._-]{3,64}$/;

// Search text that is a whole Vietnamese phone number (0912 345 678, 0912.345.678, 84912345678, +84912345678)
// as the +84 form that contacts are stored under. Anything else is searched as a code or a name only.
function phoneFromSearch(search) {
  const compact = search.replace(/[\s.()-]/gu, '');
  const national = /^0(\d{9})$/u.exec(compact) ?? /^\+?84(\d{9})$/u.exec(compact);
  return national ? `+84${national[1]}` : undefined;
}

export function parseManagementListQuery(query = {}) {
  const allowed = ['tab', 'search', ...PAGE_QUERY_KEYS];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid('Query is invalid');
  const out = { ...parsePageQuery(query), tab: 'ALL', limit: PRODUCT_LIMITS.defaultPageSize };
  if (query.tab !== undefined) {
    if (!PRODUCT_ORDER_TABS.includes(query.tab)) throw invalid('tab is invalid');
    out.tab = query.tab;
  }
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid('search is invalid');
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) throw invalid('search is invalid');
    if (search) {
      out.search = search;
      const phone = phoneFromSearch(search);
      if (phone) out.phone = phone;
    }
  }
  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!/^\d{1,3}$/.test(String(query.limit)) || limit < 1 || limit > PRODUCT_LIMITS.maxPageSize) throw invalid('limit is invalid');
    out.limit = limit;
  }
  return out;
}

// A missing or blank tracking code is MSG103; a present but malformed one is a plain validation error.
export function parseHandToCarrier(body) {
  requireOnlyKeys(body ?? {}, ['trackingCode']);
  const raw = body?.trackingCode;
  if (raw === undefined || raw === null) return { trackingCode: '' };
  if (typeof raw !== 'string') throw invalid('trackingCode is invalid');
  const trackingCode = raw.trim();
  if (trackingCode === '') return { trackingCode };
  if (!TRACKING_CODE.test(trackingCode)) throw invalid('trackingCode is invalid');
  return { trackingCode };
}

export function parseNoBody(body) {
  requireOnlyKeys(body ?? {}, []);
}

// Free text typed by Admin: trimmed, at most `max` characters, no control characters (a line break is fine when `multiline`).
function cleanText(value, field, max, { multiline = false } = {}) {
  if (typeof value !== 'string') throw invalid(`${field} is invalid`);
  const text = value.normalize('NFC').replace(/\r\n?/gu, '\n').trim();
  const forbidden = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
  if (text.length > max || forbidden.test(text)) throw invalid(`${field} is invalid`);
  return text;
}

// Being returned asks for the carrier's reason (R3 UC-65); the form requires it, R3 has no message for it.
export function parseMarkReturning(body) {
  requireOnlyKeys(body, ['carrierReason'], ['carrierReason']);
  const carrierReason = cleanText(body.carrierReason, 'carrierReason', PRODUCT_RETURN_LIMITS.carrierReasonMax);
  if (!carrierReason) throw invalid('carrierReason is required');
  return { carrierReason };
}

// Confirming a return: the reason, an optional note and, for every line of the order, how many go back on sale.
// Only the shape is checked here; whether a quantity is allowed (MSG104) depends on the order.
export function parseConfirmReturned(body) {
  requireOnlyKeys(body, ['reason', 'note', 'lines'], ['reason', 'lines']);
  if (!PRODUCT_RETURN_REASONS.includes(body.reason)) throw invalid('reason is invalid');
  const note = body.note === undefined ? '' : cleanText(body.note, 'note', PRODUCT_RETURN_LIMITS.noteMax, { multiline: true });
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > PRODUCT_LIMITS.maxCartLines) throw invalid('lines is invalid');
  const lines = body.lines.map((line) => {
    requireOnlyKeys(line, ['productId', 'resellableQuantity'], ['productId', 'resellableQuantity']);
    return { productId: parseObjectId(line.productId, 'productId'), resellableQuantity: line.resellableQuantity };
  });
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw invalid('lines is invalid');
  return { reason: body.reason, ...(note ? { note } : {}), lines };
}
