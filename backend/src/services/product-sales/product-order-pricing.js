import { PRODUCT_DEMO_SHIPPING_FEE_VND } from '../../constants/product-fields.js';

const isMoney = (value) => Number.isSafeInteger(value) && value >= 0;

// Deterministic order totals in integer VND. No discount or tax exists in this release.
export function priceProductOrder({ lines, receiveMethod }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new TypeError('Order needs at least one line');
  let subtotal = 0;
  const lineTotals = lines.map(({ unitPrice, quantity }) => {
    if (!isMoney(unitPrice) || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new TypeError('Invalid order line');
    }
    const lineTotal = unitPrice * quantity;
    if (!isMoney(lineTotal)) throw new TypeError('Order amount is out of range');
    subtotal += lineTotal;
    return lineTotal;
  });
  if (!isMoney(subtotal)) throw new TypeError('Order amount is out of range');
  const shippingFee = receiveMethod === 'DELIVERY' ? PRODUCT_DEMO_SHIPPING_FEE_VND : 0;
  return { lineTotals, subtotal, shippingFee, total: subtotal + shippingFee };
}

export function sellableQuantity(product) {
  return Math.max(0, product.stockOnHand - product.quantityHeld);
}
