import { ApiError, createApiClient } from './api-client.js';
import { COUNTER_STATUS_LABELS } from '../constants/counter-sale.js';

const text = value => typeof value === 'string' && value.length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };
function checkLines(lines) {
  if (!Array.isArray(lines)) invalid();
  for (const line of lines) if (!text(line.productId) || !text(line.productName) || !text(line.productCode)
    || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || !count(line.unitPrice) || !count(line.lineTotal)) invalid();
}
function checkTotals(data) {
  if (!data || !['subtotal', 'tierDiscount', 'total'].every(field => count(data[field])) || data.tierDiscount > data.subtotal
    || data.total !== data.subtotal - data.tierDiscount
    || (data.tierCode !== null && data.tierCode !== undefined && !['MEMBER', 'SILVER', 'GOLD'].includes(data.tierCode))) invalid();
  checkLines(data.lines); return data;
}
function checkOrder(data) {
  checkTotals(data);
  if (!text(data.id) || !/^DH-\d{4,}$/u.test(data.code ?? '') || data.channel !== 'COUNTER'
    || !Object.hasOwn(COUNTER_STATUS_LABELS, data.status) || typeof data.paid !== 'boolean'
    || data.receiveMethod !== 'COUNTER' || data.paymentMethod !== 'COUNTER_CASH'
    || (data.customer !== null && (!text(data.customer?.id) || !text(data.customer?.displayName)))) invalid();
  if (data.paid && (!count(data.cashPayment?.amount) || data.cashPayment.amount !== data.total
    || !Number.isFinite(Date.parse(data.cashPayment.receivedAt)) || !text(data.cashPayment.receivedBy))) invalid();
  return data;
}
function checkPage(response, check) {
  const data = response.data;
  if (!data || !Array.isArray(data.items) || !count(data.total) || !Number.isInteger(data.page) || data.page < 1
    || !Number.isInteger(data.limit) || data.limit < 1 || data.limit > 50) invalid();
  return { data: data.items.map(check), meta: { page: { page: data.page, limit: data.limit, total: data.total } } };
}
function checkProduct(p) {
  if (!p || !text(p.id) || !text(p.name) || !text(p.code) || !count(p.sellingPrice) || !count(p.available)) invalid();
  return p;
}
export function createCounterSaleApi(options) {
  const request = createApiClient(options), root = '/admin/counter-orders';
  const one = async (path, opts) => { const result = await request(path, opts); if (result.pending) throw new ApiError('COMMAND_PENDING', 202); return checkOrder(result.data); };
  const query = values => { const params = new globalThis.URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value) params.set(key, String(value)); return params.toString(); };
  return {
    async products(values, { signal } = {}) { return checkPage(await request(`${root}/products?${query(values)}`, { signal }), checkProduct); },
    async openOrders(values, { signal } = {}) { return checkPage(await request(`${root}?${query(values)}`, { signal }), checkOrder); },
    async preview(body, { signal } = {}) { return checkTotals((await request(`${root}/previews`, { method: 'POST', body, signal })).data); },
    async lookup(contact, { signal } = {}) {
      const result = await request(`${root}/customer-lookups`, { method: 'POST', body: { contact }, signal });
      if (result.data?.customer !== null && (!text(result.data?.customer?.id) || !text(result.data.customer.displayName))) invalid();
      return result.data;
    },
    create: (body, idempotencyKey) => one(root, { method: 'POST', body, idempotencyKey }),
    read: (id, { signal } = {}) => one(`${root}/${encodeURIComponent(id)}`, { signal }),
    recordCash: id => one(`${root}/${encodeURIComponent(id)}/record-cash`, { method: 'POST', body: {} }),
    complete: id => one(`${root}/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} }),
    cancel: id => one(`${root}/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} })
  };
}
