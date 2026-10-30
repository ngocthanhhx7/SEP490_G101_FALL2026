import { fail, number } from '../../validators/pet-care.validator.js';
import { employeePayrollPolicy } from '../../constants/employee-payroll-policy.js';

const safe = value => { if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('PAYROLL_OVERFLOW', 'Payroll value out of bounds'); return Number(value); };
const ratio = (value, numerator, denominator) => safe((BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));

// Inputs must be verified server records. No HTTP caller supplies a final salary.
export function calculateEmployeePayroll({ contract, scheduledMinutes, paidMinutes, serviceNetVnd, kpi,
  overtimeVnd = 0, employeeInsuranceVnd, incomeTaxVnd, otherLawfulDeductionsVnd = 0, paidAdvanceVnd = 0,
  policy = employeePayrollPolicy }) {
  if (!contract || contract.salaryBasis !== 'GROSS' || !['FULL_TIME', 'PART_TIME'].includes(contract.employmentType))
    fail('CONTRACT_REQUIRED', 'Verified gross salary contract required', 409);
  for (const value of [contract.monthlyBaseVnd, serviceNetVnd, overtimeVnd, employeeInsuranceVnd, incomeTaxVnd, otherLawfulDeductionsVnd, paidAdvanceVnd]) number(value, 0, Number.MAX_SAFE_INTEGER, true);
  number(scheduledMinutes, 1, 31 * 24 * 60, true); number(paidMinutes, 0, scheduledMinutes, true);
  if (!kpi || typeof kpi.seriousViolationConfirmed !== 'boolean') fail('KPI_ASSESSMENT_REQUIRED', 'Verified KPI assessment required', 409);
  number(kpi.targetMinutes, 0, scheduledMinutes, true); number(kpi.completedMinutes, 0, 31 * 24 * 60, true);
  number(kpi.onTimeBps, 0, 10000, true); number(kpi.reportBps, 0, 10000, true);
  const baseVnd = ratio(contract.monthlyBaseVnd, paidMinutes, scheduledMinutes);
  const commissionVnd = ratio(serviceNetVnd, policy.commissionBps, 10000);
  const eligible = kpi.targetMinutes > 0 && kpi.onTimeBps >= policy.minimumOnTimeBps && kpi.reportBps >= policy.minimumReportBps && !kpi.seriousViolationConfirmed;
  let bonusVnd = 0;
  const bonuses = contract.employmentType === 'FULL_TIME' ? policy.fullTimeBonusVnd : policy.partTimeBonusVnd;
  if (eligible) for (let i = 0; i < policy.kpiThresholdBps.length; i++)
    if (BigInt(kpi.completedMinutes) * 10000n >= BigInt(kpi.targetMinutes) * BigInt(policy.kpiThresholdBps[i])) bonusVnd = bonuses[i];
  const grossVnd = safe(BigInt(baseVnd) + BigInt(commissionVnd) + BigInt(bonusVnd) + BigInt(overtimeVnd));
  const deductionsVnd = safe(BigInt(employeeInsuranceVnd) + BigInt(incomeTaxVnd) + BigInt(otherLawfulDeductionsVnd));
  if (deductionsVnd > grossVnd) fail('PAYROLL_RECONCILIATION_REQUIRED', 'Deductions exceed payroll', 409);
  const netBeforeAdvanceVnd = grossVnd - deductionsVnd;
  if (paidAdvanceVnd > netBeforeAdvanceVnd) fail('ADVANCE_RECONCILIATION_REQUIRED', 'Advance requires agreed settlement schedule', 409);
  return { currency: 'VND', baseVnd, commissionVnd, bonusVnd, overtimeVnd, grossVnd,
    employeeInsuranceVnd, incomeTaxVnd, otherLawfulDeductionsVnd, netBeforeAdvanceVnd, paidAdvanceVnd,
    payableVnd: netBeforeAdvanceVnd - paidAdvanceVnd, policyVersion: policy.version, contractVersion: contract.version,
    rounding: 'HALF_UP_VND_PER_COMPONENT' };
}
