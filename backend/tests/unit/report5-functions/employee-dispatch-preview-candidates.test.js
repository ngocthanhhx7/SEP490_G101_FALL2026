// EMP-DISPATCH-01 — chỉ kiểm thử previewCandidates; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect, jest } from '@jest/globals';
import { createEmployeeDispatchService } from '../../../src/services/employee-scheduling/employee-dispatch.service.js';
const VISIT = '111111111111111111111111', BOOKING = '222222222222222222222222', SITTER = '333333333333333333333333';
function query(value) { const q = { sort: () => q, limit: () => q, lean: async () => value }; return q; }
function fixture() {
  const actor = { userId: '444444444444444444444444', roles: ['STAFF'], state: 'ACTIVE' };
  const visit = { _id: VISIT, bookingId: BOOKING, state: 'SCHEDULED', sitterId: null, areaCode: 'AREA_1', location: 'HOME', startAt: new Date('2026-11-20T02:00:00Z'), endAt: new Date('2026-11-20T03:00:00Z'), snapshots: {} };
  const data = { available: [{ _id: SITTER }] };
  const collections = { visits: { findOne: async () => visit }, bookings: { findOne: async () => ({ _id: BOOKING, carePlanState: 'APPROVED', state: 'DISPATCH_PENDING', paymentMode: 'POSTPAY' }) },
    users: { find: () => ({ limit: () => ({ toArray: async () => [{ _id: SITTER, displayName: 'Nhân viên mẫu' }] }) }) },
    sitterstatuses: { find: () => ({ limit: () => ({ toArray: async () => [{ userId: SITTER }] }) }) } };
  const repository = { col: name => collections[name] ?? {}, models: {
    EmployeeAvailability: { find: () => query(data.available) },
    EmployeeVisitOffer: { db: { models: { PayrollMonthGuard: {} }, model: () => ({}) }, exists: async () => false, distinct: async () => [] },
    EmployeeScheduleEvent: { distinct: async () => [] }
  }, uow: {}, employeeGuard: jest.fn(), eligible: jest.fn(async () => ({ weeklyWorkMinutes: 60 })), areaKeys: async () => ['AREA_1'], coverageAreas: [{ code: 'AREA_1' }] };
  const service = createEmployeeDispatchService({ repository, clock: () => Date.parse('2026-11-18T03:00:00Z') });
  return { actor, visit, data, repository, service, input: { startAt: visit.startAt.toISOString(), mode: 'MANUAL' } };
}

// SRS: UC-31/38; SRS III.10.2 Assign/Reassign dòng 4747–4786, 4911–4945; GBR-02/03.
test("EMP-DISPATCH-01-UTCID01 [N] Staff xem ứng viên đủ điều kiện mà chưa gửi lời mời", async () => {
  const f = fixture();
  await expect(f.service.previewCandidates(f.actor, VISIT, f.input)).resolves.toMatchObject({ items: [{ sitterId: SITTER, displayName: 'Nhân viên mẫu' }] });
  expect(f.repository.eligible).toHaveBeenCalledWith(SITTER, expect.objectContaining({ _id: VISIT }), undefined, expect.anything());
  expect(f.repository.employeeGuard).not.toHaveBeenCalled();
});

// SRS: UC-31/38; SRS III.10.2 Assign/Reassign dòng 4747–4786, 4911–4945; GBR-02/03.
test("EMP-DISPATCH-01-UTCID02 [N] Không có ứng viên thì danh sách rỗng", async () => {
  const f = fixture(); f.data.available = [];
  await expect(f.service.previewCandidates(f.actor, VISIT, f.input)).resolves.toMatchObject({ items: [] });
});

// SRS: UC-31/38; SRS III.10.2 Assign/Reassign dòng 4747–4786, 4911–4945; GBR-02/03.
test("EMP-DISPATCH-01-UTCID03 [A] Customer không được xem danh sách điều phối nội bộ", async () => {
  const f = fixture(); f.actor.roles = ['CUSTOMER'];
  await expect(f.service.previewCandidates(f.actor, VISIT, f.input)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
});
