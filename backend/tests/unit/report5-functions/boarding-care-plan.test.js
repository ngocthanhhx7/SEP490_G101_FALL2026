import { test, expect } from '@jest/globals';
import { boardingCarePlan } from '../../../src/services/booking-proposals/boarding-care-plan.service.js';
function visit(id, startAt, endAt) { return { _id: id, serviceId: 'service', petIds: ['pet'], location: 'HOME', areaCode: 'AREA_A',
  startAt, endAt, snapshots: { boarding: false, serviceName: 'Home visit', employeeServiceNetVnd: 123457,
    careInstructions: 'Cho uống nước theo khai báo đã xác nhận' } }; }
function booking() { return { checkoutSnapshot: { customerVisits: [visit('visit-1', '2026-11-18T10:00:00+07:00', '2026-11-18T11:00:00+07:00')] } }; }

// SRS: UC-25; UC-40; data rule Price snapshot: visit chăm tại nhà giữ đúng lịch, pet và khai báo đã xác nhận.
test("BOARDING-01-UTCID01 [N] Giữ nguyên một visit chăm tại nhà và snapshot", async () => {
  const value = booking(), before = JSON.stringify(value);
  const actual = boardingCarePlan(value, 480);
  expect(actual).toHaveLength(1); expect(actual[0]).toMatchObject({ customerVisitId: 'visit-1', petIds: ['pet'],
    snapshots: { careInstructions: value.checkoutSnapshot.customerVisits[0].snapshots.careInstructions, employeeServiceNetVnd: 123457 } });
  expect(actual[0].startAt).toEqual(new Date('2026-11-18T10:00:00+07:00'));
  expect(actual[0].endAt).toEqual(new Date('2026-11-18T11:00:00+07:00'));
  expect(JSON.stringify(value)).toBe(before);
});

// SRS: UC-25; UC-40; data rule Price snapshot: visit chăm tại nhà giữ đúng lịch, pet và khai báo đã xác nhận.
test("BOARDING-01-UTCID02 [N] Giữ đúng thứ tự và hai khung giờ chăm tại nhà", async () => {
  const value = booking();
  value.checkoutSnapshot.customerVisits.push(visit('visit-2', '2026-11-18T15:00:00+07:00', '2026-11-18T16:00:00+07:00'));
  const actual = boardingCarePlan(value, 480);
  expect(actual.map(r => r.customerVisitId)).toEqual(['visit-1', 'visit-2']);
  expect(actual.map(r => r.startAt.toISOString())).toEqual(['2026-11-18T03:00:00.000Z', '2026-11-18T08:00:00.000Z']);
  expect(actual.map(r => r.endAt.toISOString())).toEqual(['2026-11-18T04:00:00.000Z', '2026-11-18T09:00:00.000Z']);
});
