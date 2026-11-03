// Shared vocabulary for the product-sales module (R3 FE-21..FE-23, GBR-35).
export const PRODUCT_CATEGORIES = Object.freeze(['FOOD', 'ACCESSORY']);
export const PRODUCT_PET_TYPES = Object.freeze(['DOG', 'CAT']);
export const PRODUCT_RECEIVE_METHODS = Object.freeze(['DELIVERY', 'PICKUP']);
// PAY_AT_SHOP and COD are the only demo payment methods; online payment is not part of this release.
export const PRODUCT_PAYMENT_METHODS = Object.freeze(['COD', 'PAY_AT_SHOP']);
export const PRODUCT_ORDER_STATUSES = Object.freeze([
  'PLACED',
  'HANDED_TO_CARRIER',
  'DELIVERED',
  'BEING_RETURNED',
  'RETURNED',
  'READY',
  'PICKED_UP',
  'CANCELLED'
]);

// Each receive method has exactly one demo payment method.
export const PRODUCT_PAYMENT_BY_RECEIVE_METHOD = Object.freeze({
  DELIVERY: 'COD',
  PICKUP: 'PAY_AT_SHOP'
});

export const PRODUCT_LIMITS = Object.freeze({
  maxLineQuantity: 99,
  maxCartLines: 30,
  maxSearchLength: 100,
  defaultPageSize: 20,
  maxPageSize: 50
});

// Demo only: the Admin-managed per-area fee configuration (R3 D-060) is not built yet,
// so every served area uses one flat fee. Integer VND.
export const PRODUCT_DEMO_SHIPPING_FEE_VND = 25000;

export const PRODUCT_ORDER_COUNTER_ID = 'PRODUCT_ORDER';
export const PRODUCT_ORDER_CODE_PREFIX = 'DH-';
