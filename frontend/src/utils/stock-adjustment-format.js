import { STOCK_ADJUSTMENT_REASON_LABELS } from '../constants/stock-adjustment.js';
import { formatStockDelta } from './stock-format.js';

export const formatAdjustmentDelta = value => formatStockDelta(value).replace(/^-/, '−');
export const adjustmentReasonText = reason => (STOCK_ADJUSTMENT_REASON_LABELS[reason] ?? '').toLocaleLowerCase('vi-VN');
