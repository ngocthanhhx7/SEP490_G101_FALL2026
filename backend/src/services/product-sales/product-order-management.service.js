import { checkProductPayment, requireUnpaidProductOutcome } from './product-order-payment.service.js';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import {
  DEFAULT_PRODUCT_PICKUP_DEADLINE_HOURS, PRODUCT_DELIVERY_AUTO_CONFIRM_MS, PRODUCT_ORDER_TAB_STATUSES, PRODUCT_PREPAID_PAYMENT_METHODS
} from '../../constants/product-fields.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import {
  parseManagementListQuery, parseHandToCarrier, parseNoBody, parseMarkReturning, parseConfirmReturned
} from '../../validators/product-order-management.validator.js';
import { parseObjectId, parseOrderListQuery } from '../../validators/product-order.validator.js';
import { createDeliveryCompletion, createOrderTransition } from './product-order-transition.js';
import { toOrderView } from './product-order.service.js';
import { readProductOrderTabCounts } from './product-order-tab-counts.js';
import { productOrderRefundAmount } from './product-order-pricing.js';
import { productSalesErrors, requireOnlineOrderCanceller, requireOrderHandler } from './product-sales-errors.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_MATCH_LIMIT = 100;
const PICKUP_EXPIRY_BATCH_SIZE = 100;
const HOUR_MS = 3_600_000;

// A prepaid order is paid through payOS before anything leaves the shop (GBR-36). Cash orders are not asked.
const isUnpaidPrepaid = (order) => order.paymentMethod === 'PREPAID' && !order.paid;
// A paid prepaid order that is cancelled or returned is marked for a refund with the amount of GBR-37; accounting pays it
// outside PWC. Nothing else is marked: an unpaid order has nothing to give back.
export const refundChanges = (order, options) => PRODUCT_PREPAID_PAYMENT_METHODS.includes(order.paymentMethod) && order.paid
  ? { refundMarked: true, refundAmountVnd: productOrderRefundAmount(order, options) } : {};
// Oldest first where staff work through a queue; newest first elsewhere.
const OLDEST_FIRST_TABS = new Set(['PREPARE', 'AWAITING_PICKUP']);

function toAdminOrderView(doc, customer) {
  const view = toOrderView(doc);
  const vietqrPaid = Boolean(doc.paid && doc.payment?.receipts?.some((row) => row.state === 'VERIFIED'));
  const paymentLink = doc.payment?.linkState
    ? { state: doc.payment.linkState, checkoutUrl: doc.payment.checkoutUrl ?? null,
      expiresAt: doc.payment.linkExpiresAt ?? null, orderCode: doc.payment.providerReferences?.at(-1) ?? null }
    : null;
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
    refundAmountVnd: doc.refundAmountVnd ?? null,
    vietqrPaid,
    paymentLink,
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

// The scheduler is the only caller (JOB-04). Recheck eligibility and the version selected by the batch inside
// the transaction so a concurrent payment, handover or another worker wins at most once.
// `payments` (route composition) asks payOS whether an overdue prepaid order was paid after all (R3 JOB-04, step 1).
export function createProductOrderExpiryService({ connection, clock = Date.now, logger = () => {}, payments = null }) {
  const { Product, ProductOrder, ProductCustomerRefusal } = productSalesModels(connection);
  const updateOrder = createOrderTransition({ connection, Product, ProductOrder, clock });
  const completeDelivery = createDeliveryCompletion({ updateOrder, clock });

  // Pick-up orders not collected by the deadline: a refusal against the customer; a paid one is marked for a refund.
  async function cancelUncollectedPickups(summary) {
    const cutoff = new Date(clock());
    const filter = {
      status: 'READY',
      receiveMethod: 'PICKUP',
      channel: { $ne: COUNTER_CHANNEL },
      pickupDeadlineAt: { $lte: cutoff },
      $nor: [{ paymentMethod: 'PAY_AT_SHOP', paid: true }]
    };
    const candidates = await ProductOrder.find(filter).select('_id version paid payment.providerReferences payment.receipts')
      .sort({ pickupDeadlineAt: 1, _id: 1 }).limit(PICKUP_EXPIRY_BATCH_SIZE).lean();
    for (const candidate of candidates) {
      try {
        if (!candidate.paid && await checkProductPayment(candidate, payments) !== 'UNPAID') { summary.kept += 1; continue; }
        const updated = await updateOrder(candidate._id, {
          expiryFilter: { ...filter, version: candidate.version },
          changes: (order) => ({ status: 'CANCELLED', cancelledAt: cutoff, cancelledBy: 'SYSTEM', ...refundChanges(order) }),
          stock: 'RELEASE',
          pickupExpired: true,
          effects: async (order, session) => {
            await ProductCustomerRefusal.create([{
              customerId: order.customerId, orderId: order._id, reason: 'NOT_COLLECTED', occurredAt: cutoff
            }], { session });
          }
        });
        if (updated) summary.cancelled += 1;
      } catch {
        summary.failed += 1;
        logger({ event: 'product_pickup_expiry_order_failed', orderId: String(candidate._id) });
      }
    }
  }

  // Prepaid orders not paid by the payment deadline (GBR-36): cancelled unless payOS knows a payment.
  async function cancelUnpaidPrepaid(summary) {
    const cutoff = new Date(clock());
    const filter = {
      status: 'PLACED',
      paymentMethod: 'PREPAID',
      paid: false,
      channel: { $ne: COUNTER_CHANNEL },
      paymentDeadlineAt: { $lte: cutoff }
    };
    const candidates = await ProductOrder.find(filter).select('_id version payment.providerReferences payment.receipts')
      .sort({ paymentDeadlineAt: 1, _id: 1 }).limit(PICKUP_EXPIRY_BATCH_SIZE).lean();
    for (const candidate of candidates) {
      try {
        // A payOS error throws and leaves the order for the next run, so a paid order is never cancelled by mistake.
        if (!payments && candidate.payment?.providerReferences?.length) {
          summary.kept += 1;
          continue;
        }
        const outcome = await checkProductPayment(candidate, payments);
        if (outcome !== 'UNPAID') { summary.kept += 1; continue; }
        // The cancellation only applies while the order is still unpaid and unchanged. A late payment is no refusal
        // (GBR-36), so no refusal record is written.
        const updated = await updateOrder(candidate._id, {
          expiryFilter: { ...filter, version: candidate.version },
          changes: () => ({ status: 'CANCELLED', cancelledAt: cutoff, cancelledBy: 'SYSTEM' }),
          stock: 'RELEASE',
          paymentExpired: true
        });
        if (updated) summary.cancelled += 1;
      } catch (error) {
        summary.failed += 1;
        logger({ event: 'product_payment_expiry_order_failed', orderId: String(candidate._id), code: error?.code ?? error?.name });
      }
    }
  }

  // Delivery orders handed to the carrier 7 days ago or more that are still on the way (GBR-36, JOB-04):
  // mark Delivered (COD becomes paid) and notify the customer. Legacy orders without handedToCarrierAt are skipped.
  async function autoDeliverShippedOrders(summary) {
    const cutoff = new Date(clock());
    const handedBefore = new Date(cutoff.getTime() - PRODUCT_DELIVERY_AUTO_CONFIRM_MS);
    const filter = {
      status: 'HANDED_TO_CARRIER',
      receiveMethod: 'DELIVERY',
      channel: { $ne: COUNTER_CHANNEL },
      handedToCarrierAt: { $lte: handedBefore }
    };
    const candidates = await ProductOrder.find(filter).select('_id version')
      .sort({ handedToCarrierAt: 1, _id: 1 }).limit(PICKUP_EXPIRY_BATCH_SIZE).lean();
    for (const candidate of candidates) {
      try {
        const updated = await completeDelivery(candidate._id, {
          deliveredBy: 'SYSTEM',
          expiryFilter: { ...filter, version: candidate.version }
        });
        if (updated) summary.delivered += 1;
      } catch (error) {
        summary.failed += 1;
        logger({ event: 'product_delivery_auto_confirm_failed', orderId: String(candidate._id), code: error?.code ?? error?.name });
      }
    }
  }

  return Object.freeze({
    async runBatch() {
      const summary = { cancelled: 0, delivered: 0, failed: 0, kept: 0 };
      await cancelUncollectedPickups(summary);
      await cancelUnpaidPrepaid(summary);
      await autoDeliverShippedOrders(summary);
      return summary;
    }
  });
}

// The earlier name of the job service, kept so existing callers keep working.
export const createProductPickupExpiryService = createProductOrderExpiryService;

// Order handling (R3 Order Management) for whoever PRODUCT_PERMISSIONS allows. Stock follows GBR-35:
// goods leaving the shop release the hold and reduce the real stock; cancelling only releases the hold;
// a confirmed return puts back only what can be sold again.
// phones is the customer phone directory; it is injected by route composition.
export function createProductOrderManagementService({
  connection, phones, payments = null, clock = Date.now, pickupDeadlineHours = DEFAULT_PRODUCT_PICKUP_DEADLINE_HOURS
}) {
  if (typeof phones?.userIdsByPhone !== 'function' || typeof phones?.phonesOf !== 'function') {
    throw new TypeError('A customer phone directory is required');
  }
  const { Product, ProductOrder, ProductCustomerRefusal } = productSalesModels(connection);
  const User = userModel(connection);
  const updateOrder = createOrderTransition({ connection, Product, ProductOrder, clock });
  const completeDelivery = createDeliveryCompletion({ updateOrder, clock });

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

  async function transition(actor, orderId, options) {
    requireOrderHandler(actor);
    const id = parseObjectId(orderId, 'orderId');
    return viewOf(await updateOrder(id, options));
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
      const [docs, counts, total] = await Promise.all([
        ProductOrder.find(filter).sort({ createdAt: direction, _id: direction }).skip((page - 1) * limit).limit(limit).lean(),
        readProductOrderTabCounts(ProductOrder),
        ProductOrder.countDocuments(filter)
      ]);
      const customers = await customerDetails([...new Set(docs.map((doc) => String(doc.customerId)))]);
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
        // A prepaid order waits for its payment or is cancelled at the payment deadline (GBR-36, UC-64 step 1.1).
        check: (order) => { if (isUnpaidPrepaid(order)) throw productSalesErrors.orderNotPaid(); },
        changes: () => ({ status: 'HANDED_TO_CARRIER', trackingCode, handedToCarrierAt: new Date(clock()) }),
        stock: 'LEAVE'
      });
    },
    // Pickup orders: PLACED -> READY. The deadline is fixed at this action and stock stays held.
    markReady(actor, orderId, body) {
      parseNoBody(body);
      const pickupDeadlineAt = new Date(new Date(clock()).getTime() + pickupDeadlineHours * HOUR_MS);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'PICKUP' && order.status === 'PLACED',
        // An unpaid prepaid order is not made ready: it would start the pick-up deadline before the payment is in.
        check: (order) => { if (isUnpaidPrepaid(order)) throw productSalesErrors.orderNotPaid(); },
        changes: () => ({ status: 'READY', pickupDeadlineAt })
      });
    },
    // Pickup orders: READY -> PICKED_UP, only when paid in full (MSG105). Goods leave the shop.
    handToCustomer(actor, orderId, body) {
      parseNoBody(body);
      return transition(actor, orderId, {
        allowed: (order) => order.receiveMethod === 'PICKUP' && order.status === 'READY',
        check: (order) => { if (!order.paid) throw productSalesErrors.orderNotPaid(); },
        changes: () => ({ status: 'PICKED_UP', deliveredAt: new Date(clock()) }),
        stock: 'LEAVE'
      });
    },
    // Delivery orders: HANDED_TO_CARRIER -> DELIVERED. Cash on delivery is collected by the carrier, so it is now paid;
    // an advance payment stays as it was.
    async markDelivered(actor, orderId, body) {
      parseNoBody(body);
      requireOrderHandler(actor);
      const id = parseObjectId(orderId, 'orderId');
      return viewOf(await completeDelivery(id, { deliveredBy: 'STAFF' }));
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
          // A customer who refuses the goods without a reason gets the price of the goods back (GBR-37).
          ...refundChanges(order, { goodsOnly: input.reason === 'CUSTOMER_REFUSED' })
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
    async recordPayment(actor, orderId, body) {
      requireOrderHandler(actor);
      const id = parseObjectId(orderId, 'orderId');
      parseNoBody(body);
      const current = await ProductOrder.findOne({ _id: id, channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (current && current.receiveMethod === 'PICKUP' && current.status === 'READY'
          && current.paymentMethod === 'PAY_AT_SHOP' && !current.paid
          && current.payment?.providerReferences?.length > 0) {
        const outcome = await checkProductPayment(current, payments);
        if (outcome === 'PAID') {
          const settled = await ProductOrder.findOne({ _id: id, channel: { $ne: COUNTER_CHANNEL } }).lean();
          if (settled?.paid) return viewOf(settled);
        }
        requireUnpaidProductOutcome(outcome);
      }
      return transition(actor, orderId, {
        check: order => { if (order.version !== current?.version) throw productSalesErrors.orderStateConflict(order.status); },
        // Cash is taken for a pick-up paid at the shop; a prepaid order is paid through payOS only.
        allowed: (order) => order.receiveMethod === 'PICKUP' && ['PLACED', 'READY'].includes(order.status) && !order.paid
          && order.paymentMethod !== 'PREPAID',
        changes: () => ({ paid: true })
      });
    },
    // Orders that have not left the shop: release the hold only; real stock is unchanged.
    async cancel(actor, orderId, body) {
      parseNoBody(body);
      requireOnlineOrderCanceller(actor);
      const current = await ProductOrder.findOne({ _id: parseObjectId(orderId, 'orderId'), channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (!current) throw productSalesErrors.notFound();
      if (!current.paid) requireUnpaidProductOutcome(await checkProductPayment(current, payments));
      return transition(actor, orderId, {
        check: order => { if (order.version !== current.version) throw productSalesErrors.orderStateConflict(order.status); },
        allowed: (order) => ['PLACED', 'READY'].includes(order.status),
        changes: (order) => ({ status: 'CANCELLED', cancelledAt: new Date(clock()), cancelledBy: 'STAFF', ...refundChanges(order) }),
        stock: 'RELEASE'
      });
    },
    // Admin tab "Order refunds" on Refund Processing: online orders marked for accounting refund (cancelled/returned prepaid).
    async listOrderRefunds(actor, query) {
      if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)) throw productSalesErrors.unauthenticated();
      if (!actor.roles.includes('ADMIN')) throw productSalesErrors.forbidden();
      const { page, limit } = parseOrderListQuery(query);
      const filter = { channel: { $ne: COUNTER_CHANNEL }, refundMarked: true };
      const [docs, total] = await Promise.all([
        ProductOrder.find(filter)
          .sort({ cancelledAt: -1, returnedAt: -1, updatedAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ProductOrder.countDocuments(filter)
      ]);
      const customers = await customerDetails([...new Set(docs.map((doc) => String(doc.customerId)))]);
      return {
        items: docs.map((doc) => toAdminOrderView(doc, customers.get(String(doc.customerId)))),
        page,
        limit,
        total
      };
    }
  });
}
