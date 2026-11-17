import { fail } from '../../validators/pet-care.validator.js';
import { recordEmployeeServiceCompletion } from '../payroll/completion-payroll-source.service.js';

// Operational closure is distinct from proof of service, payment and refunds.
// All writers touch the parent guard, serializing terminal decisions for siblings.
export async function finalizeExceptionalBooking({ connection, col, bookingId, session, at }) {
  const booking = await col('bookings').findOne({ _id: bookingId }, { session });
  if (!booking || !Number.isSafeInteger(booking.version) || booking.version < 0
    || !Array.isArray(booking.visitIds) || !booking.visitIds.length || booking.visitIds.length > 60
    || new Set(booking.visitIds.map(String)).size !== booking.visitIds.length) fail('SOURCE_RECONCILIATION_REQUIRED', 'Booking visit set requires review', 409);
  const visits = await col('visits').find({ bookingId, _id: { $in: booking.visitIds } }, { session }).limit(61).toArray();
  if (visits.length !== booking.visitIds.length) fail('SOURCE_RECONCILIATION_REQUIRED', 'Booking visit set is incomplete', 409);
  const terminal = visits.every(row => ['COMPLETED', 'CANCELLED', 'STAFF_CLOSED'].includes(row.state));
  const pending = visits.some(row => row.state === 'STAFF_CLOSED' && !row.closureVerification);
  const financialReview = visits.some(row => row.closureVerification?.outcome === 'NO_SERVICE')
    || visits.some(row => row.state === 'CANCELLED');
  const allCancelled = visits.every(row => row.state === 'CANCELLED');
  const fields = terminal ? { state: allCancelled ? 'CANCELLED' : 'CLOSED', closedAt: booking.closedAt ?? at,
    completionReviewState: pending ? 'PENDING' : financialReview ? 'FINANCIAL_RECONCILIATION_REQUIRED' : 'VERIFIED' } : {};
  const saved = await col('bookings').findOneAndUpdate({ _id: bookingId, version: booking.version },
    { $set: fields, $inc: { version: 1, financeGuardVersion: 1 } }, { session, returnDocument: 'after' });
  if (!saved) fail('VERSION_CONFLICT', 'Booking changed', 409);
  if (terminal && !pending && !allCancelled) {
    const earned = visits.filter(row => row.state === 'COMPLETED' || row.closureVerification?.outcome === 'SERVICE_PERFORMED');
    if (earned.length) await recordEmployeeServiceCompletion({ connection, visits: earned, session });
  }
  return saved;
}
