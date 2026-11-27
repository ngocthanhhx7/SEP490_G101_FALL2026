// Một file chỉ gọi reassign; helper dựng port/store tổng hợp.
import { test, expect, jest } from '@jest/globals';
import { createVisitReassignmentService } from '../../../src/services/visit-reassignment.service.js';

const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const HOUR = 3600000;
const VISIT = 'visit-srs-01';
const OLD = 'sitter-old';
const NEW = 'sitter-new';
function fixture() {
  const store = { now: NOW,
    visit: { id: VISIT, state: 'ASSIGNED', sitterId: OLD, version: 4, checkInAt: null,
      startAt: new Date(NOW + 24 * HOUR).toISOString(), endAt: new Date(NOW + 25 * HOUR).toISOString() },
    candidate: { sitterId: NEW, status: 'ACTIVE' }, eligibility: { eligible: true },
    slotAvailable: true, writes: 0, changes: [], events: [], notifications: [] };
  const tx = {
    getVisit: jest.fn(async ({ visitId }) => visitId === store.visit.id ? globalThis.structuredClone(store.visit) : null),
    getSitter: jest.fn(async ({ sitterId }) => sitterId === store.candidate.sitterId ? globalThis.structuredClone(store.candidate) : null),
    recheckEligibility: jest.fn(async () => globalThis.structuredClone(store.eligibility)),
    checkSlotAvailability: jest.fn(async () => store.slotAvailable),
    reassignVisit: jest.fn(async command => {
      if (store.visit.version !== command.expectedVersion) throw new Error('Fixture CAS rejected');
      store.changes.push(globalThis.structuredClone(command));
      store.visit.sitterId = command.newSitterId; store.visit.version += 1;
      store.visit.handoverRequired = command.handoverRequired; store.writes += 1;
      return { state: 'ASSIGNED', sitterId: store.visit.sitterId, version: store.visit.version };
    }),
    appendAuditAndOutbox: jest.fn(async event => { store.events.push(globalThis.structuredClone(event)); }),
    notify: jest.fn(async event => { store.notifications.push(globalThis.structuredClone(event)); }),
  };
  const repository = { runVisitCommand: jest.fn(async command => command.execute(tx)) };
  const reassign = createVisitReassignmentService({ repository, clock: () => store.now }).reassign;
  const input = { actor: { userId: 'staff-srs-01', state: 'ACTIVE', roles: ['STAFF'] },
    visitId: VISIT, newSitterId: NEW, expectedVersion: 4, idempotencyKey: 'srs-reassign-command',
    reason: 'Người chăm sóc hiện tại không thể tiếp tục nhận lượt' };
  return { store, tx, repository, reassign, input };
}
function expectNoChange(f) {
  expect(f.tx.reassignVisit).not.toHaveBeenCalled();
  expect(f.store.writes).toBe(0);
  expect(f.store.events).toEqual([]);
  expect(f.store.notifications).toEqual([]);
}

// SRS: UC-38 Overview; III.11.2.1 Change pet sitter / Note; UC-41; GBR-24.
test("REASSIGN-01-UTCID01 [N] Staff đổi người và yêu cầu bàn giao kèm lý do người cũ thời điểm", async () => {
  const f = fixture();
  const before = globalThis.structuredClone(f.store.visit);

  const actual = await f.reassign(f.input);

  expect(actual).toMatchObject({ visitId: VISIT, state: 'ASSIGNED', sitterId: NEW, previousSitterId: OLD, handoverRequired: true });
  expect(f.store.visit).toMatchObject({ sitterId: NEW, handoverRequired: true, startAt: before.startAt, endAt: before.endAt });
  expect(f.store.changes[0]).toMatchObject({ oldSitterId: OLD, newSitterId: NEW, reason: f.input.reason, handoverRequired: true,
    now: new Date(NOW).toISOString() });
  expect(f.store.events).toEqual([expect.objectContaining({ type: 'VisitReassigned', oldSitterId: OLD, newSitterId: NEW,
    reason: f.input.reason, handoverRequired: true, at: new Date(NOW).toISOString() })]);
  expect(f.store.notifications).toEqual([expect.objectContaining({ type: 'VISIT_REASSIGNED', recipientIds: expect.arrayContaining([OLD, NEW]) })]);
  expect(f.tx.recheckEligibility).toHaveBeenCalledTimes(1);
  expect(f.tx.checkSlotAvailability).toHaveBeenCalledTimes(1);
});

// SRS: GBR-03; III.11.2.1 — Admin can do the same.
test("REASSIGN-01-UTCID02 [N] Admin có quyền đổi người như Staff", async () => {
  const f = fixture();
  f.input.actor = { userId: 'admin-srs-01', state: 'ACTIVE', roles: ['ADMIN'] };

  await expect(f.reassign(f.input)).resolves.toMatchObject({ sitterId: NEW, state: 'ASSIGNED' });
  expect(f.store.events[0].actorId).toBe('admin-srs-01');
});

// SRS: GBR-01; UC-38 quyền Staff/Admin.
test("REASSIGN-01-UTCID03 [A] Guest không được đổi người", async () => {
  const f = fixture();
  f.input.actor = null;

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 401, code: 'UNAUTHENTICATED' });
  expectNoChange(f);
});

// SRS: I.4.4 Assign/reassign by hand; GBR-02; UC-38.
test("REASSIGN-01-UTCID04 [A] Customer không được thao tác đổi người của Staff", async () => {
  const f = fixture();
  f.input.actor.roles = ['CUSTOMER'];

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 403, code: 'FORBIDDEN' });
  expectNoChange(f);
});

// SRS: III.11.2.1 Reason for the change — Required; MSG01.
test("REASSIGN-01-UTCID05 [A] Thiếu lý do bắt buộc thì không đổi người", async () => {
  const f = fixture();
  f.input.reason = '';

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 422, code: 'VALIDATION_FAILED' });
  expectNoChange(f);
});

// SRS: III.11.2.1 Choose a replacement; GBR-32 — Overlap cannot be chosen.
test("REASSIGN-01-UTCID06 [A] Không chọn người thay thế có trùng lịch kể cả travel", async () => {
  const f = fixture();
  f.store.slotAvailable = false;

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409, code: 'SLOT_UNAVAILABLE' });
  expectNoChange(f);
});

// SRS: GBR-04 — suspended sitter gets no new visits.
test("REASSIGN-01-UTCID07 [A] Người bị đình chỉ không nhận lượt thay thế", async () => {
  const f = fixture();
  f.store.candidate.status = 'SUSPENDED';

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409, code: 'SITTER_SUSPENDED' });
  expectNoChange(f);
});

// SRS: III.11.2.1 — Reassign sau 30 min chưa check-in; GBR-14/29; JOB-02.
// Defect: DEF_REASSIGN_NO_SHOW_01 — giữ expected theo SRS; không skip/failing.
test("REASSIGN-01-UTCID08 [N] Staff đổi người khi sitter cũ chưa check-in sau giờ bắt đầu 30 phút", async () => {
  const f = fixture();
  f.store.visit.startAt = new Date(NOW - 30 * 60000).toISOString();
  f.store.visit.endAt = new Date(NOW + 30 * 60000).toISOString();

  await expect(f.reassign(f.input)).resolves.toMatchObject({ state: 'ASSIGNED', sitterId: NEW, handoverRequired: true });
  expect(f.store.visit.sitterId).toBe(NEW);
});

// SRS: GBR-13; III.11.2.1 Change pet sitter — checks again / MSG25.
test("REASSIGN-01-UTCID09 [A] Không ghi đè lượt mà Staff khác vừa đổi người trước", async () => {
  const f = fixture();
  // Mô phỏng kết quả đã lưu trước, không mô phỏng hai transaction cạnh tranh.
  f.store.visit.sitterId = 'sitter-first';
  f.store.visit.version = 5;

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409, code: 'VERSION_CONFLICT' });
  expect(f.store.visit.sitterId).toBe('sitter-first');
  expectNoChange(f);
});

// SRS: III.11.2.1 Choose a replacement — without the current pet sitter.
test("REASSIGN-01-UTCID10 [A] Không chọn lại chính người đang được phân công", async () => {
  const f = fixture();
  f.input.newSitterId = OLD;

  await expect(f.reassign(f.input)).rejects.toMatchObject({ name: 'AppError', status: 409, code: 'ALREADY_ASSIGNED' });
  expectNoChange(f);
});
