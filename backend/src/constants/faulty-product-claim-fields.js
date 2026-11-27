export const DEFAULT_FAULTY_PRODUCT_REPORT_DAYS = 7;
export const FAULTY_CLAIM_COUNTER_ID = 'faulty-product-claim';
export const FAULTY_CLAIM_CODE_PREFIX = 'KN-';

export const FAULTY_CLAIM_PROBLEM_TYPES = Object.freeze(['FAULTY_PRODUCT', 'WRONG_PRODUCT']);
export const FAULTY_CLAIM_DECISIONS = Object.freeze(['EXCHANGE', 'REFUND', 'REJECT']);
export const FAULTY_CLAIM_STATUSES = Object.freeze([
  'WAITING_CHECK',
  'WAITING_ADMIN',
  'EXCHANGE_APPROVED',
  'EXCHANGE_SENT',
  'REFUND_APPROVED',
  'REJECTED'
]);

export const FAULTY_CLAIM_TABS = Object.freeze(['WAITING_CHECK', 'WAITING_ADMIN', 'DONE']);
export const FAULTY_CLAIM_TAB_STATUSES = Object.freeze({
  WAITING_CHECK: Object.freeze(['WAITING_CHECK']),
  WAITING_ADMIN: Object.freeze(['WAITING_ADMIN']),
  DONE: Object.freeze(['EXCHANGE_APPROVED', 'EXCHANGE_SENT', 'REFUND_APPROVED', 'REJECTED'])
});

export const FAULTY_CLAIM_LIMITS = Object.freeze({
  descriptionMax: 2000,
  inspectionMax: 2000,
  decisionNoteMax: 2000,
  minPhotos: 1,
  maxPhotos: 10,
  conflictRetries: 3
});
