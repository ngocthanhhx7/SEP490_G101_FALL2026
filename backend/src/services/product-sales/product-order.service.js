import { createHash } from 'node:crypto';
import { productSalesModels } from '../../models/product.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { PRODUCT_ORDER_COUNTER_ID, PRODUCT_ORDER_CODE_PREFIX } from '../../constants/product-fields.js';
import { parsePlaceOrder, parseIdempotencyKey, parseOrderListQuery, parseObjectId } from '../../validators/product-order.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { priceProductOrder, sellableQuantity } from './product-order-pricing.js';
import { productSalesErrors, requireCustomer } from './product-sales-errors.js';

export function toOrderView(doc) {
  return {
    id: String(doc._id),
    code: doc.code,
    createdAt: doc.createdAt,
    receiveMethod: doc.receiveMethod,
    paymentMethod: doc.paymentMethod,
    paid: doc.paid,
    status: doc.status,
    trackingCode: doc.trackingCode ?? null,
    deliveryAddress: doc.deliveryAddress
      ? { label: doc.deliveryAddress.label, location: doc.deliveryAddress.location, areaCode: doc.deliveryAddress.areaCode }
      : null,
    lines: doc.lines.map((line) => ({
      productId: String(line.productId),
      productCode: line.productCode,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.sellingPriceWhenOrdered,
      lineTotal: line.sellingPriceWhenOrdered * line.quantity
    })),
    subtotal: doc.subtotal,
    shippingFee: doc.shippingFee,
    total: doc.total
  };
}

const fingerprintOf = (customerId, input) =>
  createHash('sha256').update(JSON.stringify([customerId, input.receiveMethod, input.paymentMethod, input.addressId ?? null])).digest('hex');

// serviceAreas is injected by route composition (the same demo work areas used by Customer addresses).
export function createProductOrderService({ connection, serviceAreas = [] }) {
  const { Product, ProductCart, ProductOrder, ProductCounter } = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  const unitOfWork = createUnitOfWork(connection);

  async function replay(customerId, key, fingerprint) {
    const existing = await ProductOrder.findOne({ customerId, idempotencyKey: key }).lean();
    if (!existing) return null;
    if (existing.requestFingerprint !== fingerprint) throw productSalesErrors.idempotencyConflict();
    return toOrderView(existing);
  }

  async function loadDeliveryAddress(customerId, addressId) {
    const address = await CustomerAddress.findOne({ _id: addressId, ownerId: customerId, state: 'ACTIVE' })
      .select('label areaCode +location').lean();
    if (!address) throw productSalesErrors.addressNotFound();
    if (!serviceAreas.some((area) => area.code === address.areaCode)) throw productSalesErrors.outsideServiceArea();
    return { addressId: address._id, label: address.label, location: address.location, areaCode: address.areaCode };
  }

  // Check-and-hold in one conditional update: two concurrent orders can never reserve more than is sellable (GBR-35).
  async function holdLine(line, session) {
    const held = await Product.findOneAndUpdate(
      { _id: line.productId, visible: true,
        $expr: { $gte: [{ $subtract: ['$stockOnHand', '$quantityHeld'] }, line.quantity] } },
      { $inc: { quantityHeld: line.quantity, version: 1 } },
      { new: true, session });
    if (held) return held;
    const current = await Product.findById(line.productId).session(session).lean();
    if (!current || !current.visible) throw productSalesErrors.unavailable(String(line.productId));
    const available = sellableQuantity(current);
    throw available <= 0
      ? productSalesErrors.outOfStock(String(line.productId))
      : productSalesErrors.exceedsAvailable(String(line.productId), available);
  }

  async function nextOrderCode() {
    // Allocated outside the order transaction so concurrent orders do not serialise on the counter; gaps are acceptable.
    const counter = await ProductCounter.findOneAndUpdate({ _id: PRODUCT_ORDER_COUNTER_ID },
      { $inc: { value: 1 } }, { upsert: true, new: true });
    return `${PRODUCT_ORDER_CODE_PREFIX}${String(counter.value).padStart(4, '0')}`;
  }

  return Object.freeze({
    async place(actor, body, idempotencyKey) {
      const customerId = requireCustomer(actor);
      const key = parseIdempotencyKey(idempotencyKey);
      const input = parsePlaceOrder(body);
      const fingerprint = fingerprintOf(customerId, input);
      const replayed = await replay(customerId, key, fingerprint);
      if (replayed) return replayed;

      const deliveryAddress = input.receiveMethod === 'DELIVERY'
        ? await loadDeliveryAddress(customerId, input.addressId) : undefined;
      const code = await nextOrderCode();

      try {
        const order = await unitOfWork.run(async (session) => {
          const cart = await ProductCart.findOne({ customerId }).session(session).lean();
          if (!cart || cart.lines.length === 0) throw productSalesErrors.cartEmpty();
          const lines = [];
          // Stable order avoids lock-order surprises between concurrent carts.
          for (const line of [...cart.lines].sort((a, b) => String(a.productId).localeCompare(String(b.productId)))) {
            const product = await holdLine(line, session);
            lines.push({ productId: product._id, productCode: product.code, productName: product.name,
              quantity: line.quantity, sellingPriceWhenOrdered: product.sellingPrice });
          }
          const totals = priceProductOrder({ receiveMethod: input.receiveMethod,
            lines: lines.map((line) => ({ unitPrice: line.sellingPriceWhenOrdered, quantity: line.quantity })) });
          const [created] = await ProductOrder.create([{
            code, customerId, lines, receiveMethod: input.receiveMethod, paymentMethod: input.paymentMethod,
            ...(deliveryAddress ? { deliveryAddress } : {}), subtotal: totals.subtotal, shippingFee: totals.shippingFee,
            total: totals.total, paid: false, status: 'PLACED', idempotencyKey: key, requestFingerprint: fingerprint
          }], { session });
          await ProductCart.updateOne({ customerId }, { $set: { lines: [] }, $inc: { version: 1 } }, { session });
          return created.toObject();
        });
        return toOrderView(order);
      } catch (error) {
        // A concurrent request with the same key committed first: return that order instead of failing.
        if (error?.code === 11000) {
          const winner = await replay(customerId, key, fingerprint);
          if (winner) return winner;
        }
        throw error;
      }
    },
    async list(actor, query) {
      const customerId = requireCustomer(actor);
      const { limit } = parseOrderListQuery(query);
      const docs = await ProductOrder.find({ customerId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
      return { items: docs.map(toOrderView) };
    },
    // Customers see only their own orders (GBR-02); another customer's id is indistinguishable from a missing one.
    async read(actor, orderId) {
      const customerId = requireCustomer(actor);
      const doc = await ProductOrder.findOne({ _id: parseObjectId(orderId, 'orderId'), customerId }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return toOrderView(doc);
    }
  });
}
