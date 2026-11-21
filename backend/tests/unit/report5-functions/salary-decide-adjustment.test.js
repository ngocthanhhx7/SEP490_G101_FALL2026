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

function fixture({ denied = false, direction = 'SUPPLEMENT' } = {}) {
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
    claimTransfer, now: () => NOW }).decideAdjustment;
  committed.adjustments.push({ _id: ADJUSTMENT, employeeId: EMPLOYEE, statementId: ORIGINAL,
    statementVersion: 2, direction, amountVnd: 200000,
    reason: 'Đối chiếu sai số của kỳ đã trả', assessmentReference: 'synthetic-assessment-01',
    status: 'SUBMITTED', version: 0, requestedAt: NOW });
  return { decideAdjustment: target, models, role, command, event, claimTransfer, state: () => committed };
}

function input() {
  return { expectedVersion: 0, action: 'APPROVE', reason: 'Admin đã đối chiếu và xác nhận sai số' };
}

// SRS: UC-76 Normal 3–4 / Alternative 6.1 / Postconditions; GBR-44.
test("SAL-ADJ-02-UTCID01 [N] Admin xác nhận điều chỉnh có lý do mà không sửa bảng kê đã trả", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  const actual = await f.decideAdjustment(ADMIN, ADJUSTMENT, input(), KEY);
  expect(actual).toMatchObject({ status: 'APPROVED', amountVnd: 200000, decisionReason: input().reason });
  expect(f.state().original).toEqual(before);
  expect(f.state().events[0]).toMatchObject({ type: 'ADJUSTMENT_APPROVE', reason: input().reason });
  expect(f.role).toHaveBeenCalledWith(ADMIN, 'ADMIN');
  expect(f.claimTransfer).not.toHaveBeenCalled();
});

// SRS: UC-76 Normal 3–4; GBR-44: sửa hoặc giải thích, giữ history.
test("SAL-ADJ-02-UTCID02 [N] Admin giải thích không chấp nhận điều chỉnh và giữ số tiền đã trả", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  const value = { ...input(), action: 'REJECT', reason: 'Đã kiểm tra, số tiền kỳ trước là đúng' };
  const actual = await f.decideAdjustment(ADMIN, ADJUSTMENT, value, KEY);
  expect(actual).toMatchObject({ status: 'REJECTED', decisionReason: value.reason });
  expect(f.state().original).toEqual(before);
  expect(f.state().events[0]).toMatchObject({ type: 'ADJUSTMENT_REJECT', reason: value.reason });
  expect(f.claimTransfer).not.toHaveBeenCalled();
});

// SRS: UC-76 Normal 3–4; GBR-44: lý do và history khi sửa sai.
test("SAL-ADJ-02-UTCID03 [A] Không xác nhận điều chỉnh khi thiếu lý do", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.state().original);
  await expect(f.decideAdjustment(ADMIN, ADJUSTMENT, { ...input(), reason: '' }, KEY))
    .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.models.PayrollAdjustment.findOneAndUpdate).not.toHaveBeenCalled();
  expect(f.state().adjustments[0].status).toBe('SUBMITTED');
  expect(f.state().original).toEqual(before);
  expect(f.state().events).toHaveLength(0);
});

// SRS: UC-76 Primary Actor Admin; I.4.4; GBR-02.
test("SAL-ADJ-02-UTCID04 [A] Dừng quyết định khi port quyền từ chối Staff", async () => {
  const f = fixture({ denied: true });
  await expect(f.decideAdjustment(STAFF, ADJUSTMENT, input(), KEY))
    .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.role).toHaveBeenCalledWith(STAFF, 'ADMIN');
  expect(f.command).not.toHaveBeenCalled();
  expect(f.models.PayrollAdjustment.findOneAndUpdate).not.toHaveBeenCalled();
});
