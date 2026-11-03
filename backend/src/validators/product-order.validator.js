import { AppError } from '../utils/app-error.js';
import { PRODUCT_RECEIVE_METHODS, PRODUCT_PAYMENT_BY_RECEIVE_METHOD, PRODUCT_LIMITS } from '../constants/product-fields.js';
import { parseObjectId, requireOnlyKeys } from './product.validator.js';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

export function parseIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Idempotency key is required');
  }
  return value;
}

// Delivery needs an address (MSG101) and is paid on delivery; pickup has no address and is paid in the shop.
export function parsePlaceOrder(body) {
  requireOnlyKeys(body, ['receiveMethod', 'paymentMethod', 'addressId'], ['receiveMethod', 'paymentMethod']);
  if (!PRODUCT_RECEIVE_METHODS.includes(body.receiveMethod)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'receiveMethod is invalid');
  }
  if (body.paymentMethod !== PRODUCT_PAYMENT_BY_RECEIVE_METHOD[body.receiveMethod]) {
    throw new AppError(422, 'VALIDATION_FAILED', 'paymentMethod does not match receiveMethod');
  }
  if (body.receiveMethod === 'PICKUP') {
    if (body.addressId !== undefined) throw new AppError(422, 'VALIDATION_FAILED', 'Pickup orders take no address');
    return { receiveMethod: 'PICKUP', paymentMethod: body.paymentMethod };
  }
  if (body.addressId === undefined || body.addressId === null || body.addressId === '') {
    throw new AppError(422, 'ADDRESS_REQUIRED', 'Please choose an address for the delivery.');
  }
  return {
    receiveMethod: 'DELIVERY',
    paymentMethod: body.paymentMethod,
    addressId: parseObjectId(body.addressId, 'addressId')
  };
}

export function parseOrderListQuery(query = {}) {
  if (Object.keys(query).some((key) => key !== 'limit')) throw new AppError(422, 'VALIDATION_FAILED', 'Query is invalid');
  if (query.limit === undefined) return { limit: PRODUCT_LIMITS.defaultPageSize };
  const limit = Number(query.limit);
  if (!/^\d{1,3}$/.test(String(query.limit)) || limit < 1 || limit > PRODUCT_LIMITS.maxPageSize) {
    throw new AppError(422, 'VALIDATION_FAILED', 'limit is invalid');
  }
  return { limit };
}

export { parseObjectId };
