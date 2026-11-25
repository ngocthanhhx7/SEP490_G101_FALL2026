import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';

const NOT_PAID_AT_PROVIDER = new Set(['EXPIRED', 'CANCELLED', 'FAILED']);
// Checkout reserves an order code before any payOS request. Until the link
// command claims the intent, payOS cannot know this order code; a 404 is not
// evidence of a failed payment. The absence of every submission marker is
// authoritative only while the intent remains unchanged in our transaction.
const neverSubmitted = intent => intent.state === 'PENDING' && !intent.linkState &&
  !intent.linkRequestedAt && !intent.checkoutUrl && !intent.paymentLinkId;

// JOB-03: a clock deadline alone never authorizes payment expiry. Either no
// payOS request was ever started, or authenticated provider evidence confirms
// terminal unpaid attempts. Both paths are guarded by the booking transaction.
export function createBookingPaymentExpiryService({ connection, provider, clock = Date.now }) {
  if (typeof provider?.getPaymentLink !== 'function') throw new TypeError('Verified payOS lookup required');
  const transaction = createUnitOfWork(connection);
  const col = name => connection.db.collection(name);

  async function runBatch() {
    await assertFinanceSourceStorage(connection);
    const asOf = new Date(clock());
    const bookings = await col('bookings').find({ state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
      paymentDeadlineAt: { $lte: asOf } }, { maxTimeMS: 5000 }).limit(50).toArray();
    let expired = 0, deferred = 0;
    for (const booking of bookings) {
      const intents = await col('paymentintents').find({ bookingId: booking._id, provider: 'PAYOS' },
        { maxTimeMS: 2000 }).limit(20).toArray();
      if (!intents.length || intents.length >= 20 || !intents.some(intent => intent.state === 'PENDING')) {
        deferred++; continue;
      }
      const pending = intents.filter(intent => intent.state === 'PENDING');
      const neverSentToPayos = intents.every(neverSubmitted);
      let verified = neverSentToPayos;
      if (!neverSentToPayos) {
        verified = true;
        for (const intent of pending) {
          try {
            const remote = await provider.getPaymentLink(Number(intent.providerReference));
            if (remote.orderCode !== Number(intent.providerReference) || remote.amount !== intent.amountVnd ||
              remote.amountPaid !== 0 || !NOT_PAID_AT_PROVIDER.has(remote.providerStatus)) verified = false;
          } catch { verified = false; }
          if (!verified) break;
        }
      }
      if (!verified || intents.some(intent => !['PENDING', 'CANCELLED', 'EXPIRED', 'FAILED'].includes(intent.state))) {
        deferred++; continue;
      }
      try {
        const changed = await transaction.run(async session => {
          const current = await col('bookings').findOne({ _id: booking._id, version: booking.version,
            state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: { $lte: asOf } }, { session });
          if (!current || await col('payments').findOne({ bookingId: booking._id, state: 'VERIFIED' }, { session })) return false;
          const fresh = await col('paymentintents').find({ bookingId: booking._id, provider: 'PAYOS' }, { session }).toArray();
          if (fresh.length !== intents.length || fresh.some(row => {
            const before = intents.find(intent => String(intent._id) === String(row._id));
            return !before || before.version !== row.version || before.state !== row.state ||
              before.linkState !== row.linkState || before.linkRequestedAt?.getTime() !== row.linkRequestedAt?.getTime() ||
              before.checkoutUrl !== row.checkoutUrl || before.paymentLinkId !== row.paymentLinkId;
          }) || (neverSentToPayos && !fresh.every(neverSubmitted))) return false;
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
