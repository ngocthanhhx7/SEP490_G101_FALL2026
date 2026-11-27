import { test, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/models/payroll.model.js', () => ({ payrollModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/user.model.js', () => ({ userModel: () => ({}) }));
jest.unstable_mockModule('../../../src/models/sitter-application.model.js', () => ({
  sitterApplicationModels: () => ({ SitterStatus: {}, SitterApplication: {} })
}));
jest.unstable_mockModule('../../../src/services/payroll/payroll-draft.service.js', () => ({
  createPayrollDraftService: ({ connection }) => ({ preview: connection.preview })
}));
jest.unstable_mockModule('../../../src/services/payroll/commission-source.service.js', () => ({
  createCommissionSources: () => ({})
}));
jest.unstable_mockModule('../../../src/services/notifications/domain-notifications.service.js', () => ({
  createDomainNotifications: () => ({})
}));
const { createPayrollService } = await import('../../../src/services/payroll/payroll.service.js');
const ADMIN = { userId: '111111111111111111111111', state: 'ACTIVE', roles: ['ADMIN'] };
const OTHER = { userId: '222222222222222222222222', state: 'ACTIVE', roles: ['STAFF'] };
const EMPLOYEE = '333333333333333333333333';
const STATEMENT = '444444444444444444444444';
const KEY = 'synthetic-payroll-001';

function sourceInput({ weekly = false } = {}) {
  return { employeeId: EMPLOYEE, periodStart: weekly ? '2026-11-02' : '2026-10-01',
    periodEnd: weekly ? '2026-11-09' : '2026-11-01', dueAt: weekly ? '2026-11-10' : '2026-11-02',
    unpaidMinutes: 0, attendanceReference: 'synthetic-attendance', attendanceConfirmed: true,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    statutoryReference: 'synthetic-statutory', statutoryConfirmed: true,
    deductionConsentReference: 'synthetic-consent' };
}
function assessment({ weekly = false } = {}) {
  const value = sourceInput({ weekly });
  return { employeeId: EMPLOYEE, periodStart: value.periodStart + 'T00:00:00+07:00',
    periodEnd: value.periodEnd + 'T00:00:00+07:00', dueAt: value.dueAt + 'T00:00:00+07:00',
    scheduledMonthMinutes: 9600, paidPeriodMinutes: weekly ? 2400 : 9600,
    kpiTargetMinutes: 0, seriousViolationConfirmed: false, includeMonthlyBonus: false,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-attendance | synthetic-statutory',
    deductionConsentReference: 'synthetic-consent', advanceRepayments: [] };
}
function fixture({ previewAssessment = assessment() } = {}) {
  const preview = jest.fn(async () => ({ sourceHash: 'synthetic-reviewed-hash', assessment: previewAssessment }));
  const connection = { preview, models: { PayrollCommand: { findById: () => ({ lean: async () => null }) } } };
  const service = createPayrollService({ connection, clock: () => new Date('2026-11-13T03:00:00Z') });
  return { service, preview };
}

// SRS: UC-75 Normal 1; GBR-44: lập bảng kê tháng full-time.
test("PAYROLL-02-UTCID01 [N] Chuyển nguồn bảng kê tháng đã kiểm tra sang lệnh lập", async () => {
  const checked = assessment();
  const f = fixture({ previewAssessment: checked });
  // Dependency gọi this.prepareStatement là spy; không chạy một target method khác trong file này.
  const save = jest.fn(async () => ({ id: STATEMENT, payCycle: 'MONTHLY', status: 'PREPARED' }));
  const context = { prepareStatement: save };
  const request = { input: sourceInput(), sourceHash: 'synthetic-reviewed-hash' };
  const actual = await f.service.prepareAutomaticStatement.call(context, ADMIN, request, KEY);
  expect(f.preview).toHaveBeenCalledWith(ADMIN, request.input);
  expect(save).toHaveBeenCalledWith(ADMIN, checked, KEY, { input: request.input, sourceHash: request.sourceHash });
  expect(actual).toEqual({ id: STATEMENT, payCycle: 'MONTHLY', status: 'PREPARED' });
});

// UC-21/GBR-31/44: hợp đồng tuần cần đối chiếu trước khi lập phiếu mới.
test('PAYROLL-02-UTCID02 does not save when draft validation rejects a legacy WEEKLY contract', async () => {
  const f = fixture();
  const error = { code: 'PAYROLL_CONTRACT_CYCLE_REVIEW_REQUIRED', status: 409 };
  f.preview.mockRejectedValueOnce(error);
  const save = jest.fn();
  const request = { input: sourceInput({ weekly: true }), sourceHash: 'synthetic-reviewed-hash' };
  await expect(f.service.prepareAutomaticStatement.call({ prepareStatement: save }, ADMIN, request, KEY)).rejects.toMatchObject(error);
  expect(save).not.toHaveBeenCalled();
});

// SRS: I.4.4 Permission Matrix; GBR-02; UC-76 Primary Actor Admin.
test("PAYROLL-02-UTCID03 [A] Staff không được gọi lệnh lập tự động của quản trị", async () => {
  const f = fixture();
  const save = jest.fn();
  await expect(f.service.prepareAutomaticStatement.call({ prepareStatement: save }, OTHER,
    { input: {}, sourceHash: 'synthetic-reviewed-hash' }, KEY)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.preview).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
