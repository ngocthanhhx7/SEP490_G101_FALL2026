import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { productSalesErrors } from './product-sales-errors.js';

// Shared changes for HANDED_TO_CARRIER -> DELIVERED across Sale Staff, Customer confirmation and JOB-04 (GBR-36).
// Cash on delivery becomes paid at delivery; prepaid orders keep their existing payment state.
export function deliveryCompletionChanges(order, { at, deliveredBy }) {
  return {
    status: 'DELIVERED',
    deliveredAt: at,
    deliveredBy,
    ...(order.paymentMethod === 'COD' ? { paid: true } : {})
  };
}

export function createOrderTransition({ connection, Product, ProductOrder, clock }) {
  const unitOfWork = createUnitOfWork(connection);
  const notifications = createDomainNotifications({ connection, clock });

  // One guarded status change plus its stock effect, all in one transaction.
  // The update only matches the status and version that were read, so two writers cannot both apply a change.
  // `effects` runs after the status change, in the same transaction, for writes that must stand or fall with it.
  return (id, { allowed, check, changes, stock, effects, filter: extraFilter, expiryFilter, pickupExpired = false, paymentExpired = false }) => {
    const filter = { _id: id, channel: { $ne: COUNTER_CHANNEL }, ...extraFilter, ...expiryFilter };
    return unitOfWork.run(async (session) => {
      const order = await ProductOrder.findOne(filter).session(session).lean();
      if (!order) {
        if (expiryFilter) return null;
        throw productSalesErrors.notFound();
      }
      if (allowed && !allowed(order)) throw productSalesErrors.orderStateConflict(order.status);
      check?.(order);
      const result = await ProductOrder.findOneAndUpdate(
        { ...filter, status: order.status, version: order.version },
        { $set: changes(order), $inc: { version: 1 } },
        { returnDocument: 'after', session }).lean();
      if (!result) {
        if (expiryFilter) return null;
        throw productSalesErrors.orderStateConflict(order.status);
      }
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
      await notifications.productOrder({ order: result, previous: order, pickupExpired, paymentExpired }, session);
      return result;
    });
  };
}

export function createDeliveryCompletion({ updateOrder, clock }) {
  return (orderId, { deliveredBy, filter, expiryFilter } = {}) => updateOrder(orderId, {
    filter,
    expiryFilter,
    allowed: (order) => order.receiveMethod === 'DELIVERY' && order.status === 'HANDED_TO_CARRIER',
    changes: (order) => deliveryCompletionChanges(order, { at: new Date(clock()), deliveredBy })
  });
}
