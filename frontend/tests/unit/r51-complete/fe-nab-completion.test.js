import { describe, expect, jest, test } from '@jest/globals';
import { appointmentLabel, petKindLabel, isReferred } from '../../../src/utils/grooming-booking.js';
import { isShopOnly, groomingPath } from '../../../src/utils/shop-grooming.js';
import { formatReasonTime, formatPhone } from '../../../src/utils/visit-board-format.js';
import { formatBookingRef, formatClosureTime, formatClosureDay, formatClosureSlot } from '../../../src/utils/visit-closure-format.js';
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

const pendingRes = async () => ({ pending: true, status: 202, data: {} });
const badEnvelope = data => async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  clone() { return this; },
  json: async () => ({ data, meta: { schemaVersion: 1 } })
});

describe('Frontend N/A/B Matrix Completion (2-3 UTCIDs per Function)', () => {
  // Formatters Abnormal / Boundary complements
  test('FE-GRM-FMT-02-UTCID04 [A] preserves short/empty time token without throwing', () => {
    expect(appointmentLabel('2026-11-26', '')).toBe('Thứ Năm 26/11/2026 · ');
  });
  test('FE-GRM-FMT-04-UTCID04 [A] ignores NaN weightKg and trims padded breedName', () => {
    expect(petKindLabel({ species: 'CAT', breedName: '  Ba Tư  ', weightKg: Number.NaN })).toBe('Mèo Ba Tư');
  });
  test('FE-GRM-FMT-05-UTCID03 [B] returns false when choice.answers has no biteOrScratch key and throws TypeError on null choice', () => {
    expect(isReferred({ answers: {} })).toBe(false);
    expect(() => isReferred(null)).toThrow(TypeError);
  });
  test('FE-SHOP-GRM-03-UTCID02 [A] returns false when service has HOME fallback or non-grooming category', () => {
    expect(isShopOnly({ id: 's1', details: { locations: ['FACILITY', 'HOME'], category: 'Làm đẹp' } })).toBe(false);
    expect(isShopOnly({ id: 's2', details: { locations: ['FACILITY'], category: 'Khác' } })).toBe(false);
  });
  test('FE-SHOP-GRM-04-UTCID02 [B] encodes special query characters ?, &, and # in serviceId', () => {
    expect(groomingPath({ id: 'a?b&c#d' })).toBe('/grooming-booking?serviceId=a%3Fb%26c%23d');
  });
  test('FE-VISIT-FMT-02-UTCID02 [B] formats zero-ms boundary as Còn 0 phút when late=false', () => {
    expect(formatReasonTime({ late: false, ms: 0 })).toBe('Còn 0 phút');
  });
  test('FE-VISIT-FMT-03-UTCID02 [A] leaves 9-digit, 11-digit, and non-digit strings unformatted', () => {
    expect(formatPhone('091234567')).toBe('091234567');
    expect(formatPhone('09123456789')).toBe('09123456789');
  });
  test('FE-CLOSE-FMT-01-UTCID02 [A] returns default Lịch đặt when row is null or undefined', () => {
    expect(formatBookingRef(null)).toBe('Lịch đặt');
    expect(formatBookingRef(undefined)).toBe('Lịch đặt');
  });
  test('FE-CLOSE-FMT-02-UTCID02 [B] formats 23:59 Vietnam midnight boundary from UTC 16:59Z', () => {
    expect(formatClosureTime('2026-11-26T16:59:00.000Z')).toBe('23:59');
  });
  test('FE-CLOSE-FMT-03-UTCID02 [B] formats year-end boundary 31/12 in Vietnam timezone', () => {
    expect(formatClosureDay('2026-12-31T10:00:00.000Z')).toBe('31/12');
  });
  test('FE-CLOSE-FMT-04-UTCID02 [B] formats cross-noon slot range accurately', () => {
    expect(formatClosureSlot('2026-11-26T04:30:00.000Z', '2026-11-26T06:15:00.000Z')).toBe('26/11 · 11:30 – 13:15');
  });
  test('FE-VSCHED-FMT-01-UTCID02 [A] returns null for NaN, Infinity, empty string, and invalid Date', () => {
    expect(vietnamDateKey(Number.NaN)).toBeNull();
    expect(vietnamDateKey('')).toBeNull();
    expect(vietnamDateKey(new Date('invalid'))).toBeNull();
  });
  test('FE-VSCHED-FMT-02-UTCID02 [A] falls back to UNKNOWN waiting status when visit is null or state unrecognized', () => {
    expect(visitDisplayStatus(null)).toEqual({ key: 'UNKNOWN', label: 'Đang cập nhật', tone: 'waiting' });
  });
  test('FE-VSCHED-FMT-03-UTCID02 [B] groups empty list as [] and buckets invalid startAt under unknown dateKey', () => {
    expect(groupVisitsByVietnamDay([])).toEqual([]);
    const cols = groupVisitsByVietnamDay([{ id: 'v1', startAt: 'bad', endAt: 'bad', state: 'CANCELLED' }]);
    expect(cols[0].dateKey).toBe('unknown');
    expect(cols[0].visits[0].clickable).toBe(false);
  });
  test('FE-VSCHED-FMT-04-UTCID02 [B] uses default service title and 0 buổi when booking details are empty', () => {
    expect(formatBookingScheduleSummary({}, [])).toBe('Lịch chăm sóc thú cưng · 0 buổi');
  });

  // Grooming & Scheduling APIs Abnormal / Boundary complements
  test('FE-GRM-API-01-UTCID02 [A] rejects 202 pending response with COMMAND_PENDING', async () => {
    const api = createGroomingBookingApi({
      fetchImpl: async () => ({
        ok: true, status: 202, headers: { get: () => null },
        json: async () => ({ data: {}, meta: { schemaVersion: 1 } })
      })
    });
    await expect(api.options()).rejects.toMatchObject({ code: 'COMMAND_PENDING', status: 202 });
  });
  test('FE-GRM-API-02-UTCID02 [A] rejects pets list containing unsupported species', async () => {
    const api = createGroomingBookingApi({
      fetchImpl: badEnvelope([{ id: OID1, name: 'Rùa', species: 'TURTLE' }])
    });
    await expect(api.pets()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-GRM-API-03-UTCID02 [A] rejects slots mutation when CSRF token is missing', async () => {
    const api = createGroomingBookingApi({ getCsrfToken: () => null, fetchImpl: jest.fn() });
    await expect(api.slots({ date: '2026-11-27', pets: [] })).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  });
  test('FE-GRM-API-04-UTCID02 [A] rejects quote response with negative totalVnd', async () => {
    const api = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: badEnvelope({ pets: [], subtotalVnd: 100, totalVnd: -1, tier: { discountVnd: 0 } })
    });
    await expect(api.quote({ pets: [] })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-GRM-API-05-UTCID02 [A] rejects book response with malformed appointment code', async () => {
    const api = createGroomingBookingApi({
      getCsrfToken: () => 'csrf-1',
      fetchImpl: badEnvelope({ id: OID1, code: 'BAD-1', slot: { startAt: '2026-11-27T02:00:00Z', localDate: '2026-11-27' }, pricing: { totalVnd: 100 } })
    });
    await expect(api.book({}, 'idem-12345678')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-GRM-API-06-UTCID02 [A] rejects listAppointments when total/page/limit are missing', async () => {
    const api = createGroomingBookingApi({ fetchImpl: badEnvelope({ items: [] }) });
    await expect(api.listAppointments()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-GRM-API-07-UTCID02 [A] rejects cancelAppointment when non-string id or malformed DTO is returned', async () => {
    const api = createGroomingBookingApi({ getCsrfToken: () => 'csrf-1', fetchImpl: badEnvelope({}) });
    await expect(api.cancelAppointment(null)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(api.cancelAppointment(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-EMP-API-01-UTCID02 [B] passes through pending 202 response on withdrawalReview', async () => {
    const api = createEmployeeSchedulingApi(pendingRes);
    await expect(api.withdrawalReview(OID1)).resolves.toMatchObject({ pending: true });
  });
  test('FE-EMP-API-02-UTCID02 [B] passes through pending 202 response on decideWithdrawal', async () => {
    const api = createEmployeeSchedulingApi(pendingRes);
    await expect(api.decideWithdrawal(OID1, { expectedVersion: 1, decision: 'RELEASE' }, 'k-12345678'))
      .resolves.toMatchObject({ pending: true });
  });
  test('FE-EMP-API-03-UTCID02 [A] rejects dispatchDetails with non-integer version', async () => {
    const api = createEmployeeSchedulingApi(async () => ({ data: { id: OID1, version: '1' } }));
    await expect(api.dispatchDetails(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-EMP-API-04-UTCID02 [B] accepts NOT_REQUIRED handover state without requiring care payload', async () => {
    const api = createEmployeeSchedulingApi(async () => ({ data: { visitId: OID1, state: 'NOT_REQUIRED' } }));
    await expect(api.handover(OID1)).resolves.toEqual({ data: { visitId: OID1, state: 'NOT_REQUIRED' } });
  });
  test('FE-EMP-API-05-UTCID02 [A] rejects confirmHandover when response state is not CONFIRMED', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visitId: OID1, state: 'PENDING', version: 2, acceptedAt: '2026-11-26T07:00:00Z', checkInOpensAt: '2026-11-26T07:30:00Z' }
    }));
    await expect(api.confirmHandover(OID1, { expectedVersion: 1, careVersion: HASH64, acknowledged: true }, 'k-12345678'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-EMP-API-06-UTCID02 [A] rejects reassignment when currentSitter.id is missing', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visit: { id: OID1, version: 1, startAt: '2026-11-26T08:00:00Z' }, currentSitter: {}, items: [], blocked: [] }
    }));
    await expect(api.reassignment(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-EMP-API-07-UTCID02 [A] rejects reassign when returned sitterId differs from requested sitterId', async () => {
    const api = createEmployeeSchedulingApi(async () => ({
      data: { visitId: OID1, sitterId: OID2, version: 2, startAt: '2026-11-26T08:00:00Z' }
    }));
    await expect(api.reassign(OID1, { sitterId: OID1, expectedVersion: 1, reason: 'r' }, 'k-12345678'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-ACTION-API-01-UTCID02 [B] calls bare /employee-scheduling/visit-board when all params are empty', async () => {
    const req = jest.fn(async u => u);
    await createNeedsActionApi(req).visitBoard({});
    expect(req).toHaveBeenCalledWith('/employee-scheduling/visit-board', { signal: undefined });
  });
  test('FE-ACTION-API-02-UTCID02 [A] rejects visitContact when returned party mismatches requested party', async () => {
    const api = createNeedsActionApi(async () => ({ data: { party: 'customer', phone: null } }));
    await expect(api.visitContact(OID1, 'sitter')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-CLOSE-API-01-UTCID02 [A] propagates transport rejection on closableVisits', async () => {
    const api = createVisitClosureApi(async () => { throw new Error('offline'); });
    await expect(api.closableVisits()).rejects.toThrow('offline');
  });
  test('FE-CLOSE-API-02-UTCID02 [B] URI-encodes special characters in closureDetails id', async () => {
    const req = jest.fn(async () => ({ data: {} }));
    await createVisitClosureApi(req).closureDetails('id/1');
    expect(req).toHaveBeenCalledWith('/employee-scheduling/visits/id%2F1/closure', { signal: undefined });
  });
  test('FE-CLOSE-API-03-UTCID02 [A] rejects closeVisit when version does not increment by 1', async () => {
    const api = createVisitClosureApi(async () => ({ data: { visitId: OID1, state: 'STAFF_CLOSED', version: 1 } }));
    await expect(api.closeVisit(OID1, { expectedVersion: 1, reason: 'r' }, 'k-12345678'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-CLOSE-API-04-UTCID02 [A] rejects verifyClosure when reviewState is not VERIFIED', async () => {
    const api = createVisitClosureApi(async () => ({
      data: { visitId: OID1, state: 'STAFF_CLOSED', version: 2, reviewState: 'PENDING', outcome: 'NO_SERVICE' }
    }));
    await expect(api.verifyClosure(OID1, { expectedVersion: 1, outcome: 'NO_SERVICE' }, 'k-12345678'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('FE-SHOP-PRICE-01-UTCID02 [A] rejects getProductCustomerPrice with unsupported tierCode', async () => {
    const api = createProductSalesApi({
      fetchImpl: badEnvelope({ unitPrice: 100000, unitDiscount: 0, discountedUnitPrice: 100000, discountBps: 0, tierCode: 'PLATINUM' })
    });
    await expect(api.getProductCustomerPrice(OID1)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  test('FE-TRACK-API-01-UTCID02 [A] rejects tracker response with missing or out-of-order milestones', async () => {
    const tracker = createVisitTrackerApi(async () => ({
      status: 200,
      data: {
        asOf: '2026-11-26T08:00:00Z',
        booking: { id: OID1 },
        visit: { id: OID2, status: 'ASSIGNED', showProgress: true, startAt: null, endAt: null, pets: [] },
        milestones: [],
        updates: [],
        actions: { careReport: false }
      }
    }));
    await expect(tracker(OID1, OID2)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
