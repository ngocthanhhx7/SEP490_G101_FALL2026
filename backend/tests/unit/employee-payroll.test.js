import { test, expect } from '@jest/globals';
import { calculateEmployeePayroll } from '../../src/services/payroll/payroll-calculation.service.js';
import { payrollMonth } from '../../src/services/payroll/payroll.service.js';
const input = () => ({ contract: { version: 1, employmentType: 'FULL_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 10000000 },
  scheduledMinutes: 9600, paidMinutes: 9600, serviceNetVnd: 20000000, employeeInsuranceVnd: 1050000, incomeTaxVnd: 0,
  kpi: { targetMinutes: 6000, completedMinutes: 6000, onTimeBps: 9500, reportBps: 10000, seriousViolationConfirmed: false } });
test('gross payroll keeps base, 5% commission, KPI, statutory assessments and advances separate', () => {
  expect(calculateEmployeePayroll({ ...input(), paidAdvanceVnd: 5000000 })).toMatchObject({ baseVnd: 10000000, commissionVnd: 1000000,
    bonusVnd: 1000000, grossVnd: 12000000, netBeforeAdvanceVnd: 10950000, payableVnd: 5950000 });
});
test.each([[8999, 0], [9000, 500000], [9999, 500000], [10000, 1000000], [11000, 1500000]])('KPI %s bps earns %s VND', (completedMinutes, bonusVnd) => {
  const value = input(); value.scheduledMinutes = value.paidMinutes = 12000;
  value.kpi.targetMinutes = 10000; value.kpi.completedMinutes = completedMinutes;
  expect(calculateEmployeePayroll(value).bonusVnd).toBe(bonusVnd);
});
test('part-time and failed quality gates never remove base salary', () => {
  const value = input(); value.contract = { ...value.contract, employmentType: 'PART_TIME', monthlyBaseVnd: 3000000 };
  expect(calculateEmployeePayroll(value).bonusVnd).toBe(300000);
  value.kpi.seriousViolationConfirmed = true;
  expect(calculateEmployeePayroll(value)).toMatchObject({ baseVnd: 3000000, bonusVnd: 0 });
});
test('tax/insurance require explicit values; excessive advances require reconciliation', () => {
  expect(() => calculateEmployeePayroll({ ...input(), incomeTaxVnd: undefined })).toThrow();
  expect(() => calculateEmployeePayroll({ ...input(), paidAdvanceVnd: 99999999 })).toThrow();
});
test('advance month boundary uses Vietnam time', () => {
  expect(payrollMonth(new Date('2026-10-31T16:59:59Z'))).toBe('2026-10');
  expect(payrollMonth(new Date('2026-10-31T17:00:00Z'))).toBe('2026-11');
});
