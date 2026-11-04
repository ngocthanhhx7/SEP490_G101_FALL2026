// Shared vocabulary for the product-sales module (R3 FE-21..FE-23, GBR-35).
export const PRODUCT_CATEGORIES = Object.freeze(['FOOD', 'ACCESSORY']);
export const PRODUCT_PET_TYPES = Object.freeze(['DOG', 'CAT']);
export const PRODUCT_RECEIVE_METHODS = Object.freeze(['DELIVERY', 'PICKUP']);
// Orders can only be placed with COD (delivery) or PAY_AT_SHOP (pickup) for now (PRODUCT_PAYMENT_BY_RECEIVE_METHOD).
// PREPAID is the online payment method the model already accepts, so returns can tell prepaid orders apart;
// it cannot be chosen when placing an order until online payment is built.
export const PRODUCT_PAYMENT_METHODS = Object.freeze(['COD', 'PAY_AT_SHOP', 'PREPAID']);
export const PRODUCT_PREPAID_PAYMENT_METHODS = Object.freeze(['PREPAID']);
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

// Order Management tabs (R3 Order Management screen): which statuses each tab lists. ALL has no status filter.
export const PRODUCT_ORDER_TAB_STATUSES = Object.freeze({
  PREPARE: Object.freeze(['PLACED']),
  AWAITING_PICKUP: Object.freeze(['READY']),
  IN_TRANSIT: Object.freeze(['HANDED_TO_CARRIER']),
  RETURNING: Object.freeze(['BEING_RETURNED'])
});
export const PRODUCT_ORDER_TABS = Object.freeze([...Object.keys(PRODUCT_ORDER_TAB_STATUSES), 'ALL']);

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

// Why a delivery order came back (R3 return reasons). Only CUSTOMER_REFUSED counts as a refusal against the customer.
export const PRODUCT_RETURN_REASONS = Object.freeze(['CUSTOMER_REFUSED', 'CARRIER_UNDELIVERABLE', 'SHOP_FAULT']);
export const PRODUCT_REFUSAL_REASONS = Object.freeze(['REFUSED_DELIVERY']);
export const PRODUCT_RETURN_LIMITS = Object.freeze({ carrierReasonMax: 300, noteMax: 500 });

// Product Management (R3 UC-57): codes are SP-0001 to SP-9999, handed out by the system on the first save and never changed.
export const PRODUCT_CODE_COUNTER_ID = 'PRODUCT_CODE';
export const PRODUCT_CODE_PREFIX = 'SP-';
export const PRODUCT_CODE_MAX_NUMBER = 9999;
// Technical limits (D-216 style), not business rules. Prices are integer VND.
export const PRODUCT_MANAGEMENT_LIMITS = Object.freeze({ nameMax: 200, descriptionMax: 4000, priceMax: 100000000 });

export const PRODUCT_ORDER_COUNTER_ID = 'PRODUCT_ORDER';
export const PRODUCT_ORDER_CODE_PREFIX = 'DH-';
