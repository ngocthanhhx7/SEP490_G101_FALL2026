import { PAGE_QUERY_KEYS, parsePageQuery } from './pagination.validator.js';
import { AppError } from '../utils/app-error.js';
import { PRODUCT_RECEIVE_METHODS, PRODUCT_PAYMENT_BY_RECEIVE_METHOD } from '../constants/product-fields.js';
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
  if (Object.keys(query).some(key => !PAGE_QUERY_KEYS.includes(key))) throw new AppError(422, 'VALIDATION_FAILED', 'Query is invalid');
  return parsePageQuery(query);
}

export { parseObjectId };
