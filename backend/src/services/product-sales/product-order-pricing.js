import { PRODUCT_DEMO_SHIPPING_FEE_VND } from '../../constants/product-fields.js';

const isMoney = (value) => Number.isSafeInteger(value) && value >= 0;

export function priceProductOrder({ lines, receiveMethod, discountBps = 0, allowEmpty = false }) {
  if (!Array.isArray(lines) || (!allowEmpty && lines.length === 0)) throw new TypeError('Order needs at least one line');
  if (!isMoney(discountBps) || discountBps > 10000) throw new TypeError('Invalid discount rate');
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
  const unitDiscounts = lines.map(({ unitPrice }) => Math.floor(unitPrice / 10000) * discountBps
    + Math.floor((unitPrice % 10000) * discountBps / 10000));
  const tierDiscount = unitDiscounts.reduce((sum, amount, index) => sum + amount * lines[index].quantity, 0);
  const total = subtotal - tierDiscount + shippingFee;
  if (!isMoney(total)) throw new TypeError('Order amount is out of range');
  return { lineTotals, unitDiscounts, subtotal, tierDiscount, shippingFee, total };
}

export function sellableQuantity(product) {
  return Math.max(0, product.stockOnHand - product.quantityHeld);
}

// R3 GBR-37: the amount accounting refunds for a prepaid order that is cancelled or returned. Paw World's mistake, a
// parcel the carrier could not deliver, or a customer cancelling a Placed order: the whole amount, shipping fee included.
// A customer who refuses the goods without a reason: the price of the goods only (the shop keeps the shipping fee).
export function productOrderRefundAmount(order, { goodsOnly = false } = {}) {
  const amount = goodsOnly ? order.total - order.shippingFee : order.total;
  if (!isMoney(amount)) throw new TypeError('Order amount is out of range');
  return amount;
}
