import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { PRODUCT_ORDER_TAB_STATUSES, PRODUCT_PREPAID_PAYMENT_METHODS } from '../../constants/product-fields.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import {
  parseManagementListQuery, parseHandToCarrier, parseNoBody, parseMarkReturning, parseConfirmReturned
} from '../../validators/product-order-management.validator.js';
import { parseObjectId } from '../../validators/product-order.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { toOrderView } from './product-order.service.js';
import { productSalesErrors, requireOnlineOrderCanceller, requireOrderHandler } from './product-sales-errors.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_MATCH_LIMIT = 100;
// Oldest first where staff work through a queue; newest first elsewhere.
const OLDEST_FIRST_TABS = new Set(['PREPARE', 'AWAITING_PICKUP']);

function toAdminOrderView(doc, customer) {
  const view = toOrderView(doc);
  return {
    ...view,
    // How many of each line went back on sale once the return was confirmed (null before that).
    lines: view.lines.map((line, index) => ({ ...line, resellableQuantity: doc.lines[index].resellableQuantity ?? null })),
    updatedAt: doc.updatedAt,
    deliveredAt: doc.deliveredAt ?? null,
    carrierReturnReason: doc.carrierReturnReason ?? null,
    returnReason: doc.returnReason ?? null,
    returnNote: doc.returnNote ?? null,
    returnedAt: doc.returnedAt ?? null,
    refundMarked: doc.refundMarked === true,
    customer: { id: String(doc.customerId), displayName: customer?.displayName ?? null, phone: customer?.phone ?? null }
  };
}

// Per line of the returned order: the quantity that goes back on sale. The request must cover every line once;
// each quantity is a whole number from 0 to what was ordered (MSG104).
function returnedLines(order, input) {
  const wanted = new Map(input.lines.map((line) => [line.productId, line.resellableQuantity]));
  if (wanted.size !== order.lines.length || order.lines.some((line) => !wanted.has(String(line.productId)))) {
    throw productSalesErrors.invalidRequest('lines is invalid');
  }
  return order.lines.map((line) => {
    const resellableQuantity = wanted.get(String(line.productId));
    if (!Number.isSafeInteger(resellableQuantity) || resellableQuantity < 0 || resellableQuantity > line.quantity) {
      throw productSalesErrors.resellableQuantityInvalid(String(line.productId));
    }
    return { ...line, resellableQuantity };
  });
}

// Order handling (R3 Order Management) for whoever PRODUCT_PERMISSIONS allows. Stock follows GBR-35:
// goods leaving the shop release the hold and reduce the real stock; cancelling only releases the hold;
// a confirmed return puts back only what can be sold again.
// phones is the customer phone directory; it is injected by route composition.
export function createProductOrderManagementService({ connection, phones, clock = Date.now }) {
  if (typeof phones?.userIdsByPhone !== 'function' || typeof phones?.phonesOf !== 'function') {
    throw new TypeError('A customer phone directory is required');
  }
  const { Product, ProductOrder, ProductCustomerRefusal } = productSalesModels(connection);
  const User = userModel(connection);
  const unitOfWork = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection, clock });

  // Name and phone of each customer, by user id.
  async function customerDetails(customerIds) {
    const [users, numbers] = await Promise.all([
      User.find({ _id: { $in: customerIds } }).select('displayName').lean(),
      phones.phonesOf(customerIds)
    ]);
    return new Map(users.map((user) => [String(user._id), { displayName: user.displayName, phone: numbers.get(String(user._id)) }]));
  }

  async function viewOf(doc) {
    return toAdminOrderView(doc, (await customerDetails([doc.customerId])).get(String(doc.customerId)));
  }

  // One guarded status change plus its stock effect, all in one transaction.
  // The update only matches the status and version that were read, so two admins cannot both apply a change.
  // `effects` runs after the status change, in the same transaction, for writes that must stand or fall with it.
  async function transition(actor, orderId, { allowed, check, changes, stock, effects }) {
    requireOrderHandler(actor);
    const id = parseObjectId(orderId, 'orderId');
    const updated = await unitOfWork.run(async (session) => {
      const order = await ProductOrder.findOne({ _id: id, channel: { $ne: COUNTER_CHANNEL } }).session(session).lean();
      if (!order) throw productSalesErrors.notFound();
      if (!allowed(order)) throw productSalesErrors.orderStateConflict(order.status);
      check?.(order);
      const result = await ProductOrder.findOneAndUpdate(
        { _id: id, channel: { $ne: COUNTER_CHANNEL }, status: order.status, version: order.version },
        { $set: changes(order), $inc: { version: 1 } },
        { returnDocument: 'after', session }).lean();
      if (!result) throw productSalesErrors.orderStateConflict(order.status);
      if (stock) {
        const leaves = stock === 'LEAVE';
        for (const line of order.lines) {
          const applied = await Product.updateOne(
            { _id: line.productId, quantityHeld: { $gte: line.quantity }, ...(leaves ? { stockOnHand: { $gte: line.quantity } } : {}) },
            { $inc: { quantityHeld: -line.quantity, ...(leaves ? { stockOnHand: -line.quantity } : {}), version: 1 } },
            { session });
          if (applied.modifiedCount !== 1) throw productSalesErrors.orderStockMismatch(String(id));
        }
      }
      await effects?.(order, session);
      await notifications.productOrder({ order: result, previous: order }, session);
      return result;
    });
    return viewOf(updated);
  }

  return Object.freeze({
    async list(actor, query) {
      requireOrderHandler(actor);
      const { tab, search, phone, limit, page } = parseManagementListQuery(query);
      const filter = { channel: { $ne: COUNTER_CHANNEL } };
      if (tab !== 'ALL') filter.status = { $in: PRODUCT_ORDER_TAB_STATUSES[tab] };
      if (search) {
        // D-217: by order code, by part of the customer's name, or by the customer's whole phone number.
        const pattern = escapeRegex(search);
        const [named, owners] = await Promise.all([
          User.find({ roles: 'CUSTOMER', displayName: { $regex: pattern, $options: 'i' } }).select('_id').limit(NAME_MATCH_LIMIT).lean(),
          phone ? phones.userIdsByPhone(phone) : []
        ]);
        filter.$or = [{ code: { $regex: `^${pattern}`, $options: 'i' } },
          { customerId: { $in: [...named.map((user) => user._id), ...owners] } }];
      }
      const direction = OLDEST_FIRST_TABS.has(tab) ? 1 : -1;
      const [docs, grouped, total] = await Promise.all([
        ProductOrder.find(filter).sort({ createdAt: direction, _id: direction }).skip((page - 1) * limit).limit(limit).lean(),
        ProductOrder.aggregate([{ $match: { channel: { $ne: COUNTER_CHANNEL } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
        ProductOrder.countDocuments(filter)
      ]);
      const customers = await customerDetails([...new Set(docs.map((doc) => String(doc.customerId)))]);
      const byStatus = new Map(grouped.map((row) => [row._id, row.count]));
      const counts = Object.fromEntries(Object.entries(PRODUCT_ORDER_TAB_STATUSES).map(([key, statuses]) =>
        [key, statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0)]));
      return { items: docs.map((doc) => toAdminOrderView(doc, customers.get(String(doc.customerId)))), counts, page, limit, total };
    },
    async read(actor, orderId) {
      requireOrderHandler(actor);
      const doc = await ProductOrder.findOne({ _id: parseObjectId(orderId, 'orderId'), channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (!doc) throw productSalesErrors.notFound();
      return viewOf(doc);
    },
    // Delivery orders: PLACED -> HANDED_TO_CARRIER with a tracking code (MSG103 when missing). Goods leave the shop.
    handToCarrier(actor, orderId, body) {
      const { trackingCode } = parseHandToCarrier(body);
      if (!trackingCode) {
        requireOrderHandler(actor);
        throw productSalesErrors.trackingCodeRequired();
      }
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'DELIVERY' && order.status === 'PLACED',
        changes: () => ({ status: 'HANDED_TO_CARRIER', trackingCode }),
        stock: 'LEAVE'
      });
    },
    // Pickup orders: PLACED -> READY. Stock is untouched; the hold stays until the customer collects.
    markReady(actor, orderId, body) {
      parseNoBody(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'PICKUP' && order.status === 'PLACED',
        changes: () => ({ status: 'READY' })
      });
    },
    // Pickup orders: READY -> PICKED_UP, only when paid in full (MSG105). Goods leave the shop.
    handToCustomer(actor, orderId, body) {
      parseNoBody(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'PICKUP' && order.status === 'READY',
        check: (order) => { if (!order.paid) throw productSalesErrors.orderNotPaid(); },
        changes: () => ({ status: 'PICKED_UP' }),
        stock: 'LEAVE'
      });
    },
    // Delivery orders: HANDED_TO_CARRIER -> DELIVERED. Cash on delivery is collected by the carrier, so it is now paid;
    // an advance payment stays as it was.
    markDelivered(actor, orderId, body) {
      parseNoBody(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'DELIVERY' && order.status === 'HANDED_TO_CARRIER',
        changes: (order) => ({ status: 'DELIVERED', deliveredAt: new Date(clock()), ...(order.paymentMethod === 'COD' ? { paid: true } : {}) })
      });
    },
    // Delivery orders: HANDED_TO_CARRIER -> BEING_RETURNED, with the carrier's reason. Stock is untouched until the return is confirmed.
    markReturning(actor, orderId, body) {
      requireOrderHandler(actor);
      const { carrierReason } = parseMarkReturning(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'DELIVERY' && order.status === 'HANDED_TO_CARRIER',
        changes: () => ({ status: 'BEING_RETURNED', carrierReturnReason: carrierReason })
      });
    },
    // BEING_RETURNED -> RETURNED, once. Only the resellable quantity of each line goes back into stock.
    // A customer's refusal is recorded in the same transaction, and an advance payment is marked for refund.
    confirmReturned(actor, orderId, body) {
      requireOrderHandler(actor);
      const input = parseConfirmReturned(body);
      let lines;
      return transition(actor, orderId, {
        allowed: (order) => order.status === 'BEING_RETURNED',
        check: (order) => { lines = returnedLines(order, input); },
        changes: (order) => ({
          status: 'RETURNED',
          lines,
          returnReason: input.reason,
          ...(input.note ? { returnNote: input.note } : {}),
          returnedAt: new Date(clock()),
          ...(PRODUCT_PREPAID_PAYMENT_METHODS.includes(order.paymentMethod) && order.paid ? { refundMarked: true } : {})
        }),
        effects: async (order, session) => {
          for (const line of lines) {
            if (line.resellableQuantity === 0) continue;
            const applied = await Product.updateOne({ _id: line.productId }, { $inc: { stockOnHand: line.resellableQuantity, version: 1 } }, { session });
            if (applied.modifiedCount !== 1) throw productSalesErrors.orderStockMismatch(String(order._id));
          }
          if (input.reason === 'CUSTOMER_REFUSED') {
            await ProductCustomerRefusal.create([{
              customerId: order.customerId, orderId: order._id, reason: 'REFUSED_DELIVERY', occurredAt: new Date(clock())
            }], { session });
          }
        }
      });
    },
    // Records the money taken at the shop for a pickup order, so it can then be handed over.
    recordPayment(actor, orderId, body) {
      parseNoBody(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'PICKUP' && ['PLACED', 'READY'].includes(order.status) && !order.paid,
        changes: () => ({ paid: true })
      });
    },
    // Orders that have not left the shop: release the hold only; real stock is unchanged.
    cancel(actor, orderId, body) {
      parseNoBody(body);
      requireOnlineOrderCanceller(actor);
      return transition(actor, orderId, {
        allowed: (order) => ['PLACED', 'READY'].includes(order.status),
        changes: () => ({ status: 'CANCELLED' }),
        stock: 'RELEASE'
      });
    }
  });
}
