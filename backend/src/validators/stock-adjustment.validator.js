import { AppError } from '../utils/app-error.js';
import { STOCK_ADJUSTMENT_TYPES, STOCK_ADJUSTMENT_REASONS, STOCK_ADJUSTMENT_LIMITS } from '../constants/stock-adjustment-fields.js';
import { PRODUCT_LIMITS } from '../constants/product-fields.js';
import { parsePageQuery, PAGE_QUERY_KEYS } from './pagination.validator.js';
import { requireOnlyKeys } from './product.validator.js';

const invalid = (fields) => new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid', { fields });
export function parseStockAdjustment(body) {
  requireOnlyKeys(body, ['productId', 'type', 'quantity', 'reason']);
  const fields = {};
  if (typeof body.productId !== 'string' || !/^[a-f\d]{24}$/iu.test(body.productId)) fields.productId = 'INVALID';
  if (!STOCK_ADJUSTMENT_TYPES.includes(body.type)) fields.type = 'REQUIRED';
  if (!STOCK_ADJUSTMENT_REASONS.includes(body.reason)) fields.reason = 'REQUIRED';
  if (!Number.isSafeInteger(body.quantity) || body.quantity < 1) fields.quantity = 'INVALID';
  else if (body.quantity > STOCK_ADJUSTMENT_LIMITS.quantityMax) fields.quantity = 'TOO_LARGE';
  if (Object.keys(fields).length) throw invalid(fields);
  return { productId: body.productId.toLowerCase(), type: body.type, quantity: body.quantity, reason: body.reason };
}
export function parseAdjustmentQuery(query = {}) {
  if (Object.keys(query).some(key => !PAGE_QUERY_KEYS.includes(key))) throw invalid({ query: 'INVALID' });
  return parsePageQuery(query);
}
export function parseAdjustmentProductQuery(query = {}) {
  if (Object.keys(query).some(key => ![...PAGE_QUERY_KEYS, 'search'].includes(key))) throw invalid({ query: 'INVALID' });
  const result = parsePageQuery(query);
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid({ search: 'INVALID' });
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) throw invalid({ search: 'INVALID' });
    if (search) result.search = search;
  }
  return result;
}
