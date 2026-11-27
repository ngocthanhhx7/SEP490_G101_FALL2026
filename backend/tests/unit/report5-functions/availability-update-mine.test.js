import { test, expect, jest } from '@jest/globals';
import { createSitterAvailabilityService } from '../../../src/services/sitter-availability.service.js';
const ACTOR = { userId: 'synthetic-sitter', roles: ['PET_SITTER'], state: 'ACTIVE' };
function command() { return { expectedVersion: 0, idempotencyKey: 'synthetic-availability-01',
  zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-11-16', workingWindows: [
    { weekday: 1, startLocalTime: '09:00', endLocalTime: '12:00' }] }; }
function fixture({ conflict = false } = {}) {
  let state = { availability: { sitterId: ACTOR.userId, state: 'ACTIVE', zone: 'Asia/Ho_Chi_Minh',
    version: 0, areas: [], dayOffDates: [], workingWindows: [] },
    visits: conflict ? [{ id: 'visit-synthetic', sitterId: ACTOR.userId, state: 'ASSIGNED', startAt: '2026-11-16T04:00:00Z' }] : [],
    staffFlags: [], commands: [] };
  const availabilityRepository = {
    findBySitterId: async ({ sitterId, transaction }) => sitterId === ACTOR.userId
      ? globalThis.structuredClone((transaction?.state ?? state).availability) : null,
    listCalendar: jest.fn(), findCommand: async () => null, createIfAbsent: jest.fn(),
    replaceIfVersion: jest.fn(async ({ sitterId, expectedVersion, patch, transaction }) => {
      const current = transaction.state.availability;
      if (current.sitterId !== sitterId || current.version !== expectedVersion) return null;
      Object.assign(current, patch, { version: current.version + 1 });
      return globalThis.structuredClone(current);
    }),
    saveCommand: async ({ transaction, ...data }) => transaction.state.commands.push(data)
  };
  const assignmentRepository = { findConflicts: jest.fn(async () => ({
    items: conflict ? [{ visitId: 'visit-synthetic', startAt: '2026-11-16T04:00:00Z' }] : [], hasMore: false })) };
  const withEligibilityGuard = async ({ sitterId }, work) => {
    if (sitterId !== ACTOR.userId) throw new Error('Fixture chỉ có một owner');
    const transaction = { state: globalThis.structuredClone(state) };
    const result = await work(transaction); state = transaction.state; return result;
  };
  const updateMine = createSitterAvailabilityService({ availabilityRepository, assignmentRepository,
    withEligibilityGuard, clock: () => new Date('2026-11-16T01:00:00Z') }).updateMine;
  return { updateMine, state: () => state, availabilityRepository };
}

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-03-UTCID01 [N] Part-time lưu khung giờ của chính mình", async () => {
  const f = fixture();
  const actual = await f.updateMine({ actor: ACTOR, command: command() });
  expect(actual.workingWindows).toEqual(command().workingWindows);
  expect(f.state().availability.sitterId).toBe(ACTOR.userId);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-03-UTCID02 [N] Có thể đặt tất cả các ngày Off", async () => {
  const f = fixture();
  const actual = await f.updateMine({ actor: ACTOR, command: { ...command(), workingWindows: [] } });
  expect(actual.workingWindows).toEqual([]);
});

// SRS: Report 3 23/11; UC-29; GBR-45; MSG90: từ chối đổi giờ làm ảnh hưởng visit đã xác nhận trước khi Staff xử lý.
test("AVAIL-03-UTCID03 [A] Từ chối thay đổi giờ làm chạm visit đã xác nhận theo MSG90", async () => {
  const f = fixture({ conflict: true });
  await expect(f.updateMine({ actor: ACTOR, command: { ...command(), workingWindows: [
    { weekday: 1, startLocalTime: '09:00', endLocalTime: '10:00' }] } }))
    .rejects.toMatchObject({ status: 409, code: 'CONFIRMED_VISIT_CONFLICT' });
  expect(f.availabilityRepository.replaceIfVersion).not.toHaveBeenCalled();
});

// SRS: GBR-01/02; UC-29.
test("AVAIL-03-UTCID04 [A] Chưa đăng nhập không sửa giờ làm", async () => {
  const f = fixture();
  await expect(f.updateMine({ actor: null, command: command() })).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  expect(f.availabilityRepository.replaceIfVersion).not.toHaveBeenCalled();
});

// SRS: GBR-01/02; UC-29.
test("AVAIL-03-UTCID05 [A] Customer không sửa giờ làm sitter", async () => {
  const f = fixture();
  await expect(f.updateMine({ actor: { ...ACTOR, roles: ['CUSTOMER'] }, command: command() })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.availabilityRepository.replaceIfVersion).not.toHaveBeenCalled();
});
