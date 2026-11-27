// Một file chỉ gọi withdraw; helper dựng port/store tổng hợp.
import { test, expect, jest } from '@jest/globals';
import { createVisitWithdrawalService } from '../../../src/services/visit-withdrawal.service.js';

const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const HOUR = 3600000;
const VISIT = 'visit-srs-01';
const SITTER = 'sitter-srs-01';
function fixture(leadMs = 24 * HOUR) {
  const store = { now: NOW,
    visit: { id: VISIT, sitterId: SITTER, state: 'ASSIGNED', version: 2, checkInAt: null,
      startAt: new Date(NOW + leadMs).toISOString(), endAt: new Date(NOW + leadMs + HOUR).toISOString() },
    assignment: { sitterId: SITTER, state: 'ASSIGNED', version: 2 }, writes: 0, events: [], reasons: [] };
  const tx = {
    getVisit: jest.fn(async ({ visitId }) => visitId === store.visit.id ? globalThis.structuredClone(store.visit) : null),
    withdrawAssignment: jest.fn(async command => {
      if (store.visit.version !== command.expectedVersion) throw new Error('Fixture CAS rejected');
      // Port áp dụng yêu cầu rút assignment vào store tổng hợp, không phải DB thật.
      store.assignment.state = 'WITHDRAWN'; store.assignment.version += 1;
      store.visit.sitterId = null; store.visit.state = 'UNASSIGNED'; store.visit.version += 1;
      store.writes += 1; store.reasons.push(command.reason);
      return { state: 'WITHDRAWN', version: store.assignment.version };
    }),
    appendAuditAndOutbox: jest.fn(async event => { store.events.push(globalThis.structuredClone(event)); }),
  };
  const repository = { runVisitCommand: jest.fn(async command => command.execute(tx)) };
  const withdraw = createVisitWithdrawalService({ repository, clock: () => store.now }).withdraw;
  const input = { actor: { userId: SITTER, state: 'ACTIVE', roles: ['PET_SITTER'] },
    visitId: VISIT, expectedVersion: 2, idempotencyKey: 'srs-withdraw-command',
    reason: 'Không thể sắp xếp thời gian' }; // Nhãn tổng hợp; SRS chưa liệt kê enum lý do.
  return { store, tx, repository, withdraw, input };
}
function expectNoWithdrawal(f) {
  expect(f.tx.withdrawAssignment).not.toHaveBeenCalled();
  expect(f.store.writes).toBe(0);
  expect(f.store.events).toEqual([]);
  expect(f.store.assignment.state).toBe('ASSIGNED');
}

// SRS: UC-82 Normal Flow bước 1–4 / Postconditions; GBR-21; III.11.1.3.
test("WITHDRAW-01-UTCID01 [N] Rút sớm khỏi lượt đã nhận với lý do", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.store.visit);

  const actual = await f.withdraw(f.input);

  expect(actual).toMatchObject({ visitId: VISIT, state: 'WITHDRAWN', needsReassignment: true });
  expect(f.store.assignment.state).toBe('WITHDRAWN');
  expect(f.store.visit).toMatchObject({ sitterId: null, state: 'UNASSIGNED', startAt: before.startAt, endAt: before.endAt });
  expect(f.store.reasons).toEqual([f.input.reason]);
  expect(f.store.events).toEqual([expect.objectContaining({ type: 'VisitAssignmentWithdrawn', actorId: SITTER,
    visitId: VISIT, reason: f.input.reason })]);
});

// SRS: GBR-21; UC-82 Normal Flow bước 2 — 12 hours or more.
test("WITHDRAW-01-UTCID02 [B] Còn hơn 12 giờ 1 mili giây được tự rút", async () => {
  const f = fixture(12 * HOUR + 1);

  await expect(f.withdraw(f.input)).resolves.toMatchObject({ state: 'WITHDRAWN', needsReassignment: true });
  expect(f.store.assignment.state).toBe('WITHDRAWN');
});

// SRS: GBR-21; UC-82 Normal Flow bước 2 — biên bao gồm 12 h.
test("WITHDRAW-01-UTCID03 [B] Đúng 12 giờ trước lượt vẫn được tự rút", async () => {
  const f = fixture(12 * HOUR);

  await expect(f.withdraw(f.input)).resolves.toMatchObject({ state: 'WITHDRAWN', needsReassignment: true });
  expect(f.store.assignment.state).toBe('WITHDRAWN');
});

// SRS: GBR-21; UC-82 Alternative 2.1; III.11.1.4 — sitter stays until Staff reassign/cancel.
// Defect: DEF_WITHDRAW_12H_01 — giữ expected theo SRS; không skip/failing.
test("WITHDRAW-01-UTCID04 [B] Còn thiếu 1 mili giây đến mốc 12 giờ phải qua Staff", async () => {
  const f = fixture(12 * HOUR - 1);
  let error = null;
  try {
    await f.withdraw(f.input);
  } catch (caught) {
    error = caught;
  }

  // Chỉ kiểm tra chặn tự rút. Việc lưu yêu cầu Needs action phải test ở luồng Staff.
  expect({ code: error?.code, route: error?.details?.route, assignmentState: f.store.assignment.state,
    sitterId: f.store.visit.sitterId, writes: f.store.writes, events: f.store.events.length }).toMatchObject({
    code: 'WITHDRAWAL_WINDOW_CLOSED', route: 'STAFF', assignmentState: 'ASSIGNED', sitterId: SITTER, writes: 0, events: 0,
  });
});

// SRS: GBR-21; UC-82 Alternative 2.1; III.11.1.4 — less than 12 h.
// Defect: DEF_WITHDRAW_12H_01 — giữ expected theo SRS; không skip/failing.
test("WITHDRAW-01-UTCID05 [A] Còn 6 giờ phải giữ phân công để Staff xử lý", async () => {
  const f = fixture(6 * HOUR);
  let error = null;
  try {
    await f.withdraw(f.input);
  } catch (caught) {
    error = caught;
  }

  // Chỉ kiểm tra chặn tự rút. Việc lưu yêu cầu Needs action phải test ở luồng Staff.
  expect({ code: error?.code, route: error?.details?.route, assignmentState: f.store.assignment.state,
    sitterId: f.store.visit.sitterId, writes: f.store.writes, events: f.store.events.length }).toMatchObject({
    code: 'WITHDRAWAL_WINDOW_CLOSED', route: 'STAFF', assignmentState: 'ASSIGNED', sitterId: SITTER, writes: 0, events: 0,
  });
});

// SRS: GBR-21; UC-82 Alternative 2.1; III.11.1.4 — mẫu trong phân vùng dưới 12 h.
test("WITHDRAW-01-UTCID06 [A] Còn 30 phút chặn tự rút và hướng sang Staff", async () => {
  const f = fixture(30 * 60000);

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409,
    code: 'WITHDRAWAL_WINDOW_CLOSED', details: { route: 'STAFF' } });
  expectNoWithdrawal(f);
  expect(f.store.visit.sitterId).toBe(SITTER);
});

// SRS: UC-82 Preconditions — has accepted, not checked in.
test("WITHDRAW-01-UTCID07 [A] Lượt đã check-in không được rút như lượt chưa thực hiện", async () => {
  const f = fixture();
  f.store.visit.state = 'IN_PROGRESS';
  f.store.visit.startAt = new Date(NOW - 15 * 60000).toISOString();
  f.store.visit.checkInAt = new Date(NOW - 5 * 60000).toISOString();

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409, code: 'VISIT_NOT_WITHDRAWABLE' });
  expectNoWithdrawal(f);
});

// SRS: I.4.4 ghi chú 14 — only own accepted visits; UC-82 Preconditions.
test("WITHDRAW-01-UTCID08 [A] Không được rút khỏi lượt của sitter khác", async () => {
  const f = fixture();
  f.input.actor.userId = 'sitter-other';

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 403, code: 'FORBIDDEN' });
  expectNoWithdrawal(f);
});

// SRS: GBR-01; UC-82 actor Pet Sitter.
test("WITHDRAW-01-UTCID09 [A] Guest không được rút khỏi lượt", async () => {
  const f = fixture();
  f.input.actor = null;

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 401, code: 'UNAUTHENTICATED' });
  expectNoWithdrawal(f);
});

// SRS: I.4.4 Withdraw from visit; GBR-02; UC-82 actor.
test("WITHDRAW-01-UTCID10 [A] Customer không được dùng cổng rút lượt của sitter", async () => {
  const f = fixture();
  f.input.actor.roles = ['CUSTOMER'];

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 403, code: 'FORBIDDEN' });
  expectNoWithdrawal(f);
});

// SRS: UC-82 Normal Flow bước 3; III.11.1.3 Reason — Required.
test("WITHDRAW-01-UTCID11 [A] Thiếu lý do bắt buộc thì không được rút", async () => {
  const f = fixture();
  f.input.reason = '';

  await expect(f.withdraw(f.input)).rejects.toMatchObject({ name: 'AppError', status: 422, code: 'VALIDATION_FAILED' });
  expectNoWithdrawal(f);
});
