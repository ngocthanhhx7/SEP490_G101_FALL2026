import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { digest } from '../../validators/pet-care.validator.js';
import { Types } from 'mongoose';
import { financeSourceModels } from '../../models/finance-source.model.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';

// JOB-03: provider reads happen outside the transaction; current payment/booking
// guards are repeated inside it. A timeout or uncertain response never expires a booking.
export function createPaymentExpiryService({ connection, provider, clock = Date.now }) {
  const col = name => connection.db.collection(name), uow = createUnitOfWork(connection);
  const { FinanceSourceEvent: events } = financeSourceModels(connection);
  const notifications = createDomainNotifications({ connection, clock });
  async function confirmPaid(candidate, intent, evidence) {
    const transaction = evidence.transactions?.length === 1 ? evidence.transactions[0] : null;
    // A signed PAID status without a usable bank reference remains for reconciliation.
    if (evidence.amountPaid !== intent.amountVnd || evidence.amountRemaining !== 0 || intent.currency !== 'VND'
      || transaction?.amount !== intent.amountVnd || typeof transaction.reference !== 'string' || !transaction.reference.trim()
      || transaction.reference.length > 256) return false;
    return uow.run(async session => {
      const booking = await col('bookings').findOne({ _id: candidate._id, version: candidate.version,
        state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', 'paymentSnapshot.amountVnd': intent.amountVnd, 'paymentSnapshot.currency': 'VND' }, { session });
      if (!booking || await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED' }, { session })) return false;
      const changed = await col('paymentintents').updateOne({ _id: intent._id, version: intent.version, state: 'PENDING' },
        { $set: { state: 'PAID', paidAt: new Date(clock()) }, $inc: { version: 1 } }, { session });
      if (!changed.modifiedCount) return false;
      const paymentId = new Types.ObjectId(), eventId = `payos-lookup:${intent._id}`, at = new Date(clock());
      await col('payments').insertOne({ _id: paymentId, bookingId: booking._id, intentId: intent._id, provider: 'PAYOS', providerEventId: eventId,
        providerTransactionReference: transaction.reference.trim(), state: 'VERIFIED', receiptMoney: { amountVnd: intent.amountVnd, currency: 'VND' },
        receivedAt: at, verifiedAt: at, version: 0, storageContractVersion: 1 }, { session });
      await col('bookings').updateOne({ _id: booking._id, version: booking.version },
        { $set: { state: 'DISPATCH_PENDING', paymentState: 'PAID' }, $inc: { version: 1, financeGuardVersion: 1 } }, { session });
      await events.create([{ _id: eventId, type: 'PaymentVerified', bookingId: String(booking._id), resourceId: String(paymentId), actorId: null, at }], { session });
      await notifications.payment({ eventId, booking, reconciliation: false }, session);
      return true;
    });
  }
  return { async runBatch({ limit = 100 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Bounded expiry batch required');
    await assertFinanceSourceStorage(connection);
    const rows = await col('bookings').find({ state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
      paymentDeadlineAt: { $lte: new Date(clock()) } }, { maxTimeMS: 5000 }).sort({ paymentExpiryCheckedAt: 1, paymentDeadlineAt: 1, _id: 1 }).limit(limit).toArray();
    const result = { expired: 0, paid: 0, deferred: 0, failed: 0 };
    for (const candidate of rows) {
      try {
        await col('bookings').updateOne({ _id: candidate._id, state: 'AWAITING_PAYMENT', version: candidate.version },
          { $set: { paymentExpiryCheckedAt: new Date(clock()) } });
        const intent = await col('paymentintents').findOne({ bookingId: candidate._id, provider: 'PAYOS', state: 'PENDING' });
        if (!intent) { result.deferred++; continue; }
        const neverRequested = !intent.linkState && !intent.checkoutUrl && !intent.paymentLinkId;
        if (!neverRequested) {
          const evidence = await provider?.getPaymentLink(Number(intent.providerReference));
          if (evidence?.orderCode === Number(intent.providerReference) && evidence.amount === intent.amountVnd && evidence.providerStatus === 'PAID') {
            if (await confirmPaid(candidate, intent, evidence)) result.paid++; else result.deferred++;
            continue;
          }
          // Terminal unpaid evidence prevents a stale PENDING lookup from racing a new payment.
          if (!evidence || evidence.orderCode !== Number(intent.providerReference) || evidence.amount !== intent.amountVnd
            || evidence.amountPaid !== 0 || evidence.amountRemaining !== intent.amountVnd
            || !['EXPIRED', 'CANCELLED'].includes(evidence.providerStatus)) { result.deferred++; continue; }
        }
        const expired = await uow.run(async session => {
          const booking = await col('bookings').findOne({ _id: candidate._id, state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
            version: candidate.version, paymentDeadlineAt: candidate.paymentDeadlineAt }, { session });
          if (!booking || await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED' }, { session })) return false;
          const changed = await col('paymentintents').updateOne({ _id: intent._id, state: 'PENDING', version: intent.version,
            ...(neverRequested ? { linkState: { $exists: false }, checkoutUrl: { $exists: false }, paymentLinkId: { $exists: false } } : { linkState: intent.linkState }) },
          { $set: { state: 'EXPIRED', expiredAt: new Date(clock()) }, $inc: { version: 1 } }, { session });
          if (!changed.modifiedCount) return false;
          await col('bookings').updateOne({ _id: booking._id, version: booking.version },
            { $set: { state: 'PAYMENT_EXPIRED', expiredAt: new Date(clock()) }, $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          await col('visits').updateMany({ bookingId: booking._id, state: 'SCHEDULED', sitterId: null },
            { $set: { state: 'CANCELLED', cancellationReason: 'PAYMENT_EXPIRED', cancelledAt: new Date(clock()) }, $inc: { version: 1 } }, { session });
          const eventId = `booking-payment-expired:${booking._id}`;
          await col('notifications').updateOne({ _id: digest([eventId, String(booking.customerId)]) }, { $setOnInsert: {
            eventId, eventType: 'BOOKING_PAYMENT_EXPIRED', recipientId: String(booking.customerId), role: 'CUSTOMER', channel: 'IN_APP',
            title: 'Đơn đã hết hạn thanh toán',
            message: 'This booking was not paid in 15 minutes and is no longer held. Please book again.',
            metadata: { bookingId: String(booking._id), messageCode: 'MSG67' }, deepLink: `/account/bookings/${booking._id}`,
            createdAt: new Date(clock()), readAt: null
          } }, { upsert: true, session });
          return true;
        });
        if (expired) result.expired++; else result.deferred++;
      } catch { result.failed++; }
    }
    return result;
  } };
}
