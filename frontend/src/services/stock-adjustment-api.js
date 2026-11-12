import { ApiError, createApiClient } from './api-client.js';
import { STOCK_ADJUSTMENT_TYPES, STOCK_ADJUSTMENT_REASON_LABELS } from '../constants/stock-adjustment.js';

const text = value => typeof value === 'string' && value.length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };
function checkProduct(product, stock = false) {
  if (!product || !text(product.id) || !text(product.code) || !text(product.name) || typeof product.visible !== 'boolean'
    || (stock && (!count(product.stockOnHand) || !count(product.quantityHeld) || !Number.isSafeInteger(product.available)))) invalid();
  return product;
}
function checkAdjustment(doc) {
  if (!doc || ['id','code','productId','productCode','productName','recorderId','recorderName'].some(key => !text(doc[key]))
    || !STOCK_ADJUSTMENT_TYPES.some(([key]) => key === doc.type) || !Object.hasOwn(STOCK_ADJUSTMENT_REASON_LABELS,doc.reason)
    || !Number.isSafeInteger(doc.quantity) || doc.quantity < 1 || doc.quantityChange !== (doc.type === 'INCREASE' ? doc.quantity : -doc.quantity)
    || typeof doc.recordedAt !== 'string' || !Number.isFinite(Date.parse(doc.recordedAt))) invalid();
  return doc;
}
function checkPage(response, checkItem) {
  const data = response.data;
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.page) || data.page < 1
    || !Number.isSafeInteger(data.limit) || data.limit < 1 || !count(data.total)) invalid();
  return { ...response, data:data.items.map(item => checkItem(item)), meta:{ ...response.meta, page:{page:data.page,limit:data.limit,total:data.total} } };
}
function queryOf({ search, page = 1, limit } = {}) {
  const params = new globalThis.URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  return params.size ? `?${params}` : '';
}
export function createStockAdjustmentApi(options) {
  const request = createApiClient(options), root = '/admin/stock-adjustments';
  return {
    async listProducts(query, { signal } = {}) {
      return checkPage(await request(`${root}/products${queryOf(query)}`, {signal}), checkProduct);
    },
    async readProduct(productId, { signal } = {}) {
      return checkProduct((await request(`${root}/products/${encodeURIComponent(productId)}`, {signal})).data, true);
    },
    async listAdjustments(query, { signal } = {}) {
      return checkPage(await request(`${root}${queryOf(query)}`, {signal}), checkAdjustment);
    },
    async createAdjustment(body, idempotencyKey) {
      return checkAdjustment((await request(root, {method:'POST',body,idempotencyKey})).data);
    }
  };
}
