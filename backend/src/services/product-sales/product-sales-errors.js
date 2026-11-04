import { AppError } from '../../utils/app-error.js';
import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';

// Error codes map to R3 messages; the frontend renders the Vietnamese wording.
export const productSalesErrors = Object.freeze({
  notFound: () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Resource not found'),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required'),
  forbidden: () => new AppError(403, 'FORBIDDEN', 'Action is not permitted'),
  invalidRequest: (message) => new AppError(422, 'VALIDATION_FAILED', message),
  // MSG98
  outOfStock: (productId) => new AppError(409, 'PRODUCT_OUT_OF_STOCK', 'This product is out of stock.', { productId }),
  // MSG58
  exceedsAvailable: (productId, available) => new AppError(409, 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE',
    `Only ${available} left. Please lower the quantity.`, { productId, available }),
  unavailable: (productId) => new AppError(409, 'PRODUCT_UNAVAILABLE', 'This product is no longer available.', { productId }),
  // MSG100
  cartEmpty: () => new AppError(409, 'CART_EMPTY', 'Your cart is empty. Please choose a product first.'),
  cartFull: () => new AppError(409, 'CART_FULL', 'The cart has too many different products.'),
  cartLineNotFound: () => new AppError(404, 'CART_LINE_NOT_FOUND', 'The product is not in your cart.'),
  // MSG18
  outsideServiceArea: () => new AppError(422, 'ADDRESS_OUT_OF_SERVICE_AREA', 'Sorry, we do not serve this address yet.'),
  addressNotFound: () => new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found'),
  // MSG103
  trackingCodeRequired: () => new AppError(422, 'TRACKING_CODE_REQUIRED', 'Please enter the tracking code.'),
  // MSG105
  orderNotPaid: () => new AppError(409, 'ORDER_NOT_PAID', 'This order is not paid in full yet. Please take the payment first.'),
  orderStateConflict: (status) => new AppError(409, 'ORDER_STATE_CONFLICT', 'This order cannot be changed in its current state.', { status }),
  orderStockMismatch: (orderId) => new AppError(409, 'ORDER_STOCK_MISMATCH', 'The stock of this order does not match; nothing was changed.', { orderId }),
  idempotencyConflict: () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'The key was already used for a different order.'),
  // MSG104
  resellableQuantityInvalid: (productId) => new AppError(422, 'RESELLABLE_QUANTITY_INVALID',
    'This cannot be more than the quantity returned.', { productId })
});

const OBJECT_ID = /^[a-f\d]{24}$/i;

export function requireCustomer(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !OBJECT_ID.test(actor.userId)) {
    throw productSalesErrors.unauthenticated();
  }
  if (!actor.roles.includes('CUSTOMER')) throw productSalesErrors.forbidden();
  return actor.userId;
}

// Order handling follows PRODUCT_PERMISSIONS.HANDLE_ORDERS (today only Admin; Sale Staff is a separate role change).
export function requireOrderHandler(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)
    || typeof actor.userId !== 'string' || !OBJECT_ID.test(actor.userId)) {
    throw productSalesErrors.unauthenticated();
  }
  if (!actor.roles.some((role) => PRODUCT_PERMISSIONS.HANDLE_ORDERS.includes(role))) throw productSalesErrors.forbidden();
  return actor.userId;
}
