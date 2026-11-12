import { ApiError, createApiClient } from './api-client.js';
import { STOCK_STATUSES, STOCK_HISTORY_KINDS } from '../constants/stock-list.js';

const text = value => typeof value === 'string' && value.length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };
function checkStock(product) {
  if (!product || !text(product.id) || !text(product.code) || !text(product.name)
    || !count(product.stockOnHand) || !count(product.quantityHeld) || !Number.isSafeInteger(product.available)
    || !Object.hasOwn(STOCK_STATUSES, product.status)) invalid();
  return product;
}
function checkHistory(data) {
  if (!data || !Array.isArray(data.items) || !(data.nextCursor === null || text(data.nextCursor))) invalid();
  checkStock(data.product);
  for (const item of data.items) {
    if (!item || !text(item.id) || !Object.hasOwn(STOCK_HISTORY_KINDS, item.kind) || !text(item.referenceCode)
      || !text(item.supplierName) || !/^\d{4}-\d{2}-\d{2}$/u.test(item.receivedOn)
      || typeof item.occurredAt !== 'string' || !Number.isFinite(Date.parse(item.occurredAt))
      || !Number.isSafeInteger(item.quantityChange)) invalid();
  }
  return data;
}

// Transport only; available, status and counts are authoritative server values.
export function createStockListApi(options) {
  const request = createApiClient(options);
  return {
    async listStock({ tab = 'ALL', search = '', page = 1, limit } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (tab !== 'ALL') params.set('tab', tab);
      if (search) params.set('search', search);
      if (page > 1) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const response = await request(`/admin/stock-levels${query ? `?${query}` : ''}`, { signal });
      const data = response.data;
      if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.page) || data.page < 1
        || !Number.isSafeInteger(data.limit) || data.limit < 1 || !count(data.total)
        || !data.counts || !count(data.counts.ALL) || !count(data.counts.LOW_STOCK)) invalid();
      return { ...response, data: data.items.map(checkStock),
        meta: { ...response.meta, page: { page: data.page, limit: data.limit, total: data.total }, counts: data.counts } };
    },
    async readHistory(productId, { limit, cursor, signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (limit) params.set('limit', String(limit));
      if (cursor) params.set('cursor', cursor);
      const query = params.toString();
      const response = await request(`/admin/stock-levels/${encodeURIComponent(productId)}/history${query ? `?${query}` : ''}`, { signal });
      return checkHistory(response.data);
    }
  };
}
