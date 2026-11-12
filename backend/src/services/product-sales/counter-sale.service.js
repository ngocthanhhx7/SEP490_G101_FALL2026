import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { identityModels } from '../../models/identity.model.js';
import { COUNTER_CHANNEL, COUNTER_OPEN_STATUSES } from '../../constants/counter-sale-fields.js';
import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { parseCounterCreate, parseCounterPage } from '../../validators/counter-sale.validator.js';
import { parseIdempotencyKey, parseObjectId } from '../../validators/product-order.validator.js';
import { parseNoBody } from '../../validators/product-order-management.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { paginate } from '../pagination.service.js';
import { priceProductOrder, sellableQuantity } from './product-order-pricing.js';
import { createProductOrderCodeService } from './product-order-code.service.js';
import { toOrderView } from './product-order.service.js';
import { productSalesErrors, requireCounterSeller } from './product-sales-errors.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted = lines => [...lines].sort((a, b) => String(a.productId).localeCompare(String(b.productId)));
export function toCounterOrderView(doc) {
  return { ...toOrderView(doc), channel: COUNTER_CHANNEL, tierDiscount: doc.tierDiscount,
    customer: doc.customerId ? { id: String(doc.customerId), displayName: doc.counterCustomerName } : null,
    createdBy: { id: String(doc.counterCreatedBy), displayName: doc.counterCreatedByName },
    cashPayment: doc.cashPayment ? { amount: doc.cashPayment.amount, receivedAt: doc.cashPayment.receivedAt,
      receivedBy: String(doc.cashPayment.receivedBy) } : null,
    completedAt: doc.completedAt ?? null, cancelledAt: doc.cancelledAt ?? null };
}
export function createCounterSaleService({ connection, clock = Date.now }) {
  const { Product, ProductOrder } = productSalesModels(connection);
  const User = userModel(connection), { Contact } = identityModels(connection);
  const uow = createUnitOfWork(connection), codes = createProductOrderCodeService({ connection });
  async function replay(actorId, key, fingerprint, session) {
    const doc = await ProductOrder.findOne({ channel: COUNTER_CHANNEL, counterCreatedBy: actorId, idempotencyKey: key }).session(session ?? null).lean();
    if (doc && doc.requestFingerprint !== fingerprint) throw productSalesErrors.idempotencyConflict();
    return doc;
  }
  async function transition(actor, orderId, body, action) {
    const actorId = requireCounterSeller(actor), id = parseObjectId(orderId, 'orderId');
    parseNoBody(body);
    const result = await uow.run(async session => {
      const order = await ProductOrder.findOne({ _id: id, channel: COUNTER_CHANNEL }).session(session).lean();
      if (!order) throw productSalesErrors.notFound();
      if ((action === 'record-cash' && order.paid && ['PAID', 'COMPLETED'].includes(order.status))
        || (action === 'complete' && order.status === 'COMPLETED') || (action === 'cancel' && order.status === 'CANCELLED')) return order;
      if (action === 'complete' && order.status === 'AWAITING_PAYMENT') throw productSalesErrors.orderNotPaid();
      const allowed = action === 'complete' ? order.status === 'PAID' && order.paid : order.status === 'AWAITING_PAYMENT' && !order.paid;
      if (!allowed) throw productSalesErrors.orderStateConflict(order.status);
      const now = new Date(clock());
      const changes = action === 'record-cash' ? { status: 'PAID', paid: true, cashPayment: { amount: order.total, receivedAt: now, receivedBy: actorId } }
        : action === 'complete' ? { status: 'COMPLETED', completedAt: now } : { status: 'CANCELLED', cancelledAt: now };
      const updated = await ProductOrder.findOneAndUpdate({ _id: id, channel: COUNTER_CHANNEL, status: order.status, paid: order.paid, version: order.version },
        { $set: changes, $inc: { version: 1 } }, { session, returnDocument: 'after', runValidators: true }).lean();
      if (!updated) throw productSalesErrors.orderStateConflict(order.status);
      if (action !== 'record-cash') for (const line of sorted(order.lines)) {
        const leaves = action === 'complete';
        const applied = await Product.updateOne({ _id: line.productId, quantityHeld: { $gte: line.quantity },
          ...(leaves ? { stockOnHand: { $gte: line.quantity } } : {}) },
        { $inc: { quantityHeld: -line.quantity, ...(leaves ? { stockOnHand: -line.quantity } : {}), version: 1 } }, { session });
        if (applied.modifiedCount !== 1) throw productSalesErrors.orderStockMismatch(id);
      }
      return updated;
    });
    return toCounterOrderView(result);
  }
  return Object.freeze({
    async create(actor, body, rawKey) {
      const actorId = requireCounterSeller(actor), input = parseCounterCreate(body);
      const key = `counter/${digest([actorId, parseIdempotencyKey(rawKey)])}`;
      const fingerprint = digest([actorId, input.customerId ?? null, sorted(input.lines)]);
      const prior = await replay(actorId, key, fingerprint);
      if (prior) return toCounterOrderView(prior);
      const code = await codes.nextCode();
      try {
        const created = await uow.run(async session => {
          const winner = await replay(actorId, key, fingerprint, session);
          if (winner) return winner;
          const creator = await User.findOne({ _id: actorId, state: 'ACTIVE', roles: { $in: PRODUCT_PERMISSIONS.SELL_AT_COUNTER } }).session(session).lean();
          if (!creator) throw productSalesErrors.forbidden();
          let customer;
          if (input.customerId) {
            customer = await User.findOne({ _id: input.customerId, state: 'ACTIVE', roles: 'CUSTOMER' }).session(session).lean();
            const verified = customer && await Contact.exists({ userId: input.customerId, state: 'VERIFIED', channel: { $in: ['PHONE', 'EMAIL'] } }).session(session);
            if (!verified) throw new AppError(422, 'COUNTER_CUSTOMER_UNAVAILABLE', 'The selected customer is no longer available');
          }
          const lines = [];
          for (const line of sorted(input.lines)) {
            const p = await Product.findOneAndUpdate({ _id: line.productId, visible: true, deletedAt: null,
              $expr: { $gte: [{ $subtract: ['$stockOnHand', '$quantityHeld'] }, line.quantity] } },
            { $inc: { quantityHeld: line.quantity, version: 1 } }, { session, returnDocument: 'after' }).lean();
            if (!p) {
              const current = await Product.findById(line.productId).session(session).lean();
              if (!current || !current.visible || current.deletedAt) throw productSalesErrors.unavailable(line.productId);
              throw productSalesErrors.exceedsAvailable(line.productId, sellableQuantity(current));
            }
            lines.push({ productId: p._id, productCode: p.code, productName: p.name, quantity: line.quantity, sellingPriceWhenOrdered: p.sellingPrice });
          }
          const totals = priceProductOrder({ receiveMethod: 'COUNTER', lines: lines.map(line => ({ unitPrice: line.sellingPriceWhenOrdered, quantity: line.quantity })) });
          const now = new Date(clock());
          const doc = new ProductOrder({ code, channel: COUNTER_CHANNEL, counterCreatedBy: actorId, counterCreatedByName: creator.displayName,
            ...(customer ? { customerId: customer._id, counterCustomerName: customer.displayName } : {}),
            receiveMethod: 'COUNTER', paymentMethod: 'COUNTER_CASH', lines, subtotal: totals.subtotal, shippingFee: 0, tierDiscount: 0, total: totals.total,
            paid: false, status: 'AWAITING_PAYMENT', idempotencyKey: key, requestFingerprint: fingerprint, createdAt: now, updatedAt: now });
          await doc.validate();
          // Driver insert avoids document mutation across transaction retries; validation stays in the model.
          const plain = doc.toObject();
          await ProductOrder.collection.insertOne(plain, { session });
          return plain;
        });
        return toCounterOrderView(created);
      } catch (error) {
        if (error?.code === 11000) { const winner = await replay(actorId, key, fingerprint); if (winner) return toCounterOrderView(winner); }
        throw error;
      }
    },
    async list(actor, query) {
      requireCounterSeller(actor);
      const { page, limit } = parseCounterPage(query);
      const result = await paginate(ProductOrder, { filter: { channel: COUNTER_CHANNEL, status: { $in: COUNTER_OPEN_STATUSES } }, page, limit, sort: { createdAt: 1, _id: 1 } });
      return { ...result, items: result.items.map(toCounterOrderView) };
    },
    async read(actor, orderId) {
      requireCounterSeller(actor);
      const doc = await ProductOrder.findOne({ _id: parseObjectId(orderId, 'orderId'), channel: COUNTER_CHANNEL }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return toCounterOrderView(doc);
    },
    recordCash: (actor, id, body) => transition(actor, id, body, 'record-cash'),
    complete: (actor, id, body) => transition(actor, id, body, 'complete'),
    cancel: (actor, id, body) => transition(actor, id, body, 'cancel')
  });
}
