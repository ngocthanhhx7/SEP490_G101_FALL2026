import { test, expect, jest } from '@jest/globals';
import { createDayOffRequestService } from '../../../src/services/day-off-request.service.js';
const ACTOR = { userId: 'synthetic-sitter', roles: ['PET_SITTER'], state: 'ACTIVE' };
const NOW = Date.parse('2026-11-16T01:00:00Z');
function input() { return { actor: ACTOR, startDate: '2026-11-17', endDate: '2026-11-17',
  reason: 'Có việc gia đình', expectedVersion: 0, idempotencyKey: 'synthetic-day-off-01' }; }
function fixture({ visitAfterMinutes } = {}) {
  let state = { availability: { sitterId: ACTOR.userId, version: 0, dayOffDates: [] }, requests: [],
    visits: visitAfterMinutes === undefined ? [] : [{ id: 'accepted-synthetic', sitterId: ACTOR.userId,
      state: 'ASSIGNED', startAt: new Date(NOW + visitAfterMinutes * 60000).toISOString() }], commands: [] };
  const calls = { create: jest.fn() };
  const repository = { runForSitterActor: async (actor, work) => {
    const draft = globalThis.structuredClone(state);
    const transaction = {
      getIdempotencyResult: async () => null,
      getAvailabilityForSitter: async id => id === ACTOR.userId ? draft.availability : null,
      findOverlappingDayOffRequests: async () => false,
      findConfirmedVisitConflicts: async ({ sitterId, startDate, endDate }) => ({
        items: draft.visits.filter(visit => {
          const day = new Date(Date.parse(visit.startAt) + 7 * 3600000).toISOString().slice(0, 10);
          return visit.sitterId === sitterId && day >= startDate && day <= endDate;
        }), hasMore: false }),
      createPendingDayOffRequest: async ({ request }) => {
        calls.create(request); draft.requests.push(request); return { requestId: '111111111111111111111111' };
      },
      saveIdempotencyResult: async record => draft.commands.push(record)
    };
    const result = await work(transaction, { sitterId: actor.userId }); state = draft; return result;
  } };
  return { request: createDayOffRequestService({ repository, clock: () => new Date(NOW) }).request,
    state: () => state, calls };
}

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
// DEF_DAY_OFF_REASON_SAVE: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("DAY-OFF-01-UTCID01 [N] Yêu cầu nghỉ phải lưu lý do bắt buộc", async () => {
  const f = fixture();
  const actual = await f.request(input());
  expect(actual.request.state).toBe('PENDING');
  expect(f.state().requests[0].reason).toBe('Có việc gia đình');
  expect(f.state().availability.dayOffDates).toEqual([]);
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
// DEF_DAY_OFF_REASON_REQUIRED: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("DAY-OFF-01-UTCID02 [A] Thiếu lý do không được gửi đơn nghỉ", async () => {
  const f = fixture();
  const command = input(); delete command.reason;
  await expect(f.request(command)).rejects.toBeDefined();
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
test("DAY-OFF-01-UTCID03 [A] Không xin nghỉ ngày đã qua", async () => {
  const f = fixture();
  await expect(f.request({ ...input(), ...{ startDate: '2026-11-15', endDate: '2026-11-15' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
test("DAY-OFF-01-UTCID04 [A] Ngày kết thúc không được trước ngày bắt đầu", async () => {
  const f = fixture();
  await expect(f.request({ ...input(), ...{ startDate: '2026-11-18', endDate: '2026-11-17' } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
test("DAY-OFF-01-UTCID05 [A] Phải có ngày bắt đầu", async () => {
  const f = fixture();
  await expect(f.request({ ...input(), ...{ startDate: undefined } })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
test("DAY-OFF-01-UTCID06 [B] Cho xin nghỉ từ hôm nay và một ngày duy nhất", async () => {
  const f = fixture();
  const actual = await f.request({ ...input(), startDate: '2026-11-16', endDate: '2026-11-16' });
  expect(actual.request).toMatchObject({ state: 'PENDING', startDate: '2026-11-16', endDate: '2026-11-16' });
  expect(f.state().availability.dayOffDates).toEqual([]);
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
// DEF_DAY_OFF_12_HOUR_GUARD: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("DAY-OFF-01-UTCID07 [B] Visit còn 11 giờ 59 phút phải rút buổi thay vì xin nghỉ", async () => {
  const f = fixture({ visitAfterMinutes: 719 });
  const command = { ...input(), startDate: '2026-11-16', endDate: '2026-11-16' };
  await expect(f.request(command)).rejects.toBeDefined();
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21.
test("DAY-OFF-01-UTCID08 [B] Đúng 12 giờ vẫn được gửi Pending để Staff xét", async () => {
  const f = fixture({ visitAfterMinutes: 720 });
  const command = { ...input(), startDate: '2026-11-16', endDate: '2026-11-16' };
  const actual = await f.request(command);
  expect(actual.request.state).toBe('PENDING');
  expect(f.state().visits[0].state).toBe('ASSIGNED');
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21; GBR-01/02.
test("DAY-OFF-01-UTCID09 [A] Chưa đăng nhập không gửi đơn nghỉ", async () => {
  const f = fixture();
  await expect(f.request({ ...input(), actor: null })).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.calls.create).not.toHaveBeenCalled();
});

// SRS: UC-79; III.9.1.2 Day Off Request; GBR-21; GBR-01/02.
test("DAY-OFF-01-UTCID10 [A] Customer không gửi đơn nghỉ của sitter", async () => {
  const f = fixture();
  await expect(f.request({ ...input(), actor: { ...ACTOR, roles: ['CUSTOMER'] } })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.calls.create).not.toHaveBeenCalled();
});
