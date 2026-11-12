export const STOCK_ADJUSTMENT_TYPES = Object.freeze(['INCREASE', 'DECREASE']);
export const STOCK_ADJUSTMENT_REASONS = Object.freeze(['DAMAGED', 'LOST', 'INTERNAL_USE', 'RECEIPT_CORRECTION']);
export const STOCK_ADJUSTMENT_LIMITS = Object.freeze({ quantityMax: 100000, conflictRetries: 3 });
export const STOCK_ADJUSTMENT_COUNTER_ID = 'STOCK_ADJUSTMENT';
export const STOCK_ADJUSTMENT_CODE_PREFIX = 'DC-';
