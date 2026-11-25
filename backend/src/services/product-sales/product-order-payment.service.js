import { randomInt } from 'node:crypto';
import { productSalesModels } from '../../models/product.model.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import { PRODUCT_PAYMENT_LIMITS } from '../../constants/product-fields.js';
import { AppError } from '../../utils/app-error.js';
import { parseObjectId } from '../../validators/product-order.validator.js';
import { productSalesErrors, requireCustomer } from './product-sales-errors.js';

// A payment link that was asked for more than this long ago and never answered no longer blocks a new request.
const STALE_LINK_REQUEST_MS = 60_000;
// payOS states of a link that can no longer be paid: the customer must get a new link (GBR-18).
const DEAD_LINK_STATES = new Set(['CANCELLED', 'EXPIRED', 'FAILED']);

// MSG33: payOS cannot make the payment link right now.
const providerUnavailable = () => new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'We cannot open the payment page right now. Please try again in a few minutes.');

// The payOS payment link of a prepaid product order (R3 UC-62 steps 7 and 8). `provider` and `webOrigin` come from route
// composition; without them the order is still placed and the customer can pay when payOS is back, within the deadline.
export function createProductOrderPaymentService({ connection, provider = null, webOrigin = null, clock = Date.now }) {
  const { ProductOrder } = productSalesModels(connection);

  async function lookup(reference) {
    try { return await provider.getPaymentLink(Number(reference)); }
    catch { throw providerUnavailable(); }
  }

  // Every payment link has its own payOS order code (payOS does not take a code twice), so paying again after a failed
  // or cancelled link is a new code. The code is saved before payOS is asked, so a result for it always finds this order.
  async function reserveReference(order, at) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = String(randomInt(1_000_000_000_000, 200_000_000_000_000));
      try {
        const reserved = await ProductOrder.findOneAndUpdate({
          _id: order._id, status: 'PLACED', paid: false, paymentMethod: 'PREPAID', version: order.version,
          [`payment.providerReferences.${PRODUCT_PAYMENT_LIMITS.maxReferences - 1}`]: { $exists: false },
          $or: [{ 'payment.linkState': { $ne: 'CREATING' } },
            { 'payment.linkRequestedAt': { $lt: new Date(at.getTime() - STALE_LINK_REQUEST_MS) } }]
        }, { $push: { 'payment.providerReferences': reference },
          $set: { 'payment.linkState': 'CREATING', 'payment.linkRequestedAt': at },
          $unset: { 'payment.checkoutUrl': '', 'payment.paymentLinkId': '' } },
        { returnDocument: 'after' }).lean();
        if (!reserved) throw new AppError(409, 'COMMAND_PENDING', 'A payment link is already being made for this order.');
        return reference;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    throw new AppError(409, 'COMMAND_PENDING', 'A payment link is already being made for this order.');
  }

  return Object.freeze({
    async createLink(actor, orderId) {
      const customerId = requireCustomer(actor);
      const id = parseObjectId(orderId, 'orderId');
      const order = await ProductOrder.findOne({ _id: id, customerId, channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (!order) throw productSalesErrors.notFound();
      if (order.paymentMethod !== 'PREPAID' || order.status !== 'PLACED' || order.paid) {
        throw productSalesErrors.orderStateConflict(order.status);
      }
      const at = new Date(clock());
      if (!order.paymentDeadlineAt || order.paymentDeadlineAt <= at) {
        throw new AppError(409, 'ORDER_PAYMENT_EXPIRED', 'The payment time of this order has passed.');
      }
      if (!provider || !webOrigin) throw providerUnavailable();

      const payment = order.payment ?? {};
      const references = payment.providerReferences ?? [];
      if (payment.linkState === 'READY' && payment.checkoutUrl && references.length > 0) {
        // The customer comes back to the same link while it still works; once it failed or was cancelled, a new one is made.
        const status = String((await lookup(references.at(-1))).providerStatus).toUpperCase();
        if (status === 'PAID') {
          throw new AppError(409, 'ORDER_PAYMENT_IN_PROGRESS', 'Your payment was received and is being recorded.');
        }
        if (!DEAD_LINK_STATES.has(status)) return { checkoutUrl: payment.checkoutUrl, expiresAt: order.paymentDeadlineAt };
      }

      const reference = await reserveReference(order, at);
      const back = new URL(`/customer/product-orders?order=${String(order._id)}`, webOrigin).href;
      const reservation = {
        _id: order._id, status: 'PLACED', paid: false, version: order.version,
        'payment.linkState': 'CREATING',
        $expr: { $eq: [{ $arrayElemAt: ['$payment.providerReferences', -1] }, reference] }
      };
      let link;
      let url;
      try {
        link = await provider.createPaymentLink({ orderCode: Number(reference), amount: order.total,
          description: 'PAWWORLD', expiredAt: Math.floor(order.paymentDeadlineAt.getTime() / 1000),
          returnUrl: back, cancelUrl: back });
        url = new URL(link.checkoutUrl);
        if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/') || link.orderCode !== Number(reference)
          || link.amount !== order.total || link.currency !== 'VND') throw new Error('Provider link does not match the order');
      } catch {
        // The customer never got this link, so nothing can be paid on it: the code is dropped and the customer may try
        // again within the deadline (MSG33). A late result for a code that is gone would still reach staff as an unknown reference.
        await ProductOrder.updateOne(reservation,
          { $pull: { 'payment.providerReferences': reference }, $set: { 'payment.linkState': 'FAILED' } });
        throw providerUnavailable();
      }
      const saved = await ProductOrder.updateOne(reservation,
        { $set: { 'payment.linkState': 'READY', 'payment.checkoutUrl': url.href, 'payment.paymentLinkId': link.paymentLinkId } });
      if (!saved.matchedCount) throw new AppError(409, 'COMMAND_PENDING', 'The order or payment link has changed.');
      return { checkoutUrl: url.href, expiresAt: order.paymentDeadlineAt };
    }
  });
}

// R3 JOB-04, step 1: before an unpaid prepaid order is cancelled, payOS is asked whether it was paid after all.
// `handleVerifiedPayment` is the webhook service's entry for payment data that was not sent by a webhook, so the payment
// is recorded by the same code, once, whichever of the webhook and this check sees it first.
export function createProductOrderPaymentSettler({ provider, handleVerifiedPayment }) {
  if (typeof provider?.getPaymentLink !== 'function' || typeof handleVerifiedPayment !== 'function') {
    throw new TypeError('A payOS provider and a payment handler are required');
  }
  return Object.freeze({
    // 'PAID': recorded (the order is kept); 'RECONCILE': payOS knows a payment staff must look at (the order is kept for
    // them); 'UNPAID': payOS knows none. A payOS error is thrown so the caller leaves the order alone.
    async settleIfPaid(order) {
      for (const reference of [...(order.payment?.providerReferences ?? [])].reverse()) {
        const link = await provider.getPaymentLink(Number(reference));
        if (String(link.providerStatus).toUpperCase() !== 'PAID' || link.amountPaid <= 0) continue;
        const result = await handleVerifiedPayment({ orderCode: link.orderCode, amount: link.amountPaid, currency: 'VND',
          code: '00', reference: `LINK-${link.orderCode}`, paymentLinkId: `LINK-${link.orderCode}`, transactionDateTime: null });
        return result.status === 'PAYMENT_VERIFIED' || result.status === 'DUPLICATE' ? 'PAID' : 'RECONCILE';
      }
      return 'UNPAID';
    }
  });
}
