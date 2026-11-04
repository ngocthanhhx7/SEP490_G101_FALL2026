import { parseObjectId, parseQuantity, requireOnlyKeys } from './product.validator.js';

export function parseAddCartLine(body) {
  requireOnlyKeys(body, ['productId', 'quantity'], ['productId', 'quantity']);
  return { productId: parseObjectId(body.productId, 'productId'), quantity: parseQuantity(body.quantity) };
}

export function parseSetCartLine(productId, body) {
  requireOnlyKeys(body, ['quantity'], ['quantity']);
  return { productId: parseObjectId(productId, 'productId'), quantity: parseQuantity(body.quantity) };
}

export function parseRemoveCartLine(productId) {
  return { productId: parseObjectId(productId, 'productId') };
}
