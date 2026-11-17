import { test, expect } from '@jest/globals';
import { calculateEmployeePayroll } from '../../../src/services/payroll/payroll-calculation.service.js';

function input() {
  return { contract: { version: 1, employmentType: 'FULL_TIME', salaryBasis: 'GROSS',
    monthlyBaseVnd: 10000000, monthlyAllowanceVnd: 0 },
    scheduledMinutes: 9600, paidMinutes: 9600, serviceNetVnd: 0,
    employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0, paidAdvanceVnd: 0,
    kpi: { targetMinutes: 0, completedMinutes: 0, onTimeBps: 0, reportBps: 0, seriousViolationConfirmed: false } };
}

// SRS: GBR-31: lương tháng full-time không phụ thuộc số lượt; UC-75 Normal 1.
test("SAL-CALC-01-UTCID01 [N] Full-time nhận lương hợp đồng dù không có lượt chăm sóc", async () => {
  const actual = calculateEmployeePayroll(input());
  expect(actual).toMatchObject({ currency: 'VND', baseVnd: 10000000, payableVnd: 10000000 });
});

// SRS: GBR-31: lương tháng full-time không phụ thuộc số lượt.
test("SAL-CALC-01-UTCID02 [N] Phần lương tháng full-time giữ nguyên khi có công việc trong kỳ", async () => {
  const value = input();
  value.serviceNetVnd = 2000000;
  const actual = calculateEmployeePayroll(value);
  // Chỉ kiểm chứng phần contract base; không gán Passed cho hoa hồng legacy 5%.
  expect(actual.baseVnd).toBe(10000000);
});

// SRS: GBR-31: part-time nhận tiền từng lượt hoàn thành; UC-75 Normal 1.
// DEF_SAL_PARTTIME_01: chạy bình thường, giữ kỳ vọng SRS.
test("SAL-CALC-01-UTCID03 [N] Part-time không có lượt hưởng tiền thì không sinh tiền lượt", async () => {
  const value = input();
  value.contract.employmentType = 'PART_TIME';
  value.contract.monthlyBaseVnd = 3000000;
  // paidMinutes là giờ công legacy, không chứng minh có lượt chăm sóc đã hoàn thành.
  const actual = calculateEmployeePayroll(value);
  expect(actual.payableVnd).toBe(0);
});
