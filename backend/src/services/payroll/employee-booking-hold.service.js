import { payrollModels } from '../../models/payroll.model.js';
import { AppError } from '../../utils/app-error.js';

export function createEmployeeBookingHolds({ connection, finance }) {
  const { PayrollMonthGuard: Guard } = payrollModels(connection);
  return { async change({ booking, actorId, reference, lockType, session }) {
    if (!session || !['CASE', 'REFUND'].includes(lockType) || !actorId || !reference) throw new TypeError('Audited transactional hold required');
    const guarded = await finance.touch(booking, session);
    const visits = await connection.collection('visits').find({ bookingId: booking._id },
      { session, projection: { sitterId: 1 }, maxTimeMS: 5000 }).limit(61).toArray();
    if (visits.length > 60) throw new AppError(409, 'SOURCE_RECONCILIATION_REQUIRED', 'Booking employee ownership requires review');
    for (const employeeId of [...new Set(visits.filter(row => row.sitterId).map(row => String(row.sitterId)))].sort()) {
      if (!/^[a-f0-9]{24}$/i.test(employeeId)) throw new AppError(409, 'SOURCE_RECONCILIATION_REQUIRED', 'Booking employee reference requires review');
      await Guard.findOneAndUpdate({ _id: `employee:${employeeId}` }, { $inc: { version: 1 } }, { session, upsert: true });
    }
    // Case/refund writes in the same transaction carry the hold and explicit release.
    return guarded;
  } };
}
