import { exact, id, number, instant, fail } from './pet-care.validator.js';
const text = (value, max = 1000) => { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail('VALIDATION_FAILED', 'Text required'); return value.trim(); };
export function payrollPageInput(value = {}, own = false) {
  exact(value, own ? ['advanceCursor', 'statementCursor', 'limit'] : ['cursor', 'limit', 'view'], []);
  const result = { ...value, limit: value.limit === undefined ? 20 : Number(value.limit) };
  if (value.limit !== undefined && !/^[1-9]\d?$/.test(String(value.limit))) fail('VALIDATION_FAILED', 'Invalid page size');
  number(result.limit, 1, 50, true);
  for (const key of own ? ['advanceCursor', 'statementCursor'] : ['cursor']) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 512 || !/^[A-Za-z0-9_-]+$/.test(value[key]))) fail('VALIDATION_FAILED', 'Invalid payroll cursor');
  }
  if (!own && value.view !== undefined && !['PENDING', 'HISTORY'].includes(value.view)) fail('VALIDATION_FAILED', 'Invalid payroll view');
  return result;
}
export function contractInput(value) {
  const required = ['employeeId', 'expectedVersion', 'employmentType', 'salaryBasis', 'monthlyBaseVnd', 'payCycle', 'weeklyMinutes', 'signedAt', 'effectiveAt', 'contractReference', 'workplaceRegion', 'workplaceReference'];
  exact(value, [...required, 'endsAt'], required); id(value.employeeId); number(value.expectedVersion, 0, 1000000, true);
  if (!['FULL_TIME', 'PART_TIME'].includes(value.employmentType) || !['GROSS', 'NET'].includes(value.salaryBasis) || !['MONTHLY', 'WEEKLY'].includes(value.payCycle)) fail('VALIDATION_FAILED', 'Invalid contract');
  number(value.monthlyBaseVnd, 1, Number.MAX_SAFE_INTEGER, true); number(value.weeklyMinutes, 1, 2880, true); number(value.workplaceRegion, 1, 4, true);
  const signedAt = new Date(instant(value.signedAt)), effectiveAt = new Date(instant(value.effectiveAt));
  const endsAt = value.endsAt ? new Date(instant(value.endsAt)) : undefined;
  if (signedAt > effectiveAt || (endsAt && endsAt <= effectiveAt)) fail('VALIDATION_FAILED', 'Invalid contract dates');
  if (value.employmentType === 'FULL_TIME' && (value.monthlyBaseVnd !== 10000000 || value.payCycle !== 'MONTHLY')) fail('VALIDATION_FAILED', 'Full-time agreement mismatch');
  if (value.employmentType === 'PART_TIME' && value.monthlyBaseVnd !== 3000000) fail('VALIDATION_FAILED', 'Part-time agreement mismatch');
  return { ...value, signedAt, effectiveAt, ...(endsAt ? { endsAt } : {}), contractReference: text(value.contractReference, 160), workplaceReference: text(value.workplaceReference, 160) };
}
export function advanceInput(value) {
  exact(value, ['amountVnd', 'reason', 'settlementPeriod', 'settlementConsentReference'], ['amountVnd', 'reason', 'settlementPeriod', 'settlementConsentReference']);
  number(value.amountVnd, 1, Number.MAX_SAFE_INTEGER, true);
  if (typeof value.settlementPeriod !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.settlementPeriod)) fail('VALIDATION_FAILED', 'Settlement month required');
  return { ...value, reason: text(value.reason), settlementConsentReference: text(value.settlementConsentReference, 160) };
}
export function advanceDecisionInput(value) {
  exact(value, ['expectedVersion', 'action', 'reason', 'transferReference'], ['expectedVersion', 'action']);
  number(value.expectedVersion, 0, 1000000, true);
  if (!['APPROVE', 'REJECT', 'WITHDRAW', 'RECORD_PAYMENT'].includes(value.action)) fail('VALIDATION_FAILED', 'Invalid advance action');
  return { ...value, ...(value.action === 'REJECT' ? { reason: text(value.reason) } : {}),
    ...(value.action === 'RECORD_PAYMENT' ? { transferReference: text(value.transferReference, 160) } : {}) };
}

export function payrollAssessmentInput(value) {
  const keys = ['employeeId', 'periodStart', 'periodEnd', 'dueAt', 'scheduledMonthMinutes', 'paidPeriodMinutes',
    'kpiTargetMinutes', 'seriousViolationConfirmed', 'overtimeVnd', 'employeeInsuranceVnd', 'incomeTaxVnd',
    'otherLawfulDeductionsVnd', 'assessmentReference', 'deductionConsentReference', 'includeMonthlyBonus', 'advanceRepayments'];
  exact(value, keys, keys); id(value.employeeId);
  const periodStart = new Date(instant(value.periodStart)), periodEnd = new Date(instant(value.periodEnd)), dueAt = new Date(instant(value.dueAt));
  if (periodEnd <= periodStart || dueAt < periodEnd || periodEnd - periodStart > 31 * 86400000) fail('VALIDATION_FAILED', 'Invalid payroll period');
  number(value.scheduledMonthMinutes, 1, 31 * 24 * 60, true); number(value.paidPeriodMinutes, 0, value.scheduledMonthMinutes, true);
  number(value.kpiTargetMinutes, 0, value.scheduledMonthMinutes, true);
  for (const key of ['overtimeVnd', 'employeeInsuranceVnd', 'incomeTaxVnd', 'otherLawfulDeductionsVnd']) number(value[key], 0, Number.MAX_SAFE_INTEGER, true);
  for (const key of ['seriousViolationConfirmed', 'includeMonthlyBonus']) if (typeof value[key] !== 'boolean') fail('VALIDATION_FAILED', 'Explicit assessment flags required');
  if (!Array.isArray(value.advanceRepayments) || value.advanceRepayments.length > 12 || new Set(value.advanceRepayments.map(row => row?.advanceId)).size !== value.advanceRepayments.length)
    fail('VALIDATION_FAILED', 'Unique agreed advance installments required');
  for (const row of value.advanceRepayments) { exact(row, ['advanceId', 'amountVnd', 'agreementReference'], ['advanceId', 'amountVnd', 'agreementReference']); id(row.advanceId); number(row.amountVnd, 1, Number.MAX_SAFE_INTEGER, true); text(row.agreementReference, 160); }
  return { ...value, periodStart, periodEnd, dueAt, assessmentReference: text(value.assessmentReference, 160), deductionConsentReference: text(value.deductionConsentReference, 160) };
}
