import { payrollModels } from '../../models/payroll.model.js';
import { employeePayrollPolicy } from '../../constants/employee-payroll-policy.js';
import { AppError } from '../../utils/app-error.js';

export async function recordEmployeeServiceCompletion({ connection, visits, session }) {
  const { PayrollServiceCredit } = payrollModels(connection);
  for (const visit of visits) {
    const basis = visit.snapshots?.employeeServiceNetVnd;
    if (!Number.isSafeInteger(basis) || basis < 0 || !(visit.checkInAt instanceof Date) || !(visit.checkOutAt instanceof Date) ||
      visit.checkOutAt < visit.checkInAt || !(visit.startAt instanceof Date) || !Number.isSafeInteger(visit.version))
      throw new AppError(409, 'PAYROLL_SOURCE_RECONCILIATION_REQUIRED', 'Visit price/times require reconciliation');
    const careMinutes = Math.floor((visit.checkOutAt - visit.checkInAt) / 60000);
    if (careMinutes > 1440) throw new AppError(409, 'PAYROLL_SOURCE_RECONCILIATION_REQUIRED', 'Visit duration out of bounds');
    await PayrollServiceCredit.updateOne({ visitId: visit._id }, { $setOnInsert: {
      visitId: visit._id, bookingId: visit.bookingId, employeeId: visit.sitterId, completedAt: visit.completedAt,
      serviceNetVnd: basis, careMinutes, onTime: visit.checkInAt <= visit.startAt, reportsComplete: true,
      sourceVersion: visit.version, policyVersion: employeePayrollPolicy.version
    } }, { upsert: true, session, runValidators: true });
  }
}
