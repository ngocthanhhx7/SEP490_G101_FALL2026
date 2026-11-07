import { readPagination } from './pagination-response.js';
import { ApiError, createApiClient } from './api-client.js';

const RECEIVE_METHODS = ['DELIVERY', 'PICKUP'];
const PAYMENT_METHODS = ['COD', 'PAY_AT_SHOP', 'PREPAID'];
const TABS = ['PREPARE', 'AWAITING_PICKUP', 'IN_TRANSIT', 'RETURNING', 'ALL'];
const money = (value) => Number.isSafeInteger(value) && value >= 0;
const text = (value) => typeof value === 'string' && value.length > 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };

function checkOrder(order) {
  if (!order || !text(order.id) || !text(order.code) || !RECEIVE_METHODS.includes(order.receiveMethod)
    || !PAYMENT_METHODS.includes(order.paymentMethod) || typeof order.paid !== 'boolean' || !text(order.status)
    || !Array.isArray(order.lines) || !money(order.subtotal) || !money(order.shippingFee) || !money(order.total)
    || !order.customer || !text(order.customer.id)
    || (order.customer.phone !== undefined && order.customer.phone !== null && !text(order.customer.phone))) invalid();
  return order;
}
function checkCounts(counts) {
  if (!counts || TABS.filter((tab) => tab !== 'ALL').some((tab) => !money(counts[tab]))) invalid();
  return counts;
}
function notPending(response) {
  if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
  return response;
}

// Transport and DTO validation for Admin order handling. Status, stock and money are always the backend's.
export function createProductOrderManagementApi(options) {
  const request = createApiClient(options);
  const id = encodeURIComponent;
  const act = async (orderId, action, body = {}) =>
    checkOrder(notPending(await request(`/admin/product-orders/${id(orderId)}/${action}`, { method: 'POST', body })).data);
  return {
    // The tab counts ride in meta so the page keeps them even when the current tab is empty.
    async listOrders({ tab = 'ALL', search = '', page = 1 } = {}, { signal } = {}) {
      const params = new globalThis.URLSearchParams();
      if (tab !== 'ALL') params.set('tab', tab);
      if (search) params.set('search', search);
      if (page > 1) params.set('page', String(page));
      const query = params.toString();
      const response = await request(`/admin/product-orders${query ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(response.data?.items)) invalid();
      return { ...response, data: response.data.items.map(checkOrder), meta: { ...response.meta, counts: checkCounts(response.data.counts), page: readPagination(response.data) } };
    },
    handToCarrier: (orderId, trackingCode) => act(orderId, 'hand-to-carrier', { trackingCode }),
    markReady: (orderId) => act(orderId, 'mark-ready'),
    recordPayment: (orderId) => act(orderId, 'record-payment'),
    handToCustomer: (orderId) => act(orderId, 'hand-to-customer'),
    markDelivered: (orderId) => act(orderId, 'mark-delivered'),
    // The carrier's own reason for sending the parcel back.
    markReturning: (orderId, carrierReason) => act(orderId, 'mark-returning', { carrierReason }),
    // reason: CUSTOMER_REFUSED | CARRIER_UNDELIVERABLE | SHOP_FAULT; lines: [{ productId, resellableQuantity }] for every line.
    confirmReturned: (orderId, { reason, note, lines }) =>
      act(orderId, 'confirm-returned', { reason, ...(note ? { note } : {}), lines })
  };
}
