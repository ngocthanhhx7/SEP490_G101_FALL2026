import { describe, expect, jest, test } from '@jest/globals';
import {
  appointmentLabel, petKindLabel, isReferred, isAnswered, orderedPets, slotPets, quotePets, orderReady
} from '../../../src/utils/grooming-booking.js';
import {
  isShopGrooming, homeLocations, isShopOnly, groomingPath, bookingActions
} from '../../../src/utils/shop-grooming.js';
import {
  formatDuration, formatReasonTime, formatPhone, actionFor
} from '../../../src/utils/visit-board-format.js';
import {
  formatBookingRef, formatClosureTime, formatClosureDay, formatClosureSlot, formatOverdue
} from '../../../src/utils/visit-closure-format.js';
import {
  vietnamDateKey, visitDisplayStatus, groupVisitsByVietnamDay, formatBookingScheduleSummary
} from '../../../src/utils/visit-schedule-format.js';
import { createGroomingBookingApi } from '../../../src/services/grooming-booking-api.js';
import { createEmployeeSchedulingApi } from '../../../src/services/employee-scheduling-api.js';
import { createNeedsActionApi } from '../../../src/services/needs-action-api.js';
import { createVisitClosureApi } from '../../../src/services/visit-closure-api.js';
import { createVisitTrackerApi } from '../../../src/services/visit-tracker-api.js';
import { createProductSalesApi } from '../../../src/services/product-sales-api.js';

const OID1 = '507f1f77bcf86cd799439011';
const OID2 = '507f1f77bcf86cd799439012';
const HASH64 = 'a'.repeat(64);

function okFetch(data, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    clone() { return this; },
    json: async () => ({ data, meta: { schemaVersion: 1 } })
  });
}

describe('Frontend Grooming & Visit Format Utils', () => {
  // FE-GRM-FMT-02
  test('FE-GRM-FMT-02-UTCID01 [N] formats Thursday weekday and dd/mm/yyyy with time', () => {
    expect(appointmentLabel('2026-11-26', '10:00')).toBe('Thứ Năm 26/11/2026 · 10:00');
  });
  test('FE-GRM-FMT-02-UTCID02 [B] formats Sunday boundary date 2026-11-29', () => {
    expect(appointmentLabel('2026-11-29', '08:00')).toBe('Chủ nhật 29/11/2026 · 08:00');
  });
  test('FE-GRM-FMT-02-UTCID03 [B] formats Saturday boundary date 2026-11-28', () => {
    expect(appointmentLabel('2026-11-28', '16:00')).toBe('Thứ Bảy 28/11/2026 · 16:00');
  });

  // FE-GRM-FMT-04
  test('FE-GRM-FMT-04-UTCID01 [N] formats DOG breed without duplicate prefix and includes weight', () => {
    expect(petKindLabel({ species: 'DOG', breedName: 'Poodle', weightKg: 6.5 })).toBe('Chó Poodle · 6.5 kg');
  });
  test('FE-GRM-FMT-04-UTCID02 [N] avoids duplicating Mèo when breedName already starts with Mèo', () => {
    expect(petKindLabel({ species: 'CAT', breedName: 'Mèo Anh lông ngắn', weightKg: 4 })).toBe('Mèo Anh lông ngắn · 4 kg');
  });
  test('FE-GRM-FMT-04-UTCID03 [B] omits weight suffix when weightKg is undefined', () => {
    expect(petKindLabel({ species: 'DOG', breedName: '' })).toBe('Chó');
  });

  // FE-GRM-FMT-05
  test('FE-GRM-FMT-05-UTCID01 [N] returns true when biteOrScratch is YES', () => {
    expect(isReferred({ answers: { biteOrScratch: 'YES', skinCondition: 'NO' } })).toBe(true);
  });
  test('FE-GRM-FMT-05-UTCID02 [N] returns false when biteOrScratch is NO or UNSURE', () => {
    expect(isReferred({ answers: { biteOrScratch: 'NO', skinCondition: 'NO' } })).toBe(false);
    expect(isReferred({ answers: { biteOrScratch: null, skinCondition: null } })).toBe(false);
  });

  // FE-GRM-FMT-06
  test('FE-GRM-FMT-06-UTCID01 [N] returns true only when both answers are non-empty', () => {
    expect(isAnswered({ answers: { biteOrScratch: 'NO', skinCondition: 'NO' } })).toBe(true);
  });
  test('FE-GRM-FMT-06-UTCID02 [A] returns false when either answer is missing', () => {
    expect(isAnswered({ answers: { biteOrScratch: 'NO', skinCondition: null } })).toBe(false);
    expect(isAnswered({ answers: { biteOrScratch: '', skinCondition: 'YES' } })).toBe(false);
  });

  // FE-GRM-FMT-07..10
  const samplePicked = {
    p1: { serviceIds: ['s1'], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } },
    p2: { serviceIds: ['s1'], answers: { biteOrScratch: 'YES', skinCondition: 'NO' } }
  };
  test('FE-GRM-FMT-07-UTCID01 [N] orderedPets filters out referred pets with biteOrScratch=YES', () => {
    expect(orderedPets(samplePicked)).toEqual([['p1', samplePicked.p1]]);
  });
  test('FE-GRM-FMT-07-UTCID02 [B] orderedPets returns empty array when all pets are referred or empty', () => {
    expect(orderedPets({ p2: samplePicked.p2 })).toEqual([]);
    expect(orderedPets({})).toEqual([]);
  });

  test('FE-GRM-FMT-08-UTCID01 [N] slotPets keeps non-referred pets that selected at least one service', () => {
    expect(slotPets(samplePicked)).toEqual([{ petId: 'p1', serviceIds: ['s1'] }]);
  });
  test('FE-GRM-FMT-08-UTCID02 [B] slotPets excludes pets with empty serviceIds', () => {
    expect(slotPets({ p1: { serviceIds: [], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } } })).toEqual([]);
  });

  test('FE-GRM-FMT-09-UTCID01 [N] quotePets maps non-referred pets to { petId, serviceIds, answers }', () => {
    expect(quotePets(samplePicked)).toEqual([
      { petId: 'p1', serviceIds: ['s1'], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }
    ]);
  });
  test('FE-GRM-FMT-09-UTCID02 [B] quotePets returns empty array for empty picked map', () => {
    expect(quotePets({})).toEqual([]);
  });

  test('FE-GRM-FMT-10-UTCID01 [N] orderReady returns true when at least one non-referred pet has services and answers', () => {
    expect(orderReady(samplePicked)).toBe(true);
  });
  test('FE-GRM-FMT-10-UTCID02 [A] orderReady returns false when answers are incomplete or no non-referred pets exist', () => {
    expect(orderReady({ p1: { serviceIds: ['s1'], answers: { biteOrScratch: 'NO', skinCondition: null } } })).toBe(false);
    expect(orderReady({ p2: samplePicked.p2 })).toBe(false);
  });

  // FE-SHOP-GRM-01..05
  const shopOnlySvc = { id: 'svc-1', details: { locations: ['FACILITY'], category: 'Làm đẹp' } };
  const hybridSvc = { id: 'svc-2', details: { locations: ['FACILITY', 'HOME'], category: 'Vệ sinh' } };
  const homeSvc = { id: 'svc-3', details: { locations: ['HOME'], category: 'Chăm sóc tại nhà' } };

  test('FE-SHOP-GRM-01-UTCID01 [N] identifies FACILITY + grooming category as shop grooming', () => {
    expect(isShopGrooming(shopOnlySvc)).toBe(true);
    expect(isShopGrooming(hybridSvc)).toBe(true);
  });
  test('FE-SHOP-GRM-01-UTCID02 [A] returns false for non-grooming category or missing details', () => {
    expect(isShopGrooming(homeSvc)).toBe(false);
    expect(isShopGrooming(null)).toBe(false);
  });

  test('FE-SHOP-GRM-02-UTCID01 [N] removes FACILITY from general booking locations for shop grooming services', () => {
    expect(homeLocations(shopOnlySvc)).toEqual([]);
    expect(homeLocations(hybridSvc)).toEqual(['HOME']);
  });
  test('FE-SHOP-GRM-02-UTCID02 [B] defaults to [HOME] when service.details.locations is missing', () => {
    expect(homeLocations({ id: 'x' })).toEqual(['HOME']);
  });

  test('FE-SHOP-GRM-03-UTCID01 [N] returns true only when service is shop grooming with no home locations', () => {
    expect(isShopOnly(shopOnlySvc)).toBe(true);
    expect(isShopOnly(hybridSvc)).toBe(false);
    expect(isShopOnly(homeSvc)).toBe(false);
  });

  test('FE-SHOP-GRM-04-UTCID01 [N] builds URL-encoded grooming booking path', () => {
    expect(groomingPath({ id: 'svc 1/a' })).toBe('/grooming-booking?serviceId=svc%201%2Fa');
  });

  test('FE-SHOP-GRM-05-UTCID01 [N] returns [SHOP] for shop-only and [SHOP, HOME] for hybrid service', () => {
    expect(bookingActions(shopOnlySvc)).toEqual([
      { kind: 'SHOP', to: '/grooming-booking?serviceId=svc-1', label: 'Đặt lịch tại cửa hàng' }
    ]);
    expect(bookingActions(hybridSvc)).toHaveLength(2);
  });
  test('FE-SHOP-GRM-05-UTCID02 [B] hides SHOP button when groomingBookingEnabled is false', () => {
    expect(bookingActions({ ...shopOnlySvc, groomingBookingEnabled: false })).toEqual([]);
    expect(bookingActions({ ...hybridSvc, groomingBookingEnabled: false })).toEqual([
      { kind: 'HOME', to: '/booking/svc-2', label: 'Đặt tại nhà' }
    ]);
  });

  // FE-VISIT-FMT-01..04
  test('FE-VISIT-FMT-01-UTCID01 [N] formats minutes, hours+minutes, exact hours, and days', () => {
    expect(formatDuration(35 * 60000)).toBe('35 phút');
    expect(formatDuration(130 * 60000)).toBe('2 giờ 10 phút');
    expect(formatDuration(5 * 3600000)).toBe('5 giờ');
    expect(formatDuration(48 * 3600000)).toBe('2 ngày');
  });
  test('FE-VISIT-FMT-01-UTCID02 [B] clamps negative milliseconds to 0 phút', () => {
    expect(formatDuration(-5000)).toBe('0 phút');
  });

  test('FE-VISIT-FMT-02-UTCID01 [N] prefixes Trễ for late=true and Còn for late=false', () => {
    expect(formatReasonTime({ late: true, ms: 35 * 60000 })).toBe('Trễ 35 phút');
    expect(formatReasonTime({ late: false, ms: 120 * 60000 })).toBe('Còn 2 giờ');
  });

  test('FE-VISIT-FMT-03-UTCID01 [N] formats 10-digit phone as 4-3-3 and preserves non-10-digit strings', () => {
    expect(formatPhone('0912345678')).toBe('0912 345 678');
    expect(formatPhone('+84912345678')).toBe('+84912345678');
  });

  test('FE-VISIT-FMT-04-UTCID01 [N] selects highest-priority staff action across all reason codes', () => {
    expect(actionFor({ reasons: [{ code: 'NO_SITTER_24H' }, { code: 'WORKFLOW_BLOCKED' }] }))
      .toEqual({ kind: 'workflow', label: 'Xử lý bước chăm sóc' });
    expect(actionFor({ reasons: [{ code: 'NO_SITTER_24H' }], reviewCode: 'SHIFT_START_REACHED' }))
      .toEqual({ kind: 'dispatch', label: 'Đổi lịch với khách' });
    expect(actionFor({ reasons: [{ code: 'HANDOVER_NOT_CONFIRMED_1H' }] }))
      .toEqual({ kind: 'call', label: 'Gọi người chăm sóc', party: 'sitter' });
    expect(actionFor({ reasons: [{ code: 'WITHDRAWAL_UNDER_12H' }] }))
      .toEqual({ kind: 'withdrawal', label: 'Xem yêu cầu rút' });
    expect(actionFor({ reasons: [{ code: 'NOT_CHECKED_OUT_2H' }] }))
      .toEqual({ kind: 'close', label: 'Đóng buổi' });
    expect(actionFor({ reasons: [{ code: 'COMPLETION_VERIFICATION_PENDING' }] }))
      .toEqual({ kind: 'close', label: 'Đối chiếu buổi' });
  });
  test('FE-VISIT-FMT-04-UTCID02 [B] returns null when row has no actionable reasons', () => {
    expect(actionFor({ reasons: [] })).toBeNull();
  });

  // FE-CLOSE-FMT-01..05
  test('FE-CLOSE-FMT-01-UTCID01 [N] prefers bookingCode, falls back to last 6 chars of bookingId, else Lịch đặt', () => {
    expect(formatBookingRef({ bookingCode: 'BK-0009', bookingId: OID1 })).toBe('BK-0009');
    expect(formatBookingRef({ bookingId: '507f1f77bcf86cd799a1b2c3' })).toBe('…a1b2c3');
    expect(formatBookingRef({})).toBe('Lịch đặt');
  });

  test('FE-CLOSE-FMT-02-UTCID01 [N] formats UTC timestamp in Asia/Ho_Chi_Minh HH:mm', () => {
    expect(formatClosureTime('2026-11-26T02:05:00.000Z')).toBe('09:05');
  });

  test('FE-CLOSE-FMT-03-UTCID01 [N] formats UTC timestamp across midnight into Vietnam DD/MM', () => {
    expect(formatClosureDay('2026-11-25T18:30:00.000Z')).toBe('26/11');
  });

  test('FE-CLOSE-FMT-04-UTCID01 [N] formats closure slot DD/MM · HH:mm – HH:mm', () => {
    expect(formatClosureSlot('2026-11-26T01:00:00.000Z', '2026-11-26T03:00:00.000Z')).toBe('26/11 · 08:00 – 10:00');
  });

  test('FE-CLOSE-FMT-05-UTCID01 [N] formats overdue duration under and over 1 hour', () => {
    expect(formatOverdue(45 * 60000)).toBe('Trễ 45 phút');
    expect(formatOverdue(120 * 60000)).toBe('Trễ 2 giờ');
    expect(formatOverdue(130 * 60000)).toBe('Trễ 2 giờ 10 phút');
  });
  test('FE-CLOSE-FMT-05-UTCID02 [B] clamps negative overdue ms to Trễ 0 phút', () => {
    expect(formatOverdue(-1000)).toBe('Trễ 0 phút');
  });

  // FE-VSCHED-FMT-01..04
  test('FE-VSCHED-FMT-01-UTCID01 [N] converts UTC instant to Vietnam YYYY-MM-DD and returns null for invalid input', () => {
    expect(vietnamDateKey('2026-11-25T18:00:00.000Z')).toBe('2026-11-26');
    expect(vietnamDateKey('not-a-date')).toBeNull();
    expect(vietnamDateKey(null)).toBeNull();
  });

  test('FE-VSCHED-FMT-02-UTCID01 [N] maps visit states and bookingCancelled override to display status', () => {
    expect(visitDisplayStatus({ state: 'SCHEDULED', hasPendingOffer: true })).toEqual({
      key: 'OFFERED', label: 'Đang mời người', tone: 'waiting'
    });
    expect(visitDisplayStatus({ state: 'ASSIGNED' }, { bookingCancelled: true })).toEqual({
      key: 'CANCELLED', label: 'Đã huỷ', tone: 'cancelled'
    });
    expect(visitDisplayStatus({ state: 'COMPLETED' })).toEqual({
      key: 'COMPLETED', label: 'Đã xong', tone: 'done'
    });
  });

  test('FE-VSCHED-FMT-03-UTCID01 [N] groups and sorts visits by Vietnam calendar day and marks today', () => {
    const cols = groupVisitsByVietnamDay([
      { id: 'v2', startAt: '2026-11-27T02:00:00.000Z', endAt: '2026-11-27T03:00:00.000Z', state: 'SCHEDULED' },
      { id: 'v1', startAt: '2026-11-26T01:00:00.000Z', endAt: '2026-11-26T02:00:00.000Z', state: 'ASSIGNED', sitterName: 'Lan' }
    ], { now: Date.parse('2026-11-26T00:00:00.000Z') });
    expect(cols.map(c => c.dateKey)).toEqual(['2026-11-26', '2026-11-27']);
    expect(cols[0].isToday).toBe(true);
    expect(cols[0].visits[0].personLabel).toBe('Lan');
  });

  test('FE-VSCHED-FMT-04-UTCID01 [N] summarizes consecutive days with identical times using mỗi ngày', () => {
    const v1 = { id: 'v1', startAt: '2026-11-26T01:00:00.000Z', endAt: '2026-11-26T02:00:00.000Z', state: 'SCHEDULED' };
    const v2 = { id: 'v2', startAt: '2026-11-27T01:00:00.000Z', endAt: '2026-11-27T02:00:00.000Z', state: 'SCHEDULED' };
    const cols = groupVisitsByVietnamDay([v1, v2]);
    const summary = formatBookingScheduleSummary(
      { details: { terms: [{ serviceName: 'Dắt chó đi dạo' }], visits: [v1, v2] } },
      cols
    );
    expect(summary).toBe('Dắt chó đi dạo · 26/11 – 27/11/2026 · 08:00 mỗi ngày · 2 buổi');
  });
});

describe('Frontend Transport & DTO Validators', () => {
  // FE-GRM-API-01..07
  const validAppt = {
    id: OID1,
    code: 'GR-0001',
    status: 'BOOKED',
    slot: { startAt: '2026-11-27T02:00:00.000Z', localDate: '2026-11-27', startLocalTime: '09:00' },
    pricing: { totalVnd: 200000 }
  };

  test('FE-GRM-API-01-UTCID01 [N] options returns validated options DTO and rejects malformed services', async () => {
    const good = createGroomingBookingApi({
      fetchImpl: okFetch({
        window: { firstDate: '2026-11-26', lastDate: '2026-12-02' },
        services: [{ id: OID1, name: 'Tắm sấy', species: ['DOG'], bookable: true }],
        questions: []
      })
    });
    const res = await good.options();
    expect(res.services).toHaveLength(1);

    const bad = createGroomingBookingApi({ fetchImpl: okFetch({ window: {}, services: [{}], questions: [] }) });
    await expect(bad.options()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-GRM-API-02-UTCID01 [N] pets enriches breedName from catalog and survives catalog error', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (url.endsWith('/pet-care/pets')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({
          data: [{ _id: OID1, name: 'Bơ', species: 'DOG', breedCode: 'POODLE' }], meta: { schemaVersion: 1 }
        }) };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({
        data: { breeds: [{ code: 'POODLE', species: 'DOG', name: 'Poodle' }] }, meta: { schemaVersion: 1 }
      }) };
    });
    const api = createGroomingBookingApi({ fetchImpl });
    await expect(api.pets()).resolves.toEqual([
      { _id: OID1, id: OID1, name: 'Bơ', species: 'DOG', breedCode: 'POODLE', breedName: 'Poodle' }
    ]);
  });

  test('FE-GRM-API-03-UTCID01 [N] slots posts date/pets with CSRF and validates slot state', async () => {
    const api = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: okFetch({ date: '2026-11-27', slots: [{ startAt: '2026-11-27T02:00:00.000Z', time: '09:00', state: 'AVAILABLE' }] })
    });
    const res = await api.slots({ date: '2026-11-27', pets: [{ petId: OID1, serviceIds: [OID2] }] });
    expect(res.slots[0].state).toBe('AVAILABLE');

    const bad = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: okFetch({ slots: [{ startAt: 'x', time: '09:00', state: 'BROKEN' }] })
    });
    await expect(bad.slots({ date: '2026-11-27', pets: [] })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-GRM-API-04-UTCID01 [N] quote validates integer VND totals and tier discount', async () => {
    const api = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: okFetch({
        pets: [{ petId: OID1, priceVnd: 200000, lines: [] }],
        subtotalVnd: 200000,
        totalVnd: 190000,
        tier: { code: 'SILVER', discountVnd: 10000 }
      })
    });
    const res = await api.quote({ pets: [] });
    expect(res.totalVnd).toBe(190000);
  });

  test('FE-GRM-API-05-UTCID01 [N] book validates GR-xxxx appointment and attaches serverMessage/details on error', async () => {
    const api = createGroomingBookingApi({ getCsrfToken: () => 'csrf-1', fetchImpl: okFetch(validAppt, 201) });
    await expect(api.book({ startAt: validAppt.slot.startAt, pets: [], expectedTotalVnd: 200000 }, 'idem-12345678'))
      .resolves.toMatchObject({ code: 'GR-0001' });

    const errApi = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        headers: { get: () => null },
        clone() { return this; },
        json: async () => ({ error: { code: 'GROOMING_PRICE_CHANGED', message: 'Giá vừa đổi', totalVnd: 250000 } })
      })
    });
    await expect(errApi.book({}, 'idem-12345678')).rejects.toMatchObject({
      code: 'GROOMING_PRICE_CHANGED',
      serverMessage: 'Giá vừa đổi',
      details: { totalVnd: 250000 }
    });
  });

  test('FE-GRM-API-06-UTCID01 [N] listAppointments serializes query params and validates paginated items', async () => {
    const fetchImpl = jest.fn(okFetch({ items: [validAppt], total: 1, page: 1, limit: 20 }));
    const api = createGroomingBookingApi({ fetchImpl });
    const res = await api.listAppointments({ upcoming: true, status: 'BOOKED', page: 1, limit: 20 });
    expect(res.items).toHaveLength(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/grooming/appointments?upcoming=true&status=BOOKED&page=1&limit=20');
  });

  test('FE-GRM-API-07-UTCID01 [N] cancelAppointment posts cancel and rejects empty id', async () => {
    const api = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: okFetch({ ...validAppt, status: 'CANCELLED' })
    });
    await expect(api.cancelAppointment(OID1)).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(api.cancelAppointment('')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  // FE-EMP-API-01..07
  test('FE-EMP-API-01-UTCID01 [N] withdrawalReview validates visitId, version, and timestamps', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visitId: OID1, version: 2, startAt: '2026-11-26T08:00:00Z', endAt: '2026-11-26T09:00:00Z' }
    }));
    await expect(api.withdrawalReview(OID1)).resolves.toMatchObject({ data: { visitId: OID1, version: 2 } });

    const bad = createEmployeeSchedulingApi(async () => ({ data: { visitId: 'other', version: 2 } }));
    await expect(bad.withdrawalReview(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-EMP-API-02-UTCID01 [N] decideWithdrawal verifies version increment and decision match', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visitId: OID1, version: 3, decision: 'RELEASE' }
    }));
    await expect(api.decideWithdrawal(OID1, { expectedVersion: 2, decision: 'RELEASE', reason: 'ok' }, 'k-12345678'))
      .resolves.toMatchObject({ data: { version: 3 } });

    const bad = createEmployeeSchedulingApi(async () => ({ data: { visitId: OID1, version: 2, decision: 'RELEASE' } }));
    await expect(bad.decideWithdrawal(OID1, { expectedVersion: 2, decision: 'RELEASE', reason: 'ok' }, 'k-12345678'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-EMP-API-03-UTCID01 [N] dispatchDetails validates id and non-negative integer version', async () => {
    const api = createEmployeeSchedulingApi(async () => ({ data: { id: OID1, version: 0 } }));
    await expect(api.dispatchDetails(OID1)).resolves.toEqual({ data: { id: OID1, version: 0 } });

    const bad = createEmployeeSchedulingApi(async () => ({ data: { id: OID2, version: 0 } }));
    await expect(bad.dispatchDetails(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-EMP-API-04-UTCID01 [N] handover validates PENDING care sha256 and CONFIRMED/NOT_REQUIRED states', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: {
        visitId: OID1,
        state: 'PENDING',
        version: 1,
        startAt: '2026-11-26T08:00:00Z',
        endAt: '2026-11-26T09:00:00Z',
        accessOpensAt: '2026-11-26T07:00:00Z',
        checkInOpensAt: '2026-11-26T07:30:00Z',
        note: {},
        pets: [],
        reports: [],
        care: { version: HASH64, pets: [], tasks: [] }
      }
    }));
    await expect(api.handover(OID1)).resolves.toMatchObject({ data: { state: 'PENDING' } });

    const bad = createEmployeeSchedulingApi(async () => ({ data: { visitId: OID1, state: 'PENDING', version: 1 } }));
    await expect(bad.handover(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-EMP-API-05-UTCID01 [N] confirmHandover verifies CONFIRMED state and version+1', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: {
        visitId: OID1,
        state: 'CONFIRMED',
        version: 2,
        acceptedAt: '2026-11-26T07:10:00Z',
        checkInOpensAt: '2026-11-26T07:30:00Z'
      }
    }));
    await expect(api.confirmHandover(OID1, { expectedVersion: 1, careVersion: HASH64, acknowledged: true }, 'k-12345678'))
      .resolves.toMatchObject({ data: { state: 'CONFIRMED', version: 2 } });
  });

  test('FE-EMP-API-06-UTCID01 [N] reassignment validates visit, currentSitter, items, and blocked arrays', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: {
        visit: { id: OID1, version: 1, startAt: '2026-11-26T08:00:00Z' },
        currentSitter: { id: OID2 },
        items: [],
        blocked: []
      }
    }));
    await expect(api.reassignment(OID1)).resolves.toMatchObject({ data: { currentSitter: { id: OID2 } } });
  });

  test('FE-EMP-API-07-UTCID01 [N] reassign validates sitterId and version increment', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visitId: OID1, sitterId: OID2, version: 4, startAt: '2026-11-26T08:00:00Z' }
    }));
    await expect(api.reassign(OID1, { sitterId: OID2, expectedVersion: 3, reason: 'Thay người' }, 'k-12345678'))
      .resolves.toMatchObject({ data: { sitterId: OID2, version: 4 } });
  });

  // FE-ACTION-API-01..02
  test('FE-ACTION-API-01-UTCID01 [N] visitBoard strips empty params and forwards non-empty filters', async () => {
    const req = jest.fn(async (url) => ({ url }));
    const api = createNeedsActionApi(req);
    await api.visitBoard({ tab: 'needs-action', search: '', areaCode: 'HN_CAU_GIAY', cursor: null });
    expect(req).toHaveBeenCalledWith('/employee-scheduling/visit-board?tab=needs-action&areaCode=HN_CAU_GIAY', { signal: undefined });
  });

  test('FE-ACTION-API-02-UTCID01 [N] visitContact validates visitId and matching response party', async () => {
    const api = createNeedsActionApi(async () => ({ data: { party: 'sitter', phone: '0912345678' } }));
    await expect(api.visitContact(OID1, 'sitter')).resolves.toEqual({ data: { party: 'sitter', phone: '0912345678' } });
    await expect(api.visitContact('../bad', 'sitter')).rejects.toMatchObject({ code: 'INVALID_RESOURCE_ID' });
  });

  // FE-CLOSE-API-01..04
  test('FE-CLOSE-API-01-UTCID01 [N] closableVisits calls GET /employee-scheduling/closable-visits', async () => {
    const req = jest.fn(async () => ({ data: { items: [] } }));
    await createVisitClosureApi(req).closableVisits({});
    expect(req).toHaveBeenCalledWith('/employee-scheduling/closable-visits', { signal: undefined });
  });

  test('FE-CLOSE-API-02-UTCID01 [N] closureDetails calls encoded visit closure detail endpoint', async () => {
    const req = jest.fn(async () => ({ data: { id: OID1 } }));
    await createVisitClosureApi(req).closureDetails(OID1);
    expect(req).toHaveBeenCalledWith(`/employee-scheduling/visits/${OID1}/closure`, { signal: undefined });
  });

  test('FE-CLOSE-API-03-UTCID01 [N] closeVisit validates STAFF_CLOSED state and version+1', async () => {
    const api = createVisitClosureApi(async () => ({ data: { visitId: OID1, state: 'STAFF_CLOSED', version: 2 } }));
    await expect(api.closeVisit(OID1, { expectedVersion: 1, reason: 'Quên check-out' }, 'k-12345678'))
      .resolves.toMatchObject({ data: { state: 'STAFF_CLOSED', version: 2 } });
  });

  test('FE-CLOSE-API-04-UTCID01 [N] verifyClosure validates VERIFIED reviewState and matching outcome', async () => {
    const api = createVisitClosureApi(async () => ({
      data: { visitId: OID1, state: 'STAFF_CLOSED', version: 3, reviewState: 'VERIFIED', outcome: 'NO_SERVICE' }
    }));
    await expect(api.verifyClosure(OID1, { expectedVersion: 2, outcome: 'NO_SERVICE', reason: 'r', evidenceReference: 'ev1' }, 'k-12345678'))
      .resolves.toMatchObject({ data: { reviewState: 'VERIFIED' } });
  });

  // FE-SHOP-PRICE-01
  test('FE-SHOP-PRICE-01-UTCID01 [N] getProductCustomerPrice validates discount math and tierCode', async () => {
    const api = createProductSalesApi({
      fetchImpl: okFetch({ unitPrice: 100000, unitDiscount: 5000, discountedUnitPrice: 95000, discountBps: 500, tierCode: 'SILVER' })
    });
    const res = await api.getProductCustomerPrice(OID1);
    expect(res.data.discountedUnitPrice).toBe(95000);

    const bad = createProductSalesApi({
      fetchImpl: okFetch({ unitPrice: 100000, unitDiscount: 5000, discountedUnitPrice: 90000, discountBps: 500, tierCode: 'SILVER' })
    });
    await expect(bad.getProductCustomerPrice(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  // FE-TRACK-API-01
  test('FE-TRACK-API-01-UTCID01 [N] createVisitTrackerApi validates 5 ordered milestones and rejects invalid hex24 IDs', async () => {
    const tracker = createVisitTrackerApi(async () => ({
      status: 200,
      data: {
        asOf: '2026-11-26T08:00:00.000Z',
        booking: { id: OID1 },
        visit: { id: OID2, status: 'ASSIGNED', showProgress: true, startAt: '2026-11-26T09:00:00.000Z', endAt: '2026-11-26T10:00:00.000Z', pets: [] },
        milestones: [
          { key: 'ASSIGNED', reached: true, at: '2026-11-26T07:00:00.000Z' },
          { key: 'ARRIVED', reached: false, at: null },
          { key: 'IN_PROGRESS', reached: false, at: null },
          { key: 'FINISHED', reached: false, at: null },
          { key: 'REPORT_READY', reached: false, at: null }
        ],
        updates: [{ key: 'ASSIGNED', at: '2026-11-26T07:00:00.000Z' }],
        careUpdates: null,
        actions: { careReport: false }
      }
    }));
    const res = await tracker(OID1, OID2);
    expect(res.visit.status).toBe('ASSIGNED');
    await expect(tracker('bad-id', OID2)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
});
