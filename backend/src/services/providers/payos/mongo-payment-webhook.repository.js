import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { createUnitOfWork } from '../../unit-of-work.service.js';
import { financeSourceModels } from '../../../models/finance-source.model.js';
import { assertFinanceSourceStorage } from '../../settlements/source-provisioning.js';

// Called only after the provider signature verifier. Browser redirects cannot
// reach this repository, and a verified signature still must match server intent.
export function createMongoPaymentWebhookRepository({ connection, finance }) {
  const unitOfWork = createUnitOfWork(connection);
  const { FinanceSourceCommand: commands, FinanceSourceEvent: events } = financeSourceModels(connection);
  const col = name => connection.db.collection(name);
  const id = value => Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
  async function retry(work) {
    for (let attempt = 0; ; attempt++) {
      try { return await unitOfWork.run(work); }
      catch (error) { if (error.code !== 11000 || attempt >= 3) throw error; }
    }
  }
  return Object.freeze({
    async findPaymentIntentByProviderReference(providerReference) {
      const intent = await col('paymentintents').findOne({ provider: 'PAYOS', providerReference });
      if (!intent) return null;
      const booking = await col('bookings').findOne({ _id: intent.bookingId });
      return { id: String(intent._id), version: intent.version, state: intent.state, providerReference,
        amountVnd: intent.amountVnd, currency: intent.currency, expiresAt: intent.expiresAt,
        bookingState: booking?.state };
    },
    async recordWebhookOutcome({ eventId, receipt, decision }) {
      await assertFinanceSourceStorage(connection);
      const key = `payos:${eventId}`;
      const fingerprint = createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
      return retry(async session => {
        if (await commands.exists({ _id: key }).session(session)) return { status: 'DUPLICATE' };
        // The same bank reference arriving with a changed envelope is retained
        // for reconciliation, never applied as another payment.
        const previous = receipt.providerTransactionReference ? await col('payments').findOne({ provider: 'PAYOS',
          providerTransactionReference: receipt.providerTransactionReference }, { session }) : null;
        const intentId = id(decision.intentId);
        const intent = intentId ? await col('paymentintents').findOne({ _id: intentId, provider: 'PAYOS' }, { session }) : null;
        const booking = intent ? await col('bookings').findOne({ _id: intent.bookingId }, { session }) : null;
        const at = new Date(receipt.receivedAt);
        let reason = decision.type === 'RECONCILE' ? decision.reason : null;
        if (!reason && booking?.checkoutSnapshot?.policyVersion === 'PWC-CHECKOUT-2026-10-30-v1' &&
          (booking.paymentSnapshot?.currency !== 'VND' || booking.paymentSnapshot.amountVnd !== intent?.amountVnd || booking.paymentMode !== 'PREPAY'))
          reason = 'BOOKING_PAYMENT_SNAPSHOT_MISMATCH';
        if (!reason && (previous || !intent || !booking || intent.version !== decision.expectedIntentVersion
          || intent.state !== 'PENDING' || booking.state !== 'AWAITING_PAYMENT'
          || intent.providerReference !== receipt.providerOrderCode || intent.amountVnd !== receipt.amountVnd
          || intent.currency !== 'VND' || receipt.currency !== 'VND' || !(intent.expiresAt instanceof Date)
          || !Number.isFinite(at.getTime()) || at >= intent.expiresAt || receipt.providerCode !== '00'
          || !receipt.providerTransactionReference || !Number.isSafeInteger(intent.amountVnd) || intent.amountVnd <= 0)) {
          reason = previous ? 'REFERENCE_ALREADY_RECORDED' : 'INTENT_CHANGED_DURING_WEBHOOK';
        }
        if (!reason && await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED' }, { session })) reason = 'BOOKING_ALREADY_PAID';
        const paymentId = new Types.ObjectId();
        await col('payments').insertOne({ _id: paymentId, bookingId: booking?._id ?? null, intentId,
          provider: 'PAYOS', providerEventId: eventId, providerTransactionReference: receipt.providerTransactionReference,
          state: reason ? 'RECONCILIATION_REQUIRED' : 'VERIFIED', receiptMoney: { amountVnd: receipt.amountVnd, currency: receipt.currency },
          ...(reason ? { reconcileReason: reason } : { verifiedAt: at }), receivedAt: at, version: 0 }, { session });
        if (!reason) {
          const changed = await col('paymentintents').updateOne({ _id: intentId, version: intent.version, state: 'PENDING' },
            { $set: { state: 'PAID', paidAt: at }, $inc: { version: 1 } }, { session });
          if (!changed.matchedCount) throw new Error('Payment intent transition lost its guard');
          const updated = await finance.touch(booking, session, { paymentState: 'PAID',
            ...(booking.checkoutSnapshot?.policyVersion === 'PWC-CHECKOUT-2026-10-30-v1' ? { state: 'DISPATCH_PENDING' } : {}) });
          await finance.enqueue(updated, session);
        } else if (booking) {
          // Reconciliation receipts serialize with every earning source write too.
          await finance.touch(booking, session);
        }
        await events.create([{ _id: key, type: reason ? 'PaymentReconciliationRequired' : 'PaymentVerified',
          bookingId: booking ? String(booking._id) : null, resourceId: String(paymentId), actorId: null, at }], { session });
        const result = reason ? { status: 'RECONCILIATION_REQUIRED', reason } : { status: 'APPLIED' };
        await commands.create([{ _id: key, fingerprint, result, createdAt: at }], { session });
        return result;
      });
    }
  });
}
