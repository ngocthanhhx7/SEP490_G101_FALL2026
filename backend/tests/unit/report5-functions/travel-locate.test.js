// TRAVEL-02 — chỉ kiểm thử locate; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/services/employee-scheduling/scheduling-storage.service.js', () => ({ assertEmployeeSchedulingStorage: async () => {} }));
const { createVisitTravelService } = await import('../../../src/services/employee-scheduling/visit-travel.service.js');
const NOW = Date.parse('2026-11-18T03:00:00.000Z'), SITTER = '111111111111111111111111', VISIT = '222222222222222222222222', BOOKING = '333333333333333333333333';
function query(value) { const q = { session: () => q, lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: SITTER, roles: ['PET_SITTER'], state: 'ACTIVE' };
  const visit = { _id: VISIT, bookingId: BOOKING, customerId: '444444444444444444444444', sitterId: SITTER, state: 'IN_PROGRESS', serviceId: 'DOG_WALK', location: 'OUTDOOR', startAt: new Date(NOW - 600000), endAt: new Date(NOW + 3000000), checkInAt: new Date(NOW - 600000) };
  const row = { _id: VISIT, sitterId: SITTER, version: 1, state: 'EN_ROUTE', sharing: true, sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', coordinates: [], observedAt: null };
  const Travel = { db: {}, findById: () => query(row), replaceOne: jest.fn(async () => ({})), updateOne: jest.fn(async () => ({})) };
  const visits = { findOneAndUpdate: jest.fn(async filter => filter.state.$in.includes(visit.state) && String(filter.sitterId) === visit.sitterId && visit.endAt > new Date(NOW) ? visit : null) };
  const bookings = { findOneAndUpdate: async () => ({ state: 'IN_PROGRESS' }) };
  const repository = { models: { EmployeeVisitTravel: Travel, EmployeeScheduleEvent: { create: async () => {} } }, col: name => name === 'visits' ? visits : bookings, uow: { run: async work => work({}) }, employeeGuard: async () => {} };
  const service = createVisitTravelService({ repository, clock: () => NOW });
  const input = { sessionId: row.sessionId, coordinates: [106.7,10.77], accuracyMeters: 10, observedAt: new Date(NOW).toISOString() };
  return { actor, visit, row, Travel, visits, service, input };
}

// SRS: GBR-41 dòng 6680–6683; Permission Matrix chú thích 8 dòng 1837: chỉ chia sẻ vị trí dog walk từ check-in đến check-out; home/vet không chia sẻ.
test("TRAVEL-02-UTCID01 [N] Nhận vị trí trong dog walk đã check-in", async () => {
  const f = fixture();
  await expect(f.service.locate(f.actor, VISIT, f.input)).resolves.toMatchObject({ sharing: true, location: { coordinates: [106.7,10.77] } });
  expect(f.Travel.updateOne).toHaveBeenCalledTimes(1);
});

// SRS: GBR-41 dòng 6680–6683; Permission Matrix chú thích 8 dòng 1837: chỉ chia sẻ vị trí dog walk từ check-in đến check-out; home/vet không chia sẻ.
test("TRAVEL-02-UTCID02 [A] Không nhận vị trí cho chăm sóc tại nhà", async () => {
  const f = fixture(); f.visit.serviceId = 'HOME_CARE'; f.visit.location = 'HOME';
  await expect(f.service.locate(f.actor, VISIT, f.input)).rejects.toBeDefined();
  expect(f.Travel.updateOne).not.toHaveBeenCalled();
});

// SRS: GBR-41 dòng 6680–6683; Permission Matrix chú thích 8 dòng 1837: chỉ chia sẻ vị trí dog walk từ check-in đến check-out; home/vet không chia sẻ.
test("TRAVEL-02-UTCID03 [A] Đã check-out không nhận thêm vị trí", async () => {
  const f = fixture(); f.visit.state = 'COMPLETED'; f.visit.checkOutAt = new Date(NOW - 1);
  await expect(f.service.locate(f.actor, VISIT, f.input)).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED', status: 409 });
});

// SRS: GBR-41 dòng 6680–6683; Permission Matrix chú thích 8 dòng 1837: chỉ chia sẻ vị trí dog walk từ check-in đến check-out; home/vet không chia sẻ.
test("TRAVEL-02-UTCID04 [A] Sitter khác không gửi vị trí thay người được giao", async () => {
  const f = fixture(); f.actor.userId = '555555555555555555555555';
  await expect(f.service.locate(f.actor, VISIT, f.input)).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED', status: 409 });
});
