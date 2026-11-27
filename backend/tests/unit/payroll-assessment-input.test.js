import { describe, expect, test } from '@jest/globals';
import { payrollAssessmentInput } from '../../src/validators/payroll.validator.js';

const id = 'a'.repeat(24);
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const body = (over = {}) => ({
  employeeId: id, periodStart: '2026-11-01T00:00:00+07:00', periodEnd: '2026-11-30T00:00:00+07:00', dueAt: '2026-11-30T00:00:00+07:00',
  scheduledMonthMinutes: 9600, paidPeriodMinutes: 9000, kpiTargetMinutes: 8000, seriousViolationConfirmed: false,
  overtimeVnd: 100000, employeeInsuranceVnd: 500000, incomeTaxVnd: 100000, otherLawfulDeductionsVnd: 0,
  assessmentReference: 'ASSESS-001', deductionConsentReference: 'CONSENT-001', includeMonthlyBonus: true,
  advanceRepayments: [{ advanceId: 'b'.repeat(24), amountVnd: 100000, agreementReference: 'ADV-AGREE-001' }], ...over
});

describe('SAL-IN-04 payrollAssessmentInput', () => {
  test('accepts a complete explicit assessment and parses timezone-aware timestamps', () => {
    const result = payrollAssessmentInput(body());
    expect(result).toMatchObject({ employeeId: id, scheduledMonthMinutes: 9600, incomeTaxVnd: 100000, includeMonthlyBonus: true });
    expect(result.periodStart).toEqual(new Date('2026-11-01T00:00:00+07:00'));
  });
  test('accepts lower minute and monetary boundaries', () => {
    expect(payrollAssessmentInput(body({ paidPeriodMinutes: 0, kpiTargetMinutes: 0, overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, advanceRepayments: [] }))).toMatchObject({ paidPeriodMinutes: 0, kpiTargetMinutes: 0 });
  });
  test('accepts at most twelve unique advance installments', () => {
    const advanceRepayments = Array.from({ length: 12 }, (_, index) => ({ advanceId: index.toString(16).padStart(24, '0'), amountVnd: 1, agreementReference: `A-${index}` }));
    expect(payrollAssessmentInput(body({ advanceRepayments })).advanceRepayments).toHaveLength(12);
  });
  test.each([{}, { employeeId: id, periodStart: null }])('rejects missing required assessment fields %p', (input) => {
    expect(code(() => payrollAssessmentInput(input))).toBe('VALIDATION_FAILED');
  });
  test.each(['bad', '2026-11-01', '2026-02-30T00:00:00+07:00'])('rejects invalid period timestamps %p', (periodStart) => {
    expect(code(() => payrollAssessmentInput(body({ periodStart })))).toBe('VALIDATION_FAILED');
  });
  test.each([
    { periodEnd: '2026-11-01T00:00:00+07:00' },
    { dueAt: '2026-11-29T23:59:59+07:00' },
    { periodEnd: '2026-12-03T00:00:01+07:00' }
  ])('rejects invalid period ordering or duration %p', (input) => {
    expect(code(() => payrollAssessmentInput(body(input)))).toBe('VALIDATION_FAILED');
  });
  test.each([{ scheduledMonthMinutes: 0 }, { scheduledMonthMinutes: 44641 }, { paidPeriodMinutes: 9601 }, { kpiTargetMinutes: 9601 }, { scheduledMonthMinutes: 1.5 }])('rejects invalid work-minute bounds %p', (input) => {
    expect(code(() => payrollAssessmentInput(body(input)))).toBe('VALIDATION_FAILED');
  });
  test.each([{ overtimeVnd: -1 }, { employeeInsuranceVnd: 1.5 }, { incomeTaxVnd: '1' }, { otherLawfulDeductionsVnd: Number.MAX_SAFE_INTEGER + 1 }])('rejects non-integer VND values %p', (input) => {
    expect(code(() => payrollAssessmentInput(body(input)))).toBe('VALIDATION_FAILED');
  });
  test.each([{ seriousViolationConfirmed: null }, { includeMonthlyBonus: 'true' }])('requires explicit Boolean flags %p', (input) => {
    expect(code(() => payrollAssessmentInput(body(input)))).toBe('VALIDATION_FAILED');
  });
  test('rejects non-array, excessive and duplicate advance installments', () => {
    expect(code(() => payrollAssessmentInput(body({ advanceRepayments: null })))).toBe('VALIDATION_FAILED');
    expect(code(() => payrollAssessmentInput(body({ advanceRepayments: Array.from({ length: 13 }, () => ({ advanceId: id, amountVnd: 1, agreementReference: 'A' })) })))).toBe('VALIDATION_FAILED');
    expect(code(() => payrollAssessmentInput(body({ advanceRepayments: [{ advanceId: id, amountVnd: 1, agreementReference: 'A' }, { advanceId: id, amountVnd: 1, agreementReference: 'B' }] })))).toBe('VALIDATION_FAILED');
  });
  test('rejects an invalid advance installment', () => {
    expect(code(() => payrollAssessmentInput(body({ advanceRepayments: [{ advanceId: 'bad', amountVnd: 0, agreementReference: '' }] })))).toBe('VALIDATION_FAILED');
  });
  test('rejects invalid references and unexpected fields', () => {
    expect(code(() => payrollAssessmentInput(body({ assessmentReference: ' ', deductionConsentReference: 'x'.repeat(161) })))).toBe('VALIDATION_FAILED');
    expect(code(() => payrollAssessmentInput(body({ grossVnd: 1 })))).toBe('VALIDATION_FAILED');
  });
});
