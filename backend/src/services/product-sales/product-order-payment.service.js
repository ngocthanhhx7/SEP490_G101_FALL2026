import { randomInt } from 'node:crypto';
import { productSalesModels } from '../../models/product.model.js';
import { COUNTER_CHANNEL, COUNTER_VIETQR_LINK_TTL_MS } from '../../constants/counter-sale-fields.js';
import { PRODUCT_PAYMENT_LIMITS } from '../../constants/product-fields.js';
import { AppError } from '../../utils/app-error.js';
import { parseObjectId } from '../../validators/product-order.validator.js';
import { parseNoBody } from '../../validators/product-order-management.validator.js';
import { productSalesErrors, requireCounterSeller, requireCustomer, requireOrderHandler } from './product-sales-errors.js';

// A payment link that was asked for more than this long ago and never answered no longer blocks a new request.
const STALE_LINK_REQUEST_MS = 60_000;
// payOS states of a link that can no longer be paid: the customer must get a new link (GBR-18).
const DEAD_LINK_STATES = new Set(['CANCELLED', 'EXPIRED', 'FAILED']);

// MSG33: payOS cannot make the payment link right now.
const providerUnavailable = () => new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'We cannot open the payment page right now. Please try again in a few minutes.');

// The payOS payment link of a product order (online prepaid UC-62 steps 7-8, and counter VietQR UC-68).
// `provider` and `webOrigin` come from route composition; without them the order stays unpaid and can be retried later.
export function createProductOrderPaymentService({ connection, provider = null, webOrigin = null, clock = Date.now }) {
  const { ProductOrder } = productSalesModels(connection);

  async function lookup(reference) {
    try { return await provider.getPaymentLink(Number(reference)); }
    catch { throw providerUnavailable(); }
  }

  // Every payment link has its own payOS order code (payOS does not take a code twice), so paying again after a failed
  // or cancelled link is a new code. The code is saved before payOS is asked, so a result for it always finds this order.
  async function reserveReference(order, at, guard) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const reference = String(randomInt(1_000_000_000_000, 200_000_000_000_000));
      try {
        const reserved = await ProductOrder.findOneAndUpdate({
          _id: order._id, ...guard, version: order.version,
          [`payment.providerReferences.${PRODUCT_PAYMENT_LIMITS.maxReferences - 1}`]: { $exists: false },
          $or: [{ 'payment.linkState': { $ne: 'CREATING' } },
            { 'payment.linkRequestedAt': { $lt: new Date(at.getTime() - STALE_LINK_REQUEST_MS) } }]
        }, { $inc: { version: 1 }, $push: { 'payment.providerReferences': reference },
          $set: { 'payment.linkState': 'CREATING', 'payment.linkRequestedAt': at },
          $unset: { 'payment.checkoutUrl': '', 'payment.paymentLinkId': '', 'payment.linkExpiresAt': '' } },
        { returnDocument: 'after' }).lean();
        if (!reserved) throw new AppError(409, 'COMMAND_PENDING', 'A payment link is already being made for this order.');
        return reference;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    throw new AppError(409, 'COMMAND_PENDING', 'A payment link is already being made for this order.');
  }

  async function issueLink({ order, at, guard, expiresAt, returnPath, persistExpiresAt = false }) {
    if (!provider || !webOrigin) throw providerUnavailable();

    const payment = order.payment ?? {};
    const references = payment.providerReferences ?? [];
    if (unresolvedProductPayment(order)) throw paymentInProgress();
    if (references.length > 0 && (payment.linkState === 'READY' || payment.linkState === 'FAILED')) {
      const currentExpiry = persistExpiresAt ? payment.linkExpiresAt : expiresAt;
      const notExpiredLocally = !persistExpiresAt || (currentExpiry instanceof Date && currentExpiry > at);
      for (const previous of references.slice(0, -1)) {
        const prior = await lookup(previous);
        if (prior.amountPaid !== 0 || !DEAD_LINK_STATES.has(String(prior.providerStatus).toUpperCase())) throw paymentInProgress();
      }
      const existing = await lookup(references.at(-1));
      const status = String(existing.providerStatus).toUpperCase();
      if (existing.amountPaid !== 0 || status === 'PAID' || ((!notExpiredLocally || payment.linkState === 'FAILED') && !DEAD_LINK_STATES.has(status))) {
        throw new AppError(409, 'ORDER_PAYMENT_IN_PROGRESS', 'Check the existing payment before creating another link.');
      }
      if (payment.linkState === 'READY' && payment.checkoutUrl && notExpiredLocally && !DEAD_LINK_STATES.has(status)) {
        return { checkoutUrl: payment.checkoutUrl, expiresAt: currentExpiry, ...(persistExpiresAt ? { orderCode: references.at(-1) } : {}) };
      }
    }

    const reference = await reserveReference(order, at, guard);
    const back = new URL(returnPath, webOrigin).href;
    const reservation = {
      _id: order._id, ...guard, version: order.version + 1,
      'payment.linkState': 'CREATING',
      $expr: { $eq: [{ $arrayElemAt: ['$payment.providerReferences', -1] }, reference] }
    };
    let link;
    let url;
    try {
      link = await provider.createPaymentLink({ orderCode: Number(reference), amount: order.total,
        description: 'PAWWORLD', expiredAt: Math.floor(expiresAt.getTime() / 1000),
        returnUrl: back, cancelUrl: back });
      url = new URL(link.checkoutUrl);
      if (url.origin !== 'https://pay.payos.vn' || !url.pathname.startsWith('/web/') || link.orderCode !== Number(reference)
        || link.amount !== order.total || link.currency !== 'VND') throw new Error('Provider link does not match the order');
    } catch {
      // The link was never delivered, so nothing can be paid on it: the code is dropped and the caller may try again (MSG33).
      // A late result for a code that is gone would still reach staff as an unknown reference.
      await ProductOrder.updateOne(reservation,
        { $pull: { 'payment.providerReferences': reference }, $set: { 'payment.linkState': 'FAILED' } });
      throw providerUnavailable();
    }
    const saved = await ProductOrder.updateOne(reservation,
      { $set: { 'payment.linkState': 'READY', 'payment.checkoutUrl': url.href, 'payment.paymentLinkId': link.paymentLinkId,
        ...(persistExpiresAt ? { 'payment.linkExpiresAt': expiresAt } : {}) } });
    if (!saved.matchedCount) throw new AppError(409, 'COMMAND_PENDING', 'The order or payment link has changed.');
    return { checkoutUrl: url.href, expiresAt, ...(persistExpiresAt ? { orderCode: reference } : {}) };
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
      return issueLink({
        order, at, expiresAt: order.paymentDeadlineAt,
        guard: { status: 'PLACED', paid: false, paymentMethod: 'PREPAID' },
        returnPath: `/customer/product-orders?order=${String(order._id)}`
      });
    },

    // R3 UC-68 / GBR-38: VietQR payment link for an unpaid counter order. Uses a short link lifetime instead of
    // online paymentDeadlineAt so counter orders are never mixed with JOB-04 prepaid expiry.
    async createCounterLink(actor, orderId, body) {
      requireCounterSeller(actor);
      const id = parseObjectId(orderId, 'orderId');
      parseNoBody(body);
      const order = await ProductOrder.findOne({ _id: id, channel: COUNTER_CHANNEL }).lean();
      if (!order) throw productSalesErrors.notFound();
      if (order.status !== 'AWAITING_PAYMENT' || order.paid) {
        throw productSalesErrors.orderStateConflict(order.status);
      }
      const at = new Date(clock());
      const expiresAt = new Date(at.getTime() + COUNTER_VIETQR_LINK_TTL_MS);
      return issueLink({
        order, at, expiresAt, persistExpiresAt: true,
        guard: { channel: COUNTER_CHANNEL, status: 'AWAITING_PAYMENT', paid: false },
        returnPath: `/admin/counter-sale?order=${String(order._id)}`
      });
    },

    // R3 UC-67 branch 4.1: VietQR payment link when collecting an unpaid PAY_AT_SHOP pick-up order at the shop.
    async createPickupShopLink(actor, orderId, body) {
      requireOrderHandler(actor);
      const id = parseObjectId(orderId, 'orderId');
      parseNoBody(body);
      const order = await ProductOrder.findOne({ _id: id, channel: { $ne: COUNTER_CHANNEL } }).lean();
      if (!order) throw productSalesErrors.notFound();
      if (order.receiveMethod !== 'PICKUP' || order.status !== 'READY' || order.paymentMethod !== 'PAY_AT_SHOP' || order.paid) {
        throw productSalesErrors.orderStateConflict(order.status);
      }
      const at = new Date(clock());
      const expiresAt = new Date(at.getTime() + COUNTER_VIETQR_LINK_TTL_MS);
      return issueLink({
        order, at, expiresAt, persistExpiresAt: true,
        guard: { channel: { $ne: COUNTER_CHANNEL }, receiveMethod: 'PICKUP', status: 'READY', paymentMethod: 'PAY_AT_SHOP', paid: false },
        returnPath: `/admin/product-orders?tab=AWAITING_PICKUP&order=${String(order._id)}`
      });
    }
  });
}

const paymentInProgress = () => new AppError(409, 'ORDER_PAYMENT_IN_PROGRESS', 'Check the existing payment before changing this order.');

export const unresolvedProductPayment = order => order.payment?.receipts?.some(
  receipt => receipt.state === 'RECONCILIATION_REQUIRED' && receipt.reason !== 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' && receipt.amountVnd > 0
);

export async function checkProductPayment(order, payments) {
  if (unresolvedProductPayment(order)) return 'RECONCILE';
  if (!order.payment?.providerReferences?.length) return 'UNPAID';
  if (!payments) throw providerUnavailable();
  try { return await payments.settleIfPaid(order); } catch { throw providerUnavailable(); }
}

export function requireUnpaidProductOutcome(outcome) {
  if (outcome !== 'UNPAID') throw paymentInProgress();
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
      if (unresolvedProductPayment(order)) return 'RECONCILE';
      let outcome = 'UNPAID';
      for (const reference of [...(order.payment?.providerReferences ?? [])].reverse()) {
        const link = await provider.getPaymentLink(Number(reference));
        const status = String(link.providerStatus).toUpperCase();
        if (status !== 'PAID') {
          if (!DEAD_LINK_STATES.has(status) || link.amountPaid !== 0) outcome = 'RECONCILE';
          continue;
        }
        if (!Number.isSafeInteger(link.amountPaid) || link.amountPaid <= 0) return 'RECONCILE';
        const result = await handleVerifiedPayment({ orderCode: link.orderCode, amount: link.amountPaid, currency: 'VND',
          code: '00', reference: `LINK-${link.orderCode}`, paymentLinkId: `LINK-${link.orderCode}`, transactionDateTime: null });
        return result.status === 'PAYMENT_VERIFIED' ? 'PAID' : 'RECONCILE';
      }
      return outcome;
    }
  });
}
