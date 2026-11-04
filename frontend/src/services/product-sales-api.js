import { ApiError, createApiClient } from './api-client.js';

const CATEGORIES = ['FOOD', 'ACCESSORY'];
const PET_TYPES = ['DOG', 'CAT'];
const RECEIVE_METHODS = ['DELIVERY', 'PICKUP'];
const PAYMENT_METHODS = ['COD', 'PAY_AT_SHOP'];
const money = (value) => Number.isSafeInteger(value) && value >= 0;
const text = (value) => typeof value === 'string' && value.length > 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };

function checkProduct(row) {
  if (!row || !text(row.id) || !text(row.code) || !text(row.name) || !CATEGORIES.includes(row.category)
    || !PET_TYPES.includes(row.petType) || !money(row.sellingPrice) || !money(row.available)
    || typeof row.inStock !== 'boolean' || !Array.isArray(row.photos)) invalid();
  return row;
}
function checkCart(cart) {
  if (!cart || !Array.isArray(cart.lines) || !money(cart.lineCount) || !money(cart.subtotal) || !money(cart.total)
    || !money(cart.deliveryFee) || typeof cart.hasUnavailable !== 'boolean') invalid();
  for (const line of cart.lines) {
    if (!text(line.productId) || !money(line.unitPrice) || !money(line.quantity) || !money(line.lineTotal)
      || !money(line.available) || typeof line.purchasable !== 'boolean' || typeof line.exceedsAvailable !== 'boolean') invalid();
  }
  return cart;
}
function checkOrder(order) {
  if (!order || !text(order.id) || !text(order.code) || !RECEIVE_METHODS.includes(order.receiveMethod)
    || !PAYMENT_METHODS.includes(order.paymentMethod) || typeof order.paid !== 'boolean' || !text(order.status)
    || !Array.isArray(order.lines) || !money(order.subtotal) || !money(order.shippingFee) || !money(order.total)) invalid();
  return order;
}
function notPending(response) {
  if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
  return response;
}

// Transport and DTO validation only. Prices, stock and totals are always the backend's numbers.
export function createProductSalesApi(options) {
  const request = createApiClient(options);
  const id = encodeURIComponent;
  return {
    async listProducts({ search, category, petType, page, limit } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (petType) params.set('petType', petType);
      if (page !== undefined) params.set('page', page);
      if (limit !== undefined) params.set('limit', limit);
      const query = params.toString();
      const response = await request(`/products${query ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      const paging = response.data;
      if (paging.page !== undefined && (!Number.isSafeInteger(paging.page) || paging.page < 1
        || !Number.isSafeInteger(paging.limit) || paging.limit < 1 || !money(paging.total))) invalid();
      return { ...response, data: paging.items.map(checkProduct), meta: { ...response.meta,
        ...(paging.page !== undefined ? { page: { page: paging.page, limit: paging.limit, total: paging.total } } : {}) } };
    },
    async getProduct(productId, { signal } = {}) {
      const response = await request(`/products/${id(productId)}`, { signal });
      checkProduct(response.data);
      if (typeof response.data.description !== 'string') invalid();
      return response;
    },
    async getCart({ signal } = {}) {
      const response = await request('/product-cart', { signal });
      return { ...response, data: checkCart(response.data) };
    },
    async addToCart(productId, quantity) {
      const response = notPending(await request('/product-cart/lines', { method: 'POST', body: { productId, quantity } }));
      return checkCart(response.data);
    },
    async setCartLine(productId, quantity) {
      const response = notPending(await request(`/product-cart/lines/${id(productId)}`, { method: 'PATCH', body: { quantity } }));
      return checkCart(response.data);
    },
    async removeCartLine(productId) {
      const response = notPending(await request(`/product-cart/lines/${id(productId)}`, { method: 'DELETE' }));
      return checkCart(response.data);
    },
    async addresses({ signal } = {}) {
      const response = await request('/pet-care/addresses', { signal });
      if (!Array.isArray(response.data)) invalid();
      return response;
    },
    async placeOrder(body, idempotencyKey) {
      const response = notPending(await request('/product-orders', { method: 'POST', body, idempotencyKey }));
      return checkOrder(response.data);
    },
    async listOrders({ signal } = {}) {
      const response = await request('/product-orders', { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkOrder) };
    }
  };
}
