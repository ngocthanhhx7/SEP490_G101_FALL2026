import { AppError } from '../utils/app-error.js';
import { PRODUCT_ORDER_TABS, PRODUCT_LIMITS } from '../constants/product-fields.js';
import { requireOnlyKeys } from './product.validator.js';

const invalid = (message) => new AppError(422, 'VALIDATION_FAILED', message);
const TRACKING_CODE = /^[A-Za-z0-9._-]{3,64}$/;

export function parseManagementListQuery(query = {}) {
  const allowed = ['tab', 'search', 'limit'];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw invalid('Query is invalid');
  const out = { tab: 'ALL', limit: PRODUCT_LIMITS.defaultPageSize };
  if (query.tab !== undefined) {
    if (!PRODUCT_ORDER_TABS.includes(query.tab)) throw invalid('tab is invalid');
    out.tab = query.tab;
  }
  if (query.search !== undefined) {
    if (typeof query.search !== 'string') throw invalid('search is invalid');
    const search = query.search.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (search.length > PRODUCT_LIMITS.maxSearchLength || /[\u0000-\u001f\u007f]/u.test(search)) throw invalid('search is invalid');
    if (search) out.search = search;
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
