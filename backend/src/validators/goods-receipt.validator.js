import { AppError } from '../utils/app-error.js';
import { GOODS_RECEIPT_LIMITS, GOODS_RECEIPT_CODE_SHAPE } from '../constants/goods-receipt-fields.js';
import { PRODUCT_LIMITS } from '../constants/product-fields.js';
import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import { requireOnlyKeys } from './product.validator.js';
import { parseText } from './product-management.validator.js';

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);

// A wrong save is answered with `fields` (the supplier, the line list as a whole) and `lineFields` (by line number, from 0).
// Reasons the screen turns into R3 messages: quantityReceived INVALID is MSG113, quantityAccepted INVALID is MSG119,
// rejectReason REQUIRED is MSG120. The others have no R3 message.
function receiptFieldsError(fields, lineFields) {
  return new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { fields, lineFields });
}

const OBJECT_ID = /^[a-f\d]{24}$/i;
const isWhole = (value) => Number.isSafeInteger(value);

// The code in a path such as /goods-receipts/PN-0012. A code that cannot exist is simply not found.
export function parseReceiptCode(value) {
  if (typeof value !== 'string' || !GOODS_RECEIPT_CODE_SHAPE.test(value)) return null;
  return value;
}

// The list of recent receipts takes no query.
export function parseRecentReceiptsQuery(query = {}) {
  if (Object.keys(query).length > 0) throw invalid('Query is invalid');
}

// The product search of the receipt screen: part of a name or a code, and the page. Same keys as the Admin product list's
// search, without the category and pet filters.
export function parseReceiptProductQuery(query = {}) {
  if (Object.keys(query).some((key) => ![...PAGE_QUERY_KEYS, 'search'].includes(key))) throw invalid('Query is invalid');
  const out = parsePageQuery(query);
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid('search is invalid');
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) throw invalid('search is invalid');
    if (search) out.search = search;
  }
  out.limit = Math.min(out.limit, GOODS_RECEIPT_LIMITS.pickerMax);
  return out;
}

// An id as 24 hex characters; the supplier and each product use it.
function parseId(raw) {
  if (raw === undefined || raw === null || raw === '') return { error: 'REQUIRED' };
  return typeof raw === 'string' && OBJECT_ID.test(raw) ? { value: raw } : { error: 'INVALID' };
}

// The quantity received: a whole number from 1 (MSG113). One above the limit is TOO_LARGE, which the input prevents.
function parseReceived(raw) {
  if (!isWhole(raw) || raw < 1) return { error: 'INVALID' };
  return raw > GOODS_RECEIPT_LIMITS.quantityMax ? { error: 'TOO_LARGE' } : { value: raw };
}

// The quantity taken into the shop: a whole number from 0 to the quantity received (MSG119). A missing value is wrong too.
function parseAccepted(raw, received) {
  if (!isWhole(raw) || raw < 0 || raw > GOODS_RECEIPT_LIMITS.quantityMax) return { error: 'INVALID' };
  if (received !== undefined && raw > received) return { error: 'INVALID' };
  return { value: raw };
}

const LINE_KEYS = ['productId', 'quantityReceived', 'quantityAccepted', 'rejectReason'];

// One line. Returns the cleaned line, and the wrong fields by name.
function parseLine(raw, seenProducts) {
  const fields = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !LINE_KEYS.includes(key))) {
    return { fields: { productId: 'INVALID' } };
  }
  const product = parseId(raw.productId);
  if (product.error) fields.productId = product.error;
  else if (seenProducts.has(product.value.toLowerCase())) fields.productId = 'DUPLICATE';
  else seenProducts.add(product.value.toLowerCase());

  const received = parseReceived(raw.quantityReceived);
  if (received.error) fields.quantityReceived = received.error;
  const accepted = parseAccepted(raw.quantityAccepted, received.value);
  if (accepted.error) fields.quantityAccepted = accepted.error;

  // The rejected quantity is worked out, never sent. Only a line that rejects something needs (and keeps) a reason (MSG120).
  let rejectReason = '';
  if (received.value !== undefined && accepted.value !== undefined && received.value > accepted.value) {
    const reason = parseText(raw.rejectReason, { max: GOODS_RECEIPT_LIMITS.rejectReasonMax, required: true });
    if (reason.error) fields.rejectReason = reason.error;
    else rejectReason = reason.value;
  }
  if (Object.keys(fields).length) return { fields };
  return { line: { productId: product.value, quantityReceived: received.value, quantityAccepted: accepted.value,
    quantityRejected: received.value - accepted.value, rejectReason } };
}

// A new receipt: the supplier and the lines. The date, the recorder, the code and the rejected quantities are the system's.
export function parseCreateReceipt(body) {
  requireOnlyKeys(body, ['supplierId', 'lines']);
  const fields = {};
  const lineFields = {};
  const supplier = parseId(body.supplierId);
  if (supplier.error) fields.supplierId = supplier.error;

  const lines = [];
  if (!Array.isArray(body.lines)) fields.lines = 'INVALID';
  else if (body.lines.length === 0) fields.lines = 'REQUIRED';
  else if (body.lines.length > GOODS_RECEIPT_LIMITS.linesMax) fields.lines = 'TOO_MANY';
  else {
    const seen = new Set();
    body.lines.forEach((raw, index) => {
      const result = parseLine(raw, seen);
      if (result.fields) lineFields[index] = result.fields;
      else lines.push(result.line);
    });
  }
  if (Object.keys(fields).length || Object.keys(lineFields).length) throw receiptFieldsError(fields, lineFields);
  return { supplierId: supplier.value, lines };
}
