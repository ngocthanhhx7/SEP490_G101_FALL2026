import { ApiError, createApiClient } from './api-client.js';

const text = (value) => typeof value === 'string' && value.length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };

function checkLine(line) {
  if (!line || !text(line.productId) || !text(line.productCode) || !text(line.productName) || !count(line.quantityReceived)
    || !count(line.quantityAccepted) || !count(line.quantityRejected) || typeof line.rejectReason !== 'string') invalid();
  return line;
}
function checkSummary(receipt) {
  if (!receipt || !text(receipt.id) || !/^PN-\d{4,}$/u.test(receipt.code ?? '') || !text(receipt.supplierName) || !text(receipt.receivedOn)
    || !count(receipt.totalReceived) || !count(receipt.totalAccepted) || !count(receipt.totalRejected)) invalid();
  return receipt;
}
function checkReceipt(receipt) {
  checkSummary(receipt);
  if (!text(receipt.supplierId) || typeof receipt.recorderName !== 'string' || !Array.isArray(receipt.lines)) invalid();
  receipt.lines.forEach(checkLine);
  return receipt;
}
const checkNamed = (item) => {
  if (!item || !text(item.id) || !text(item.name)) invalid();
  return item;
};
const checkProduct = (product) => {
  if (!product || !text(product.id) || !text(product.code) || !text(product.name) || typeof product.visible !== 'boolean') invalid();
  return product;
};

// Transport and DTO validation for Goods Receipt. The rules, the code, the day and the recorder are the backend's.
export function createGoodsReceiptApi(options) {
  const request = createApiClient(options);
  return {
    // Only the suppliers that still work with the shop.
    async listSuppliers({ signal } = {}) {
      const response = await request('/admin/goods-receipts/suppliers', { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkNamed) };
    },
    // The product search of the "+ Thêm sản phẩm" box; the same call shape as the Admin product list, so the picker is shared.
    async listProducts({ search, page = 1, limit } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (search) params.set('search', search);
      if (page > 1) params.set('page', String(page));
      if (limit) params.set('limit', String(limit));
      const query = params.toString();
      const response = await request(`/admin/goods-receipts/products${query ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkProduct) };
    },
    // The newest receipts first, for the "Phiếu nhập gần đây" column.
    async listRecent({ signal } = {}) {
      const response = await request('/admin/goods-receipts', { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkSummary) };
    },
    async readReceipt(code, { signal } = {}) {
      return checkReceipt((await request(`/admin/goods-receipts/${encodeURIComponent(code)}`, { signal })).data);
    },
    // values: { supplierId, lines: [{ productId, quantityReceived, quantityAccepted, rejectReason? }] }. The day, the recorder,
    // the code and the rejected quantities are the system's. The Idempotency-Key is required (D-218): the same key with the same
    // values returns the receipt already saved, so a repeat after a lost answer cannot make a second receipt.
    async createReceipt(values, idempotencyKey) {
      return checkReceipt((await request('/admin/goods-receipts', { method: 'POST', body: values, idempotencyKey })).data);
    }
  };
}
