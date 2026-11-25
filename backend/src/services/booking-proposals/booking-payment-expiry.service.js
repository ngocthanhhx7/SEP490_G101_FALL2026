import { createUnitOfWork } from '../unit-of-work.service.js';
import { assertFinanceSourceStorage } from '../settlements/source-provisioning.js';
import { digest } from '../../validators/pet-care.validator.js';

const TERMINAL_UNPAID = new Set(['EXPIRED', 'CANCELLED', 'FAILED']);
const LOCAL_UNPAID = new Set(['PENDING', ...TERMINAL_UNPAID]);
const MAX_ATTEMPTS = 20;
const proofFields = ['_id', 'bookingId', 'provider', 'providerReference', 'amountVnd', 'currency',
  'version', 'state', 'expiresAt', 'linkState', 'linkRequestedAt', 'checkoutUrl', 'paymentLinkId'];
const fingerprint = row => digest(proofFields.map(field => [field, Object.hasOwn(row, field), row[field]]));

// JOB-03 never confirms a payment from a lookup. Any money or uncertain evidence
// leaves the booking for the existing verified webhook/reconciliation path.
export function createBookingPaymentExpiryService({ connection, provider, clock = Date.now }) {
  if (typeof provider?.getPaymentLink !== 'function') throw new TypeError('Verified payOS lookup required');
  const transaction = createUnitOfWork(connection);
  const col = name => connection.db.collection(name);
  const attempts = (bookingId, session) => col('paymentintents').find({ bookingId, provider: 'PAYOS' },
    { ...(session ? { session } : {}), maxTimeMS: 2000 }).sort({ _id: 1 }).limit(MAX_ATTEMPTS + 1).toArray();

  async function runBatch({ limit = 50 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Bounded expiry batch required');
    await assertFinanceSourceStorage(connection);
    const asOf = new Date(clock());
    const bookings = await col('bookings').find({ state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
      paymentDeadlineAt: { $lte: asOf } }, { maxTimeMS: 5000 })
      .sort({ paymentExpiryCheckedAt: 1, paymentDeadlineAt: 1, _id: 1 }).limit(limit).toArray();
    let expired = 0, deferred = 0;
    for (const booking of bookings) {
      try {
        await col('bookings').updateOne({ _id: booking._id, version: booking.version, state: 'AWAITING_PAYMENT' },
          { $set: { paymentExpiryCheckedAt: asOf } });
        const intents = await attempts(booking._id);
        if (!intents.length || intents.length > MAX_ATTEMPTS
          || intents.some(intent => !LOCAL_UNPAID.has(intent.state))) { deferred++; continue; }
        let verified = true;
        // Include replaced/cancelled/expired attempts: their local state is not bank evidence.
        for (const intent of intents) {
          const orderCode = Number(intent.providerReference);
          if (!Number.isSafeInteger(orderCode) || orderCode < 1 || intent.currency !== 'VND'
            || !Number.isSafeInteger(intent.amountVnd) || intent.amountVnd < 1) { verified = false; continue; }
          try {
            const remote = await provider.getPaymentLink(orderCode);
            if (remote?.orderCode !== orderCode || remote.amount !== intent.amountVnd
              || remote.amountPaid !== 0 || !TERMINAL_UNPAID.has(remote.providerStatus)
              || (remote.amountRemaining !== undefined && remote.amountRemaining !== intent.amountVnd)) verified = false;
          } catch { verified = false; }
        }
        if (!verified) { deferred++; continue; }
        const changed = await transaction.run(async session => {
          const current = await col('bookings').findOne({ _id: booking._id, version: booking.version,
            state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: booking.paymentDeadlineAt }, { session });
          if (!current || await col('payments').findOne({ bookingId: booking._id,
            state: { $in: ['VERIFIED', 'RECONCILIATION_REQUIRED'] } }, { session })) return false;
          const fresh = await attempts(booking._id, session);
          const before = new Map(intents.map(intent => [String(intent._id), fingerprint(intent)]));
          if (fresh.length !== intents.length || fresh.some(row => before.get(String(row._id)) !== fingerprint(row))) return false;
          const occupied = await col('visits').findOne({ bookingId: booking._id,
            $or: [{ state: { $nin: ['SCHEDULED', 'CANCELLED', 'SUPERSEDED'] } },
              { state: 'SCHEDULED', sitterId: { $ne: null } }] }, { session, projection: { _id: 1 } });
          if (occupied) return false;
          // Link replacement writes this same booking in its transaction. A new
          // attempt cannot commit against an expiry snapshot that omitted it.
          const updated = await col('bookings').updateOne({ _id: booking._id, version: booking.version,
            state: 'AWAITING_PAYMENT', paymentState: 'UNPAID' },
          { $set: { state: 'PAYMENT_EXPIRED', expiredAt: asOf }, $inc: { version: 1, financeGuardVersion: 1 } }, { session });
          if (!updated.matchedCount) return false;
          await col('paymentintents').updateMany({ _id: { $in: intents.filter(row => row.state === 'PENDING').map(row => row._id) }, state: 'PENDING' },
            { $set: { state: 'EXPIRED', expiredAt: asOf }, $inc: { version: 1 } }, { session });
          await col('visits').updateMany({ bookingId: booking._id, state: 'SCHEDULED', sitterId: null },
            { $set: { state: 'CANCELLED', cancellationReason: 'PAYMENT_EXPIRED', cancelledAt: asOf }, $inc: { version: 1 } }, { session });
          const eventId = `booking-payment-expired:${booking._id}`;
          await col('financesourceevents').insertOne({ _id: eventId, type: 'BookingPaymentExpired',
            bookingId: String(booking._id), actorId: null, resourceId: String(booking._id), at: asOf }, { session });
          await col('notifications').updateOne({ _id: digest([eventId, String(booking.customerId)]) }, { $setOnInsert: {
            eventId, eventType: 'BOOKING_PAYMENT_EXPIRED', recipientId: String(booking.customerId), role: 'CUSTOMER', channel: 'IN_APP',
            title: 'Đơn đã hết hạn thanh toán',
            message: 'This booking was not paid in 15 minutes and is no longer held. Please book again.',
            metadata: { bookingId: String(booking._id), messageCode: 'MSG67' }, deepLink: `/account/bookings/${booking._id}`,
            createdAt: asOf, readAt: null
          } }, { session, upsert: true });
          return true;
        });
        if (changed) expired++; else deferred++;
      } catch { deferred++; }
    }
    return { checked: bookings.length, expired, deferred };
  }
  return Object.freeze({ runBatch });
}
