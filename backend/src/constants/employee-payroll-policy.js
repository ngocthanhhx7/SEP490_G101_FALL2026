// Owner-approved demo compensation. Statutory tax/insurance are separately assessed.
export const employeePayrollPolicy = Object.freeze({
  version: 'PWC-EMPLOYEE-PAYROLL-2026-10-30-v1', ready: true, salaryBasis: 'GROSS',
  fullTimeMonthlyBaseVnd: 10000000, partTimeMonthlyBaseVnd: 3000000,
  partTimeWeeklyMinutes: 1200, commissionBps: 500, advanceCapBps: 5000,
  kpiThresholdBps: [9000, 10000, 11000], fullTimeBonusVnd: [500000, 1000000, 1500000],
  partTimeBonusVnd: [150000, 300000, 450000], minimumOnTimeBps: 9500,
  minimumReportBps: 10000, advancesPerMonth: 1, interestBps: 0
});
export const employeePayrollPolicyResolver = Object.freeze({ resolve: async () => employeePayrollPolicy });
