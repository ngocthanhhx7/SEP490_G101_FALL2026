import { createHash } from 'node:crypto';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { paginate } from '../pagination.service.js';
import { productSalesModels } from '../../models/product.model.js';
import { createProductPricingEligibility } from './product-pricing-eligibility.service.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import { createProductOrderCodeService } from './product-order-code.service.js';
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
      unitDiscount: line.unitDiscount ?? 0,
      lineTotal: line.sellingPriceWhenOrdered * line.quantity
    })),
    subtotal: doc.subtotal,
    tierDiscount: doc.tierDiscount ?? 0,
    tierCode: doc.tierCode ?? null,
    tierPolicyVersion: doc.tierPolicyVersion ?? null,
    shippingFee: doc.shippingFee,
    total: doc.total
  };
}

const fingerprintOf = (customerId, input) =>
  createHash('sha256').update(JSON.stringify([customerId, input.receiveMethod, input.paymentMethod, input.addressId ?? null])).digest('hex');

// serviceAreas is injected by route composition (the same demo work areas used by Customer addresses).
export function createProductOrderService({ connection, serviceAreas = [], eligibility = createProductPricingEligibility({ connection }) }) {
  const { Product, ProductCart, ProductOrder } = productSalesModels(connection);
  const { CustomerAddress } = petCareModels(connection);
  const unitOfWork = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection });
  const { nextCode: nextOrderCode } = createProductOrderCodeService({ connection });

  async function replay(customerId, key, fingerprint) {
    const existing = await ProductOrder.findOne({ customerId, idempotencyKey: key, channel: { $ne: COUNTER_CHANNEL } }).lean();
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
      { _id: line.productId, visible: true, deletedAt: null,
        $expr: { $gte: [{ $subtract: ['$stockOnHand', '$quantityHeld'] }, line.quantity] } },
      { $inc: { quantityHeld: line.quantity, version: 1 } },
      { returnDocument: 'after', session });
    if (held) return held;
    const current = await Product.findById(line.productId).session(session).lean();
    if (!current || !current.visible) throw productSalesErrors.unavailable(String(line.productId));
    const available = sellableQuantity(current);
    throw available <= 0
      ? productSalesErrors.outOfStock(String(line.productId))
      : productSalesErrors.exceedsAvailable(String(line.productId), available);
  }

  return Object.freeze({
    async place(actor, body, idempotencyKey) {
      const customerId = requireCustomer(actor);
      const key = parseIdempotencyKey(idempotencyKey);
      const input = parsePlaceOrder(body);
      const fingerprint = fingerprintOf(customerId, input);
      const replayed = await replay(customerId, key, fingerprint);
      if (replayed) return replayed;

      // Fail before allocating an order code, so an empty cart never leaves a gap in DH- numbers.
      if (!(await ProductCart.exists({ customerId, 'lines.0': { $exists: true } }))) {
        const winner = await replay(customerId, key, fingerprint);
        if (winner) return winner;
        throw productSalesErrors.cartEmpty();
      }
      const deliveryAddress = input.receiveMethod === 'DELIVERY'
        ? await loadDeliveryAddress(customerId, input.addressId) : undefined;
      const code = await nextOrderCode();

      try {
        const order = await unitOfWork.run(async (session) => {
          const committed = await ProductOrder.findOne({ customerId, idempotencyKey: key, channel: { $ne: COUNTER_CHANNEL } }).session(session).lean();
          if (committed) {
            if (committed.requestFingerprint !== fingerprint) throw productSalesErrors.idempotencyConflict();
            return committed;
          }
          const cart = await ProductCart.findOne({ customerId }).session(session).lean();
          if (!cart || cart.lines.length === 0) throw productSalesErrors.cartEmpty();
          const pricing = await eligibility.read(customerId, { session });
          if (pricing.prepaidOnly) throw productSalesErrors.prepayRequired();
          const lines = [];
          // Stable order avoids lock-order surprises between concurrent carts.
          for (const line of [...cart.lines].sort((a, b) => String(a.productId).localeCompare(String(b.productId)))) {
            const product = await holdLine(line, session);
            lines.push({ productId: product._id, productCode: product.code, productName: product.name,
              quantity: line.quantity, sellingPriceWhenOrdered: product.sellingPrice });
          }
          const totals = priceProductOrder({ receiveMethod: input.receiveMethod, discountBps: pricing.discountBps,
            lines: lines.map((line) => ({ unitPrice: line.sellingPriceWhenOrdered, quantity: line.quantity })) });
          const [created] = await ProductOrder.create([{
            code, customerId, receiveMethod: input.receiveMethod, paymentMethod: input.paymentMethod,
            lines: lines.map((line, index) => ({ ...line, unitDiscount: totals.unitDiscounts[index] })),
            ...(deliveryAddress ? { deliveryAddress } : {}), subtotal: totals.subtotal, shippingFee: totals.shippingFee,
            tierDiscount: totals.tierDiscount, tierCode: pricing.tierCode, tierPolicyVersion: pricing.tierPolicyVersion,
            total: totals.total, paid: false, status: 'PLACED', idempotencyKey: key, requestFingerprint: fingerprint
          }], { session });
          await notifications.productOrder({ order: created, placed: true }, session);
          await ProductCart.updateOne({ customerId }, { $set: { lines: [] }, $inc: { version: 1 } }, { session });
          return created.toObject();
        });
        return toOrderView(order);
      } catch (error) {
        // A concurrent request with the same key committed first: return that order instead of failing.
        if (error?.code === 11000 || error?.code === 'CART_EMPTY' || error?.code === 'PRODUCT_ORDER_PREPAY_REQUIRED') {
          const winner = await replay(customerId, key, fingerprint);
          if (winner) return winner;
        }
        throw error;
      }
    },
    async list(actor, query) {
      const customerId = requireCustomer(actor);
      const { page, limit } = parseOrderListQuery(query);
      const result = await paginate(ProductOrder, { filter: { customerId, channel: { $ne: COUNTER_CHANNEL } }, sort: { createdAt: -1, _id: -1 }, page, limit });
      return { ...result, items: result.items.map(toOrderView) };
    },
    // Customers see only their own orders (GBR-02); another customer's id is indistinguishable from a missing one.
    async read(actor, orderId) {
      const customerId = requireCustomer(actor);
      const doc = await ProductOrder.findOne({ _id: parseObjectId(orderId, 'orderId'), customerId, channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return toOrderView(doc);
    }
  });
}
