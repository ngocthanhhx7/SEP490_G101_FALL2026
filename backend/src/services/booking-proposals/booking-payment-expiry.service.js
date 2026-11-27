import { canRecoverUnpublishedAttempt } from './booking-payment-attempt.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { digest } from '../../validators/pet-care.validator.js';

const NOT_PAID_AT_PROVIDER = new Set(['EXPIRED', 'CANCELLED', 'FAILED']);
// Checkout reserves an order code before any payOS request. Until the link
// command claims the intent, payOS cannot know this order code; a 404 is not
// evidence of a failed payment. The absence of every submission marker is
// authoritative only while the intent remains unchanged in our transaction.
const neverSubmitted = intent => intent.state === 'PENDING' && intent.linkState === undefined &&
  intent.linkRequestedAt === undefined && intent.checkoutUrl === undefined && intent.paymentLinkId === undefined;
// A replaced attempt has a durable terminal state obtained from a validated
// payOS lookup. Do not require a second lookup just because a newer attempt
// has not yet been submitted; never treat a bare local CANCELLED as evidence.
const terminalReceipt = intent => intent.state === 'CANCELLED' &&
  NOT_PAID_AT_PROVIDER.has(intent.providerTerminalStatus);
const safeRemote = (intent, remote) => remote?.orderCode === Number(intent.providerReference) &&
  Number.isSafeInteger(remote.orderCode) && remote.amount === intent.amountVnd &&
  remote.amountPaid === 0 && NOT_PAID_AT_PROVIDER.has(remote.providerStatus);
const unchanged = (before, row) => before && before.version === row.version && before.state === row.state &&
  before.providerReference === row.providerReference && before.amountVnd === row.amountVnd &&
  before.expiresAt?.getTime() === row.expiresAt?.getTime() &&
  before.providerTerminalStatus === row.providerTerminalStatus && before.linkState === row.linkState &&
  before.linkRequestedAt?.getTime() === row.linkRequestedAt?.getTime() &&
  before.checkoutUrl === row.checkoutUrl && before.paymentLinkId === row.paymentLinkId;

// JOB-03: a clock deadline alone never authorizes payment expiry. Either no
// payOS request was ever started, or authenticated provider evidence confirms
// terminal unpaid attempts. Both paths are guarded by the booking transaction.
export function createBookingPaymentExpiryService({ connection, provider, clock = Date.now }) {
  if (typeof provider?.getPaymentLink !== 'function') throw new TypeError('Verified payOS lookup required');
  const transaction = createUnitOfWork(connection);
  const col = name => connection.db.collection(name);
  // Keep a stable _id scan position across worker ticks. Deferred bookings
  // remain eligible and are revisited after the scan wraps; they cannot block
  // later bookings merely because the first 50 still need reconciliation.
  let scanAfterId = null;

  async function runBatch() {
    await assertFinanceSourceStorage(connection);
    const asOf = new Date(clock());
    // Counter bookings share a single payment intent with a grooming appointment.
    // Their expiry must cancel both records atomically in counterCheckout.expireBatch().
    const eligible = { state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: { $lte: asOf },
      createdChannel: { $ne: 'COUNTER' } };
    const page = afterId => col('bookings').find(afterId ? { ...eligible, _id: { $gt: afterId } } : eligible,
      { maxTimeMS: 5000 }).sort({ _id: 1 }).limit(50).toArray();
    let bookings = await page(scanAfterId);
    if (!bookings.length && scanAfterId) {
      scanAfterId = null;
      bookings = await page(null);
    }
    if (bookings.length) scanAfterId = bookings[bookings.length - 1]._id;
    let expired = 0, deferred = 0;
    for (const booking of bookings) {
      const intents = await col('paymentintents').find({ bookingId: booking._id, provider: 'PAYOS' },
        { maxTimeMS: 2000 }).limit(20).toArray();
      if (!intents.length || intents.length >= 20 || !intents.some(intent => intent.state === 'PENDING')) {
        deferred++; continue;
      }
      const pending = intents.filter(intent => intent.state === 'PENDING');
      let verified = true;
      for (const intent of intents) {
        if (!['PENDING', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(intent.state)) { verified = false; break; }
        if (neverSubmitted(intent) || terminalReceipt(intent)) continue;
        // Each *attempted* link needs its own terminal-unpaid evidence. The
        // newest PENDING intent may be purely local even after a replacement.
        try {
          const remote = await provider.getPaymentLink(Number(intent.providerReference));
          if (!safeRemote(intent, remote)) verified = false;
        } catch (error) {
          // The old owner can no longer publish a link after this intent is
          // expired. Only a provider-confirmed missing link can resolve this claim.
          verified = canRecoverUnpublishedAttempt(intent, asOf) && intent.expiresAt instanceof Date
            && intent.expiresAt <= asOf && error?.code === 'PAYOS_LINK_NOT_FOUND';
        }
        if (!verified) break;
      }
      if (!verified) {
        deferred++; continue;
      }
      try {
        const changed = await transaction.run(async session => {
          const current = await col('bookings').findOne({ _id: booking._id, version: booking.version,
            state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: { $lte: asOf } }, { session });
          if (!current || await col('payments').findOne({ bookingId: booking._id,
            state: { $in: ['VERIFIED', 'RECONCILIATION_REQUIRED'] } }, { session })) return false;
          const fresh = await col('paymentintents').find({ bookingId: booking._id, provider: 'PAYOS' }, { session }).toArray();
          if (fresh.length !== intents.length || fresh.some(row => {
            const before = intents.find(intent => String(intent._id) === String(row._id));
            return !unchanged(before, row) ||
              (neverSubmitted(before) && !neverSubmitted(row)) ||
              (terminalReceipt(before) && !terminalReceipt(row));
          })) return false;
          const visitIds = current.visitIds ?? [];
          const nonPendingVisits = await col('visits').findOne({ _id: { $in: visitIds }, bookingId: booking._id,
            state: { $nin: ['SCHEDULED', 'CANCELLED'] } }, { session, projection: { _id: 1 } });
          if (nonPendingVisits) return false;
          const updated = await col('bookings').updateOne({ _id: booking._id, version: booking.version, state: 'AWAITING_PAYMENT',
            paymentState: 'UNPAID' }, { $set: { state: 'PAYMENT_EXPIRED' }, $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          if (!updated.matchedCount) return false;
          await col('paymentintents').updateMany({ _id: { $in: pending.map(row => row._id) }, state: 'PENDING' },
            { $set: { state: 'EXPIRED', expiredAt: asOf }, $inc: { version: 1 } }, { session });
          await col('visits').updateMany({ _id: { $in: visitIds }, bookingId: booking._id, state: 'SCHEDULED' },
            { $set: { state: 'CANCELLED', cancelledAt: asOf }, $inc: { version: 1 } }, { session });
          await col('financesourceevents').insertOne({ _id: `booking-payment-expired:${booking._id}`,
            type: 'BookingPaymentExpired', bookingId: String(booking._id), actorId: null,
            resourceId: String(booking._id), at: asOf }, { session });
          // MSG67 belongs to the canonical JOB-03 transaction. A failed delivery
          // record rolls back expiry, allowing the same worker to retry safely.
          const eventId = `booking-payment-expired:${booking._id}`;
          await col('notifications').updateOne({ _id: digest([eventId, String(booking.customerId)]) }, { $setOnInsert: {
            eventId, eventType: 'BOOKING_PAYMENT_EXPIRED', recipientId: String(booking.customerId), role: 'CUSTOMER', channel: 'IN_APP',
            title: 'Đơn đã hết hạn thanh toán',
            message: 'Lịch đặt chưa được thanh toán trong 15 phút nên không còn được giữ. Vui lòng đặt lại.',
            metadata: { bookingId: String(booking._id) }, deepLink: `/account/bookings/${booking._id}`,
            createdAt: asOf, readAt: null
          } }, { session, upsert: true });
          return true;
        });
        if (changed) expired++;
        else deferred++;
      } catch { deferred++; }
    }
    return { checked: bookings.length, expired, deferred };
  }
  return Object.freeze({ runBatch });
}
