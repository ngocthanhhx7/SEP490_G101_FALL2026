export const COUNTER_CHANNEL = 'COUNTER';
export const COUNTER_RECEIVE_METHOD = 'COUNTER';
export const COUNTER_PAYMENT_METHOD = 'COUNTER_CASH';
export const COUNTER_VIETQR_PAYMENT_METHOD = 'COUNTER_VIETQR';
export const COUNTER_PAYMENT_METHODS = Object.freeze([COUNTER_PAYMENT_METHOD, COUNTER_VIETQR_PAYMENT_METHOD]);
// Counter VietQR payOS link expiry (15 minutes). Counter orders do not use online paymentDeadlineAt.
export const COUNTER_VIETQR_LINK_TTL_MS = 15 * 60_000;
export const COUNTER_ORDER_STATUSES = Object.freeze(['AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED']);
export const COUNTER_OPEN_STATUSES = Object.freeze(['AWAITING_PAYMENT', 'PAID']);
export const COUNTER_CONTACT_MAX_LENGTH = 254;
export const COUNTER_MAX_LINE_QUANTITY = 99;
