import { payrollModels } from '../../models/payroll.model.js';
import { employeePayrollPolicy } from '../../constants/employee-payroll-policy.js';
import { AppError } from '../../utils/app-error.js';

export async function recordEmployeeServiceCompletion({ connection, visits, session }) {
  const { PayrollServiceCredit, PayrollMonthGuard } = payrollModels(connection);
  for (const employeeId of [...new Set(visits.map(visit => String(visit.sitterId)))].sort()) {
    await PayrollMonthGuard.findOneAndUpdate({ _id: `employee:${employeeId}` }, { $inc: { version: 1 } }, { session, upsert: true });
  }
  for (const visit of visits) {
    const basis = visit.snapshots?.employeeServiceNetVnd;
    const verification = visit.state === 'STAFF_CLOSED' && visit.closureVerification?.outcome === 'SERVICE_PERFORMED'
      ? visit.closureVerification : null;
    const actualEnd = verification ? verification.actualEndedAt : visit.checkOutAt;
    const completedAt = verification ? verification.actualEndedAt : visit.completedAt;
    if (!Number.isSafeInteger(basis) || basis < 0 || !(visit.checkInAt instanceof Date) || !(actualEnd instanceof Date) ||
      actualEnd < visit.checkInAt || !(completedAt instanceof Date) || !(visit.startAt instanceof Date) || !Number.isSafeInteger(visit.version)
      || verification && (!verification.byUserId || !verification.evidenceReference || !(verification.at instanceof Date)))
      throw new AppError(409, 'PAYROLL_SOURCE_RECONCILIATION_REQUIRED', 'Visit price/times require reconciliation');
    const careMinutes = Math.floor((actualEnd - visit.checkInAt) / 60000);
    if (careMinutes > 1440) throw new AppError(409, 'PAYROLL_SOURCE_RECONCILIATION_REQUIRED', 'Visit duration out of bounds');
    await PayrollServiceCredit.updateOne({ visitId: visit._id }, { $setOnInsert: {
      visitId: visit._id, bookingId: visit.bookingId, employeeId: visit.sitterId, completedAt,
      serviceNetVnd: basis, careMinutes, onTime: visit.checkInAt <= visit.startAt, reportsComplete: verification ? verification.reportsComplete === true : true,
      sourceVersion: visit.version, policyVersion: employeePayrollPolicy.version
    } }, { upsert: true, session, runValidators: true });
  }
}
