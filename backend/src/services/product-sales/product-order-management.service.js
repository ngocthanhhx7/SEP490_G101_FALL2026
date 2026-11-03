import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { PRODUCT_ORDER_TAB_STATUSES } from '../../constants/product-fields.js';
import { parseManagementListQuery, parseHandToCarrier, parseNoBody } from '../../validators/product-order-management.validator.js';
import { parseObjectId } from '../../validators/product-order.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { toOrderView } from './product-order.service.js';
import { productSalesErrors, requireAdmin } from './product-sales-errors.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_MATCH_LIMIT = 100;
// Oldest first where staff work through a queue; newest first elsewhere.
const OLDEST_FIRST_TABS = new Set(['PREPARE', 'AWAITING_PICKUP']);

function toAdminOrderView(doc, customerName) {
  return {
    ...toOrderView(doc),
    updatedAt: doc.updatedAt,
    customer: { id: String(doc.customerId), displayName: customerName ?? null }
  };
}

// Order handling for Admin (R3 Order Management). Stock follows GBR-35:
// goods leaving the shop release the hold and reduce the real stock; cancelling only releases the hold.
export function createProductOrderManagementService({ connection }) {
  const { Product, ProductOrder } = productSalesModels(connection);
  const User = userModel(connection);
  const unitOfWork = createUnitOfWork(connection);

  async function customerNames(customerIds) {
    const users = await User.find({ _id: { $in: customerIds } }).select('displayName').lean();
    return new Map(users.map((user) => [String(user._id), user.displayName]));
  }

  async function viewOf(doc) {
    return toAdminOrderView(doc, (await customerNames([doc.customerId])).get(String(doc.customerId)));
  }

  // One guarded status change plus its stock effect, all in one transaction.
  // The update only matches the status and version that were read, so two admins cannot both apply a change.
  async function transition(actor, orderId, { allowed, check, changes, stock }) {
    requireAdmin(actor);
    const id = parseObjectId(orderId, 'orderId');
    const updated = await unitOfWork.run(async (session) => {
      const order = await ProductOrder.findById(id).session(session).lean();
      if (!order) throw productSalesErrors.notFound();
      if (!allowed(order)) throw productSalesErrors.orderStateConflict(order.status);
      check?.(order);
      const result = await ProductOrder.findOneAndUpdate(
        { _id: id, status: order.status, version: order.version },
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
      return result;
    });
    return viewOf(updated);
  }

  return Object.freeze({
    async list(actor, query) {
      requireAdmin(actor);
      const { tab, search, limit } = parseManagementListQuery(query);
      const filter = {};
      if (tab !== 'ALL') filter.status = { $in: PRODUCT_ORDER_TAB_STATUSES[tab] };
      if (search) {
        const pattern = escapeRegex(search);
        const named = await User.find({ roles: 'CUSTOMER', displayName: { $regex: pattern, $options: 'i' } })
          .select('_id').limit(NAME_MATCH_LIMIT).lean();
        filter.$or = [{ code: { $regex: `^${pattern}`, $options: 'i' } }, { customerId: { $in: named.map((user) => user._id) } }];
      }
      const direction = OLDEST_FIRST_TABS.has(tab) ? 1 : -1;
      const [docs, grouped] = await Promise.all([
        ProductOrder.find(filter).sort({ createdAt: direction, _id: direction }).limit(limit).lean(),
        ProductOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      ]);
      const names = await customerNames([...new Set(docs.map((doc) => String(doc.customerId)))]);
      const byStatus = new Map(grouped.map((row) => [row._id, row.count]));
      const counts = Object.fromEntries(Object.entries(PRODUCT_ORDER_TAB_STATUSES).map(([key, statuses]) =>
        [key, statuses.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0)]));
      return { items: docs.map((doc) => toAdminOrderView(doc, names.get(String(doc.customerId)))), counts };
    },
    async read(actor, orderId) {
      requireAdmin(actor);
      const doc = await ProductOrder.findById(parseObjectId(orderId, 'orderId')).lean();
      if (!doc) throw productSalesErrors.notFound();
      return viewOf(doc);
    },
    // Delivery orders: PLACED -> HANDED_TO_CARRIER with a tracking code (MSG103 when missing). Goods leave the shop.
    handToCarrier(actor, orderId, body) {
      const { trackingCode } = parseHandToCarrier(body);
      if (!trackingCode) {
        requireAdmin(actor);
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
      return transition(actor, orderId, {
        allowed: (order) => ['PLACED', 'READY'].includes(order.status),
        changes: () => ({ status: 'CANCELLED' }),
        stock: 'RELEASE'
      });
    }
  });
}
