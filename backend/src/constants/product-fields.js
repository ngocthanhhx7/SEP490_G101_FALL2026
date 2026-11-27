// Shared vocabulary for the product-sales module (R3 FE-21..FE-23, GBR-35).
export const PRODUCT_CATEGORIES = Object.freeze(['FOOD', 'ACCESSORY']);
export const PRODUCT_PET_TYPES = Object.freeze(['DOG', 'CAT']);
export const PRODUCT_RECEIVE_METHODS = Object.freeze(['DELIVERY', 'PICKUP']);
// R3 GBR-36: a delivery is paid through payOS in advance or in cash on delivery; a pick-up in advance or at the shop.
export const PRODUCT_PAYMENT_METHODS = Object.freeze(['COD', 'PAY_AT_SHOP', 'PREPAID']);
export const PRODUCT_PREPAID_PAYMENT_METHODS = Object.freeze(['PREPAID']);
export const DEFAULT_PRODUCT_PICKUP_DEADLINE_HOURS = 72;
// R3 GBR-36 / JOB-04: a delivery order handed to the carrier becomes Delivered automatically after 7 days.
export const PRODUCT_DELIVERY_AUTO_CONFIRM_DAYS = 7;
export const PRODUCT_DELIVERY_AUTO_CONFIRM_MS = PRODUCT_DELIVERY_AUTO_CONFIRM_DAYS * 24 * 3_600_000;
export const PRODUCT_DELIVERED_BY = Object.freeze(['CUSTOMER', 'STAFF', 'SYSTEM']);
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

// The ways to pay each receive method offers (PREPAID first). A customer over the refusal limit may only use PREPAID.
export const PRODUCT_PAYMENT_BY_RECEIVE_METHOD = Object.freeze({
  DELIVERY: Object.freeze(['PREPAID', 'COD']),
  PICKUP: Object.freeze(['PREPAID', 'PAY_AT_SHOP'])
});

// R3 System Settings > Shop Rules, "payment deadline of a prepaid order", in hours counted from the time of ordering.
export const DEFAULT_PRODUCT_PAYMENT_DEADLINE_HOURS = 1;
// A prepaid order keeps at most this many payOS references (one per payment link) and receipts.
export const PRODUCT_PAYMENT_LIMITS = Object.freeze({ maxReferences: 10, maxReceipts: 10 });
export const PRODUCT_PAYMENT_LINK_STATES = Object.freeze(['CREATING', 'READY', 'FAILED', 'PAID']);
export const PRODUCT_PAYMENT_RECEIPT_STATES = Object.freeze(['VERIFIED', 'RECONCILIATION_REQUIRED']);

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
export const PRODUCT_REFUSAL_REASONS = Object.freeze(['REFUSED_DELIVERY', 'NOT_COLLECTED']);
export const PRODUCT_RETURN_LIMITS = Object.freeze({ carrierReasonMax: 300, noteMax: 500 });

// Product Management (R3 UC-57): codes are SP-0001 to SP-9999, handed out by the system on the first save and never changed.
export const PRODUCT_CODE_COUNTER_ID = 'PRODUCT_CODE';
export const PRODUCT_CODE_PREFIX = 'SP-';
export const PRODUCT_CODE_MAX_NUMBER = 9999;
// Technical limits (D-216 style), not business rules. Prices are integer VND.
export const PRODUCT_MANAGEMENT_LIMITS = Object.freeze({ nameMax: 200, descriptionMax: 4000, priceMax: 100000000 });

export const PRODUCT_ORDER_COUNTER_ID = 'PRODUCT_ORDER';
export const PRODUCT_ORDER_CODE_PREFIX = 'DH-';
