import { STOCK_ADJUSTMENT_QUANTITY_MAX, STOCK_ADJUSTMENT_REASON_LABELS, STOCK_ADJUSTMENT_TYPES } from '../constants/stock-adjustment.js';

export function parseAdjustmentQuantity(raw) {
  if (typeof raw !== 'string' || !/^\d+$/u.test(raw.trim())) return { error: 'INVALID' };
  const value = Number(raw.trim());
  if (!Number.isSafeInteger(value) || value < 1) return { error: 'INVALID' };
  return value > STOCK_ADJUSTMENT_QUANTITY_MAX ? { error: 'TOO_LARGE' } : { value };
}
export function validateAdjustmentForm({ product, type, quantity, reason }) {
  const errors = {};
  if (!product) errors.productId = 'REQUIRED';
  if (!STOCK_ADJUSTMENT_TYPES.some(([key]) => key === type)) errors.type = 'REQUIRED';
  if (!Object.hasOwn(STOCK_ADJUSTMENT_REASON_LABELS, reason)) errors.reason = 'REQUIRED';
  const parsed = parseAdjustmentQuantity(quantity);
  if (parsed.error) errors.quantity = parsed.error;
  else if (product && type === 'DECREASE' && parsed.value > product.available) errors.quantity = 'EXCEEDS_AVAILABLE';
  return errors;
}
// A display-only preview. The save command never sends this number to the API.
export function previewAdjustmentStock(product, type, raw) {
  const { value } = parseAdjustmentQuantity(raw);
  if (!product || value === undefined || !STOCK_ADJUSTMENT_TYPES.some(([key]) => key === type)
    || (type === 'DECREASE' && value > product.available)) return null;
  const result = product.stockOnHand + (type === 'INCREASE' ? value : -value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}
