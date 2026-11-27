import { test, expect, jest } from '@jest/globals';

// Chỉ thay dependency tại ranh giới service; validator và salary calculator chạy thật.
jest.unstable_mockModule('../../../src/models/payroll.model.js', () => ({ payrollModels: c => c.models }));
jest.unstable_mockModule('../../../src/models/user.model.js', () => ({ userModel: c => c.user }));
jest.unstable_mockModule('../../../src/models/sitter-application.model.js', () => ({
  sitterApplicationModels: () => ({ SitterStatus: {}, SitterApplication: {} })
}));
jest.unstable_mockModule('../../../src/services/payroll/payroll-storage.service.js', () => ({
  assertPayrollStorage: async () => undefined
}));
jest.unstable_mockModule('../../../src/services/payroll/payroll-draft.service.js', () => ({
  createPayrollDraftService: ({ connection }) => ({ preview: connection.preview })
}));
jest.unstable_mockModule('../../../src/services/payroll/commission-source.service.js', () => ({
  createCommissionSources: () => ({ payable: async () => ({ payable: [], held: [] }),
    assertPayableCreditIds: async () => undefined })
}));
jest.unstable_mockModule('../../../src/services/notifications/domain-notifications.service.js', () => ({
  createDomainNotifications: ({ connection }) => ({ payroll: connection.notify })
}));
const { createPayrollService } = await import('../../../src/services/payroll/payroll.service.js');

const ADMIN = { userId: '111111111111111111111111', state: 'ACTIVE', roles: ['ADMIN'] };
const OTHER = { userId: '222222222222222222222222', state: 'ACTIVE', roles: ['STAFF'] };
const EMPLOYEE = '333333333333333333333333';
const STATEMENT = '444444444444444444444444';
const NOW = new Date('2026-11-13T03:00:00Z');
const KEY = 'synthetic-payroll-001';

function assessment({ partial = false, crossMonth = false, future = false } = {}) {
  return { employeeId: EMPLOYEE,
    periodStart: crossMonth ? '2026-10-26T00:00:00+07:00'
      : partial ? '2026-11-02T00:00:00+07:00' : '2026-10-01T00:00:00+07:00',
    periodEnd: future ? '2026-12-01T00:00:00+07:00' : crossMonth ? '2026-11-02T00:00:00+07:00'
      : partial ? '2026-11-09T00:00:00+07:00' : '2026-11-01T00:00:00+07:00',
    dueAt: future ? '2026-12-02T00:00:00+07:00' : crossMonth ? '2026-11-03T00:00:00+07:00'
      : partial ? '2026-11-30T00:00:00+07:00' : '2026-11-02T00:00:00+07:00',
    scheduledMonthMinutes: 9600, paidPeriodMinutes: partial || crossMonth ? 2400 : 9600,
    kpiTargetMinutes: 0, seriousViolationConfirmed: false, includeMonthlyBonus: false,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-assessment', deductionConsentReference: 'synthetic-consent',
    advanceRepayments: [] };
}

function fixture({ employmentType = 'FULL_TIME', payCycle = 'MONTHLY', seedStatus, previewAssessment = assessment() } = {}) {
  let committed = { statements: [], events: [], commands: new Map(), claims: new Map(), guards: new Map() };
  if (seedStatus) committed.statements.push({ _id: STATEMENT, employeeId: EMPLOYEE,
    periodStart: new Date('2026-09-30T17:00:00Z'), periodEnd: new Date('2026-10-31T17:00:00Z'),
    dueAt: new Date('2026-11-02T03:00:00Z'), monthKey: '2026-10', status: seedStatus, version: 0,
    payCycle: 'MONTHLY', breakdown: { commissionVnd: 0, baseVnd: 10000000, payableVnd: 10000000 },
    assessment: { scheduledMonthMinutes: 9600, paidPeriodMinutes: 9600 }, creditIds: [], heldCreditIds: [] });
  function query(read) {
    let session;
    const q = { session: value => { session = value; return q; }, sort: () => q,
      select: () => q, limit: () => q,
      lean: async () => globalThis.structuredClone(read(session?.state ?? committed)),
      then: (resolve, reject) => q.lean().then(resolve, reject) };
    return q;
  }
  function match(row, filter) {
    return Object.entries(filter).every(([field, value]) => {
      if (value && typeof value === 'object' && '$ne' in value) return row[field] !== value.$ne;
      return String(row[field]) === String(value);
    });
  }
  const contract = { _id: '555555555555555555555555', employeeId: EMPLOYEE, version: 1,
    employmentType, salaryBasis: 'GROSS',
    monthlyBaseVnd: employmentType === 'PART_TIME' ? 3000000 : 10000000, payCycle,
    effectiveAt: new Date('2026-01-01T00:00:00Z'), monthlyAllowanceVnd: 0 };
  // Constructor chỉ cấp ID, các writes/query đều tác động state của transaction double.
  class StatementModel { constructor() { this._id = STATEMENT; } }
  StatementModel.find = filter => query(s => s.statements.filter(row => match(row, filter)));
  StatementModel.findById = id => query(s => s.statements.find(row => row._id === id) ?? null);
  StatementModel.create = jest.fn(async (rows, { session }) => {
    session.state.statements.push(...globalThis.structuredClone(rows)); return rows;
  });
  StatementModel.findOneAndUpdate = (filter, patch, { session }) => query(() => {
    const row = session.state.statements.find(value => match(value, filter));
    if (!row) return null;
    Object.assign(row, patch.$set); row.version += patch.$inc?.version ?? 0;
    return row;
  });
  const claims = { exists: filter => query(s => s.claims.has(filter._id)),
    create: async (rows, { session }) => { for (const row of rows) session.state.claims.set(row._id, row); },
    deleteMany: async (filter, { session }) => {
      for (const [key, row] of session.state.claims) if (row.statementId === filter.statementId) session.state.claims.delete(key);
    } };
  const commands = { findById: id => query(s => s.commands.get(id) ?? null),
    create: async (rows, { session }) => { for (const row of rows) session.state.commands.set(row._id, row); } };
  const models = { PayrollStatement: StatementModel, PayrollSourceClaim: claims, PayrollCommand: commands,
    EmploymentContract: {
      findOne: filter => query(() => filter.employeeId === EMPLOYEE ? contract : null),
      exists: () => query(() => false) // Fixture không có đổi hợp đồng trong kỳ.
    },
    PayrollMonthGuard: { findOneAndUpdate: (filter, patch, { session }) => query(() => {
      const value = session.state.guards.get(filter._id) ?? { version: 0 };
      value.version += patch.$inc.version; session.state.guards.set(filter._id, value); return value;
    }) },
    PayrollServiceCredit: { find: () => query(() => []) },
    SalaryAdvance: { findOne: () => query(() => null) },
    PayrollEvent: { create: async (rows, { session }) => {
      const saved = rows.map((row, index) => ({ _id: `synthetic-event-${session.state.events.length + index}`, ...row }));
      session.state.events.push(...saved); return saved;
    } }
  };
  const notify = jest.fn(async () => undefined);
  const preview = jest.fn(async () => ({ sourceHash: 'synthetic-reviewed-hash', assessment: previewAssessment }));
  const connection = { models, notify, preview,
    user: { findById: () => query(() => ({ _id: EMPLOYEE, displayName: 'Nhân viên tổng hợp' })) },
    transaction: async callback => {
      const session = { state: globalThis.structuredClone(committed) };
      const result = await callback(session); committed = session.state; return result;
    } };
  // Policy chỉ mở gate hiện tại. Không dùng 50%/KPI/hoa hồng làm case SRS.
  const policy = { resolve: async () => ({ ready: true, version: 'synthetic-gate', salaryBasis: 'GROSS', advanceCapBps: 5000 }) };
  const service = createPayrollService({ connection, policy, clock: () => NOW });
  return { service, state: () => committed, models, notify, preview };
}

// SRS: UC-75 Preconditions / Normal 1–2; GBR-31/44.
test("PAYROLL-01-UTCID01 [N] Lập bảng kê tháng full-time sau khi kỳ kết thúc", async () => {
  const f = fixture();
  const actual = await f.service.prepareStatement(ADMIN, assessment(), KEY);
  expect(actual).toMatchObject({ employeeId: EMPLOYEE, payCycle: 'MONTHLY', status: 'PREPARED',
    breakdown: { baseVnd: 10000000, payableVnd: 10000000 } });
  expect(f.state().statements).toHaveLength(1);
  expect(f.state().statements[0].paidAt).toBeUndefined();
  expect(f.state().events[0].type).toBe('STATEMENT_PREPARED');
  expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ employeeId: EMPLOYEE, type: 'STATEMENT_PREPARED' }), expect.anything());
});

// SRS: UC-75 Preconditions / Normal 1; GBR-44.
test.each([['FULL_TIME', 2500000], ['PART_TIME', 750000]])(
  'PAYROLL-01-UTCID02 prorates MONTHLY payroll for %s with a partial month', async (employmentType, baseVnd) => {
  const f = fixture({ employmentType });
  const actual = await f.service.prepareStatement(ADMIN, assessment({ partial: true }), KEY);
  expect(actual).toMatchObject({ payCycle: 'MONTHLY', breakdown: { baseVnd } });
  expect(actual.periodStart.toISOString()).toBe('2026-11-01T17:00:00.000Z');
  expect(actual.periodEnd.toISOString()).toBe('2026-11-08T17:00:00.000Z');
  expect(f.state().statements).toHaveLength(1);
});

test.each(['FULL_TIME', 'PART_TIME'])('%s legacy WEEKLY contract cannot create a statement', async (employmentType) => {
  const f = fixture({ employmentType, payCycle: 'WEEKLY' });
  const input = { ...assessment({ partial: true }), dueAt: '2026-11-10T00:00:00+07:00' };
  await expect(f.service.prepareStatement(ADMIN, input, KEY))
    .rejects.toMatchObject({ code: 'PAYROLL_CONTRACT_CYCLE_REVIEW_REQUIRED', status: 409 });
  expect(f.models.PayrollStatement.create).not.toHaveBeenCalled();
  expect(f.state().statements).toEqual([]);
  expect(f.state().commands.size).toBe(0);
  expect(f.state().guards.size).toBe(0);
});

// SRS: Report 3 23/11; UC-75/76; GBR-31/44: kỳ đánh giá không vắt qua ranh giới hai tháng.
test("PAYROLL-01-UTCID03 [A] Từ chối kỳ đánh giá vắt qua ranh giới hai tháng", async () => {
  const f = fixture({ employmentType: 'PART_TIME' });
  await expect(f.service.prepareStatement(ADMIN, assessment({ crossMonth: true }), KEY)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.models.PayrollStatement.create).not.toHaveBeenCalled();
});

// SRS: UC-75 Preconditions; GBR-44: lập khi cuối kỳ.
test("PAYROLL-01-UTCID04 [A] Không lập bảng kê khi kỳ làm việc chưa kết thúc", async () => {
  const f = fixture();
  const value = assessment();
  value.periodStart = '2026-11-01T00:00:00+07:00';
  value.periodEnd = '2026-12-01T00:00:00+07:00';
  value.dueAt = '2026-12-02T00:00:00+07:00';
  await expect(f.service.prepareStatement(ADMIN, value, KEY)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.models.PayrollStatement.create).not.toHaveBeenCalled();
});

// SRS: I.4.4 Permission Matrix; GBR-02; UC-76 Primary Actor Admin.
test("PAYROLL-01-UTCID05 [A] Staff không được dùng lệnh lập bảng kê quản trị", async () => {
  const f = fixture();
  await expect(f.service.prepareStatement(OTHER, assessment(), KEY)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.models.PayrollStatement.create).not.toHaveBeenCalled();
});
