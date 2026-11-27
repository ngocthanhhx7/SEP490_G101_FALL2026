import { STOCK_LOW_THRESHOLD } from '../../constants/stock-list-fields.js';

// $ifNull also supports pre-default legacy product records.
export const STOCK_AVAILABLE_EXPRESSION = Object.freeze({
  $subtract: [{ $ifNull: ['$stockOnHand', 0] }, { $ifNull: ['$quantityHeld', 0] }]
});

export const STOCK_LOW_EXPRESSION = Object.freeze({
  $lte: [STOCK_AVAILABLE_EXPRESSION, STOCK_LOW_THRESHOLD]
});

export const STOCK_LOW_FILTER = Object.freeze({
  deletedAt: null,
  $expr: STOCK_LOW_EXPRESSION
});

export function countLowStockProducts(Product) {
  return Product.countDocuments(STOCK_LOW_FILTER);
}
