import { Types } from 'mongoose';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { productSalesModels } from '../../models/product.model.js';
import { COUNTER_CHANNEL, COUNTER_VIETQR_PAYMENT_METHOD } from '../../constants/counter-sale-fields.js';
import { PRODUCT_PAYMENT_LIMITS } from '../../constants/product-fields.js';

// The payOS result of a product order (online prepaid UC-62 step 8, counter VietQR UC-68, GBR-18). The payOS webhook
// repository calls this inside its own transaction, after the webhook service decided what the signed result means, so
// the receipt, the paid state and any notification stand or fall together. Receipts live on the order; no collection is added.
export function createProductOrderReceipts({ connection }) {
  const { ProductOrder } = productSalesModels(connection);
  const notifications = createDomainNotifications({ connection });

  const entryOf = (receipt, at, state, reason) => ({
    eventId: receipt.eventId,
    providerOrderCode: receipt.providerOrderCode,
    ...(receipt.providerTransactionReference ? { transactionReference: receipt.providerTransactionReference } : {}),
    ...(Number.isSafeInteger(receipt.amountVnd) && receipt.amountVnd >= 0 ? { amountVnd: receipt.amountVnd } : {}),
    state,
    ...(reason ? { reason } : {}),
    receivedAt: at
  });
  const keepNewest = (entry) => ({ $each: [entry], $slice: -PRODUCT_PAYMENT_LIMITS.maxReceipts });

  return Object.freeze({
    // The payment intent of the order that owns a payOS order code, in the shape the webhook service reads.
    async findIntent(providerReference) {
      const order = await ProductOrder.findOne({ 'payment.providerReferences': providerReference })
        .select('channel receiveMethod status paid paymentMethod total version paymentDeadlineAt payment.linkExpiresAt').lean();
      if (!order) return null;
      const isCounter = order.channel === COUNTER_CHANNEL;
      const isPickupAtShop = !isCounter && order.receiveMethod === 'PICKUP' && order.paymentMethod === 'PAY_AT_SHOP';
      const payableStatus = isCounter ? 'AWAITING_PAYMENT' : (isPickupAtShop ? 'READY' : 'PLACED');
      return {
        kind: 'PRODUCT_ORDER',
        id: String(order._id),
        version: order.version,
        providerReference,
        amountVnd: order.total,
        currency: 'VND',
        state: order.paid ? 'PAID' : 'PENDING',
        orderState: order.status === payableStatus && !order.paid ? 'AWAITING_PAYMENT' : order.status,
        expiresAt: isCounter || isPickupAtShop ? (order.payment?.linkExpiresAt ?? null) : order.paymentDeadlineAt
      };
    },

    // Applies one decision of the webhook service. Returns APPLIED, DUPLICATE (the same payment is already recorded) or
    // RECONCILIATION_REQUIRED (the money is kept as a receipt for staff; the order is never reopened or changed).
    async apply({ session, decision, receipt, at }) {
      const id = Types.ObjectId.isValid(decision.intentId) ? new Types.ObjectId(decision.intentId) : null;
      const order = id ? await ProductOrder.findOne({ _id: id }).session(session).lean() : null;
      if (!order) return { status: 'RECONCILIATION_REQUIRED', reason: 'UNKNOWN_REFERENCE', orderId: null };

      const isCounter = order.channel === COUNTER_CHANNEL;
      const isPickupAtShop = !isCounter && order.receiveMethod === 'PICKUP' && order.paymentMethod === 'PAY_AT_SHOP';
      const payableStatus = isCounter ? 'AWAITING_PAYMENT' : (isPickupAtShop ? 'READY' : 'PLACED');
      const receipts = order.payment?.receipts ?? [];
      let reason = decision.type === 'RECONCILE' ? decision.reason : null;
      const validOrderState = isCounter
        ? order.status === 'AWAITING_PAYMENT'
        : isPickupAtShop
          ? order.status === 'READY'
          : order.status === 'PLACED' && order.paymentMethod === 'PREPAID';
      if (!reason && (order.version !== decision.expectedIntentVersion || !validOrderState || order.paid
        || !order.payment?.providerReferences?.includes(receipt.providerOrderCode)
        || order.total !== receipt.amountVnd || receipt.currency !== 'VND' || receipt.providerCode !== '00'
        || !receipt.providerTransactionReference)) reason = 'INTENT_CHANGED_DURING_WEBHOOK';
      if (!reason && (receipts.some((row) => row.transactionReference === receipt.providerTransactionReference)
        || await connection.db.collection('payments').findOne({ provider: 'PAYOS',
          providerTransactionReference: receipt.providerTransactionReference }, { session, projection: { _id: 1 } }))) {
        reason = 'REFERENCE_ALREADY_RECORDED';
      }

      if (reason) {
        // The same payment reaching us twice (a webhook and a payOS status check) is one payment, not a problem.
        if (order.paid && receipts.some((row) => row.state === 'VERIFIED' && row.providerOrderCode === receipt.providerOrderCode
          && row.transactionReference === receipt.providerTransactionReference && row.amountVnd === receipt.amountVnd)) {
          return { status: 'DUPLICATE' };
        }
        const markShopLinkFailed = (isCounter || isPickupAtShop) && reason === 'PROVIDER_PAYMENT_NOT_SUCCESSFUL'
          && order.status === payableStatus && !order.paid
          && order.payment?.providerReferences?.at(-1) === receipt.providerOrderCode;
        await ProductOrder.updateOne({ _id: order._id }, {
          $push: { 'payment.receipts': keepNewest(entryOf(receipt, at, 'RECONCILIATION_REQUIRED', reason)) },
          ...(markShopLinkFailed ? { $set: { 'payment.linkState': 'FAILED' } } : {})
        }, { session });
        return { status: 'RECONCILIATION_REQUIRED', reason, orderId: String(order._id) };
      }

      const paid = await ProductOrder.findOneAndUpdate(
        { _id: order._id, version: order.version, status: payableStatus, paid: false },
        { $set: {
          paid: true,
          'payment.paidAt': at,
          'payment.linkState': 'PAID',
          ...(isCounter ? { status: 'PAID', paymentMethod: COUNTER_VIETQR_PAYMENT_METHOD } : {})
        },
        $push: { 'payment.receipts': keepNewest(entryOf(receipt, at, 'VERIFIED')) }, $inc: { version: 1 } },
        { returnDocument: 'after', session }).lean();
      if (!paid) {
        await ProductOrder.updateOne({ _id: order._id },
          { $push: { 'payment.receipts': keepNewest(entryOf(receipt, at, 'RECONCILIATION_REQUIRED', 'INTENT_CHANGED_DURING_WEBHOOK')) } }, { session });
        return { status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_CHANGED_DURING_WEBHOOK', orderId: String(order._id) };
      }
      if (!isCounter) await notifications.productOrder({ order: paid, previous: order }, session);
      return { status: 'APPLIED', orderId: String(order._id) };
    }
  });
}
