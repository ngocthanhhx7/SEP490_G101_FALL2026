import { test, expect, jest } from '@jest/globals';
import { createPayrollAdjustmentService } from '../../../src/services/payroll/payroll-adjustment.service.js';
import { AppError } from '../../../src/utils/app-error.js';

const ADMIN = { userId: '111111111111111111111111', roles: ['ADMIN'], state: 'ACTIVE' };
const STAFF = { userId: '222222222222222222222222', roles: ['STAFF'], state: 'ACTIVE' };
const EMPLOYEE = '333333333333333333333333';
const ORIGINAL = '444444444444444444444444';
const ADJUSTMENT = '555555555555555555555555';
const NOW = new Date('2026-11-13T03:00:00.000Z');
const KEY = 'synthetic-adjustment-01';

function fixture({ denied = false } = {}) {
  let committed = { original: { _id: ORIGINAL, employeeId: EMPLOYEE, status: 'PAID', version: 2,
    periodStart: new Date('2026-09-30T17:00:00Z'), periodEnd: new Date('2026-10-31T17:00:00Z'),
    breakdown: { payableVnd: 10000000 }, paidAt: new Date('2026-11-02T03:00:00Z') },
    adjustments: [], events: [] };
  function query(read) {
    let tx;
    const result = { session: value => { tx = value; return result; },
      lean: async () => globalThis.structuredClone(read(tx?.state ?? committed)),
      then: (resolve, reject) => result.lean().then(resolve, reject) };
    return result;
  }
  const models = {
    PayrollStatement: { findById: id => query(s => s.original._id === id ? s.original : null) },
    PayrollAdjustment: {
      exists: filter => query(s => s.adjustments.some(row => row.statementId === filter.statementId
        && row.assessmentReference === filter.assessmentReference)),
      findById: id => query(s => s.adjustments.find(row => row._id === id) ?? null),
      create: jest.fn(async (rows, { session }) => {
        const saved = rows.map(row => ({ _id: ADJUSTMENT, ...row }));
        session.state.adjustments.push(...globalThis.structuredClone(saved)); return saved;
      }),
      findOneAndUpdate: jest.fn((filter, patch, { session }) => query(() => {
        const row = session.state.adjustments.find(value => value._id === filter._id && value.version === filter.version);
        if (!row) return null;
        Object.assign(row, patch.$set); row.version += patch.$inc.version;
        return row;
      }))
    }
  };
  // Port quyền quyết định ở payroll service; file này chỉ kiểm tra cách target dùng port.
  const role = jest.fn(() => {
    if (denied) throw new AppError(403, 'FORBIDDEN', 'Action not permitted');
  });
  const employeeGuard = jest.fn(async () => undefined);
  const command = jest.fn(async (actor, operation, key, input, work) => {
    void actor; void operation; void key; void input;
    const session = { state: globalThis.structuredClone(committed) };
    const result = await work(session); committed = session.state; return result;
  });
  const event = jest.fn(async (actor, employeeId, resourceId, type, reason, session) => {
    session.state.events.push({ actorId: actor.userId, employeeId, resourceId, type, reason });
  });
  // Giữ các dependency bắt buộc đầy đủ; không có bank transfer hoặc deduction thật.
  const claimTransfer = jest.fn(async () => undefined);
  const target = createPayrollAdjustmentService({ models, role, command, employeeGuard, event,
    claimTransfer, now: () => NOW }).submitAdjustment;
  return { submitAdjustment: target, models, role, command, event, claimTransfer, state: () => committed };
}

function input() {
  return { statementId: ORIGINAL, expectedVersion: 2, direction: 'SUPPLEMENT', amountVnd: 200000,
    reason: 'Bảng kê tháng trước thiếu khoản đã được đối chiếu', assessmentReference: 'synthetic-assessment-01' };
}

// SRS: UC-76 Alternative 6.1 / Postconditions; GBR-44; Normal 3–4.
test("SAL-ADJ-01-UTCID01 [N] Lưu khoản thiếu thành điều chỉnh riêng và giữ bảng kê đã trả", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  const actual = await f.submitAdjustment(ADMIN, input(), KEY);
  expect(actual).toMatchObject({ employeeId: EMPLOYEE, statementId: ORIGINAL,
    amountVnd: 200000, direction: 'SUPPLEMENT', status: 'SUBMITTED' });
  expect(f.state().adjustments[0]).toMatchObject({ reason: input().reason,
    assessmentReference: input().assessmentReference, statementVersion: 2 });
  expect(f.state().original).toEqual(before);
  expect(f.state().events[0]).toMatchObject({ type: 'ADJUSTMENT_SUBMITTED', reason: input().reason });
  expect(f.role).toHaveBeenCalledWith(ADMIN, 'ADMIN');
  expect(f.claimTransfer).not.toHaveBeenCalled();
});

// SRS: UC-76 Alternative 6.1 / Postconditions; GBR-44.
test("SAL-ADJ-01-UTCID02 [N] Lưu sai số trả thừa riêng và không tự trừ bảng kê đã trả", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  const value = { ...input(), direction: 'RECOVERY', reason: 'Kỳ đã trả ghi thừa 200000 sau đối chiếu' };
  const actual = await f.submitAdjustment(ADMIN, value, KEY);
  expect(actual).toMatchObject({ direction: 'RECOVERY', amountVnd: 200000, status: 'SUBMITTED' });
  expect(f.state().original).toEqual(before);
  expect(f.state().events[0].reason).toBe(value.reason);
  expect(f.claimTransfer).not.toHaveBeenCalled();
});

// SRS: UC-76 Normal 3–4; GBR-44: sửa sai có lý do và history.
test("SAL-ADJ-01-UTCID03 [A] Không lưu điều chỉnh thiếu lý do", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  await expect(f.submitAdjustment(ADMIN, { ...input(), reason: '' }, KEY))
    .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.models.PayrollAdjustment.create).not.toHaveBeenCalled();
  expect(f.state().original).toEqual(before);
  expect(f.state().events).toHaveLength(0);
});

// SRS: UC-76 Primary Actor Admin; I.4.4; GBR-02.
test("SAL-ADJ-01-UTCID04 [A] Dừng trước khi ghi khi port quyền từ chối thao tác Staff", async () => {
  const f = fixture({ denied: true });
  await expect(f.submitAdjustment(STAFF, input(), KEY)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.role).toHaveBeenCalledWith(STAFF, 'ADMIN');
  expect(f.command).not.toHaveBeenCalled();
  expect(f.models.PayrollAdjustment.create).not.toHaveBeenCalled();
});
