import { AppError } from '../utils/app-error.js';
import { STOCK_TABS } from '../constants/stock-list-fields.js';
import { PRODUCT_LIMITS } from '../constants/product-fields.js';
import { parsePageQuery, PAGE_QUERY_KEYS } from './pagination.validator.js';

const invalid = () => new AppError(422, 'VALIDATION_FAILED', 'Stock query is invalid');
function only(query, keys) {
  if (Object.keys(query).some(key => !keys.includes(key))) throw invalid();
}
export function parseStockQuery(query = {}) {
  only(query, [...PAGE_QUERY_KEYS, 'tab', 'search']);
  const out = { ...parsePageQuery(query), tab: query.tab ?? 'ALL', search: '' };
  if (!STOCK_TABS.includes(out.tab)) throw invalid();
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid();
    out.search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (out.search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(out.search)) throw invalid();
  }
  return out;
}
export function parseStockHistoryQuery(query = {}) {
  only(query, ['limit', 'cursor']);
  const { limit } = parsePageQuery(query.limit === undefined ? {} : { limit: query.limit });
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/u.test(query.cursor))) throw invalid();
  return { limit, cursor: query.cursor };
}

// Signed data still gets a shape check before entering a Mongo query.
export function parseStockHistoryPosition(value) {
  if (!value || typeof value.id !== 'string' || !/^[a-f\d]{24}$/iu.test(value.id)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw invalid();
  return { id: value.id, createdAt: new Date(value.createdAt) };
}
