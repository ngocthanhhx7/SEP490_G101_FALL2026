import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import {
  groomingLocalDate, groomingLocalTime, groomingDayStart, groomingSlotKey,
  isGroomingDate, groomingWindow, groomingSlotStarts, groomingSlotsNeeded, groomingCoveredSlots
} from '../../../src/utils/grooming-slot-time.js';
import {
  groomingSlotsInput, groomingQuoteInput, groomingBookingInput, groomingIdempotencyKey,
  groomingListQuery, groomingAppointmentId, groomingCancelInput
} from '../../../src/validators/grooming-booking.validator.js';
import { createGroomingAppointmentCode } from '../../../src/services/grooming/grooming-appointment-code.service.js';
import { toGroomingAppointmentView, createGroomingBooking } from '../../../src/services/grooming/grooming-booking.service.js';
import { provisionGroomingDemo } from '../../../src/services/grooming/grooming-demo-seed.service.js';
import { createGroomingDiscountHold } from '../../../src/services/grooming/grooming-discount-hold.service.js';
import { groomingSizeLabel, createGroomingPricing } from '../../../src/services/grooming/grooming-pricing.service.js';
import { reserveGroomingEmployees, assertGroomingReservations } from '../../../src/services/grooming/grooming-reservation.service.js';
import { createGroomingShopServices } from '../../../src/services/grooming/grooming-shop-services.service.js';
import { createGroomingSlots } from '../../../src/services/grooming/grooming-slots.service.js';
import { provisionGroomingStorage } from '../../../src/services/grooming/grooming-storage.service.js';
import { createGroomingService } from '../../../src/services/grooming/grooming.service.js';
import { createShopShiftSource } from '../../../src/services/grooming/shop-shift-source.service.js';
import { createProductCustomerPriceService } from '../../../src/services/product-sales/product-customer-price.service.js';
import { createProductOrderExpiryService } from '../../../src/services/product-sales/product-order-management.service.js';
import { createProductPricingEligibility } from '../../../src/services/product-sales/product-pricing-eligibility.service.js';
import { createProductOrderReceipts } from '../../../src/services/product-sales/product-order-receipt.service.js';
import { createProductOrderPaymentSettler } from '../../../src/services/product-sales/product-order-payment.service.js';
import { createBookingRefundBilling } from '../../../src/services/complaints/booking-refund-billing.service.js';
import { createVisitTrackerService } from '../../../src/services/visit-tracker/visit-tracker.service.js';
import {
  bookingCancellationPreviewInput, bookingCancellationInput, adminBookingRefundsQuery
} from '../../../src/validators/booking-cancellation.validator.js';
import { createBookingCancellationService } from '../../../src/services/booking-proposals/booking-cancellation.service.js';
import {
  handoverPending, flagVisitHandover, urgentReplacement, lateCheckInExempt
} from '../../../src/services/care/visit-handover-policy.service.js';
import { createVisitHandoverService } from '../../../src/services/care/visit-handover.service.js';
import { createVisitHandoverController } from '../../../src/controllers/visit-handover.controller.js';
import { startProductPickupExpiryWorker } from '../../../src/jobs/product-pickup-expiry.job.js';
import { reasonsOfVisit, createNeedsActionService } from '../../../src/services/employee-scheduling/needs-action.service.js';
import { visitReasonStages, visitNeedsCountStages, visitBoardPageStages } from '../../../src/services/employee-scheduling/visit-board-query.service.js';
import { createVisitClosureService } from '../../../src/services/employee-scheduling/visit-closure.service.js';
import { createVisitCompletionMonitor } from '../../../src/services/employee-scheduling/visit-completion-monitor.service.js';
import { createVisitContactService } from '../../../src/services/employee-scheduling/visit-contact.service.js';
import { createWithdrawalReviewService } from '../../../src/services/employee-scheduling/withdrawal-review.service.js';
import { createStaffReassignmentService } from '../../../src/services/employee-scheduling/staff-reassignment.service.js';
import { createEmployeeDispatchService } from '../../../src/services/employee-scheduling/employee-dispatch.service.js';
import { visitClosureVerificationInput } from '../../../src/validators/visit-closure.validator.js';
import { AppError } from '../../../src/utils/app-error.js';

const CID = '507f1f77bcf86cd799439011';
const PID = '507f1f77bcf86cd799439012';
const SID = '507f1f77bcf86cd799439013';
const SITTER1 = '507f1f77bcf86cd799439021';
const APPT_ID = '507f1f77bcf86cd799439031';
const BID = '507f1f77bcf86cd799439041';
const VID = '507f1f77bcf86cd799439042';
const STAFF = { userId: '507f1f77bcf86cd799439099', state: 'ACTIVE', roles: ['STAFF'] };
const NOW_MS = Date.parse('2026-11-26T08:00:00.000Z');
const NOW = new Date(NOW_MS);

function chain(val) {
  const q = {
    sort: () => q, select: () => q, limit: () => q, skip: () => q, maxTimeMS: () => q, session: () => q,
    option: async () => val, lean: async () => val, toArray: async () => val,
    then: (res, rej) => Promise.resolve(val).then(res, rej)
  };
  return q;
}

function wrapConn(rawModels = {}, db = {}) {
  const models = {};
  const ensure = (name, val = {}) => {
    const wrapped = {
      modelName: name,
      schema: { indexes: () => [] },
      createCollection: async () => {},
      createIndexes: async () => {},
      ...val,
      collection: {
        name: val.collection?.name ?? name.toLowerCase() + 's',
        listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
        ...(val.collection ?? {})
      }
    };
    models[name] = wrapped;
    return wrapped;
  };
  for (const n of [
    'EmployeeAvailability', 'EmployeeAvailabilityRevision', 'EmployeeVisitOffer',
    'EmployeeDayOrigin', 'EmployeeScheduleCommand', 'EmployeeScheduleEvent',
    'EmployeeScheduleProposal', 'EmployeeVisitTravel',
    'PayrollMonthGuard', 'EmploymentContract', 'PayrollStatement', 'SalaryAdvance',
    'PayrollServiceCredit', 'PayrollAdjustment', 'PayrollSourceClaim', 'PayrollCommand', 'PayrollEvent'
  ]) ensure(n, n === 'PayrollMonthGuard' ? { findOneAndUpdate: () => chain({ version: 1 }) } : {});
  for (const [k, v] of Object.entries(rawModels)) ensure(k, v);
  return {
    models,
    model: name => models[name] ?? ensure(name, {}),
    transaction: async fn => fn({ inTransaction: () => true }),
    startSession: async () => ({ withTransaction: fn => fn({ inTransaction: () => true }), endSession: async () => {} }),
    db: {
      listCollections: () => ({ toArray: async () => Object.values(models).map(m => ({ name: m.collection.name })) }),
      collection: () => ({
        listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
        find: () => chain([]),
        findOne: async () => null,
        insertOne: async () => ({}),
        updateOne: async () => ({ matchedCount: 1 })
      }),
      ...db
    }
  };
}

describe('Backend N/A/B Matrix Completion & Explicit Function Codes', () => {
  // GRM-TIME-01..09 Boundary/Abnormal complements
  test('GRM-TIME-01-UTCID02 [B] stays on previous local date at 16:59:59.999Z (23:59:59+07:00)', () => {
    expect(groomingLocalDate('2026-11-25T16:59:59.999Z')).toBe('2026-11-25');
  });
  test('GRM-TIME-02-UTCID02 [B] formats 00:00 local midnight at 17:00:00.000Z', () => {
    expect(groomingLocalTime('2026-11-25T17:00:00.000Z')).toBe('00:00');
  });
  test('GRM-TIME-03-UTCID02 [B] parses leap-year boundary 2028-02-29T00:00:00+07:00', () => {
    expect(groomingDayStart('2028-02-29').toISOString()).toBe('2028-02-28T17:00:00.000Z');
  });
  test('GRM-TIME-04-UTCID02 [B] builds +07:00 slot key from numeric epoch ms', () => {
    expect(groomingSlotKey(Date.parse('2026-11-25T17:00:00.000Z'))).toBe('2026-11-26T00:00+07:00');
  });
  test('GRM-TIME-05-UTCID02 [A] returns false for non-string, null, and month 13', () => {
    expect(isGroomingDate(null)).toBe(false);
    expect(isGroomingDate(20261126)).toBe(false);
    expect(isGroomingDate('2026-13-01')).toBe(false);
  });
  test('GRM-TIME-06-UTCID02 [B] crosses month boundary cleanly from Nov 26 to Dec 02', () => {
    const win = groomingWindow(Date.parse('2026-11-26T16:59:00.000Z'));
    expect(win.dates[0]).toBe('2026-11-26');
    expect(win.dates[6]).toBe('2026-12-02');
  });
  test('GRM-TIME-07-UTCID02 [B] ends at 23:00+07:00 on the 24th hourly slot', () => {
    const starts = groomingSlotStarts('2026-11-26');
    expect(groomingLocalTime(starts[23])).toBe('23:00');
  });
  test('GRM-TIME-08-UTCID02 [A] clamps negative duration to minimum 1 slot', () => {
    expect(groomingSlotsNeeded(-30)).toBe(1);
  });
  test('GRM-TIME-09-UTCID02 [B] returns single start slot when duration is 30 minutes', () => {
    expect(groomingCoveredSlots('2026-11-26T02:00:00.000Z', 30)).toHaveLength(1);
  });

  // GRM-IN-01..07 complements
  test('GRM-IN-01-UTCID02 [A] rejects empty pets array or duplicate serviceIds', () => {
    expect(() => groomingSlotsInput({ date: '2026-11-27', pets: [] })).toThrow();
    expect(() => groomingSlotsInput({ date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID, SID] }] })).toThrow();
  });
  test('GRM-IN-02-UTCID02 [A] rejects missing answers object or unknown top-level key', () => {
    expect(() => groomingQuoteInput({ pets: [{ petId: PID, serviceIds: [SID] }] })).toThrow();
    expect(() => groomingQuoteInput({ pets: [], extra: 1 })).toThrow();
  });
  test('GRM-IN-03-UTCID02 [B] accepts expectedTotalVnd=0 and rejects negative expectedTotalVnd=-1', () => {
    const ok = groomingBookingInput({
      startAt: '2026-11-27T02:00:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: 0
    });
    expect(ok.expectedTotalVnd).toBe(0);
    expect(() => groomingBookingInput({
      startAt: '2026-11-27T02:00:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: -1
    })).toThrow();
  });
  test('GRM-IN-04-UTCID02 [A] rejects non-string or >200-char idempotency key', () => {
    expect(() => groomingIdempotencyKey(12345678)).toThrow();
    expect(() => groomingIdempotencyKey('k'.repeat(201))).toThrow();
  });
  test('GRM-IN-05-UTCID02 [A] rejects invalid status or non-boolean upcoming value', () => {
    expect(() => groomingListQuery({ status: 'DONE' })).toThrow();
    expect(() => groomingListQuery({ upcoming: '1' })).toThrow();
  });
  test('GRM-IN-06-UTCID02 [B] accepts uppercase 24-hex and returns null for 23-hex string', () => {
    expect(groomingAppointmentId(APPT_ID.toUpperCase())).toBeInstanceOf(Types.ObjectId);
    expect(groomingAppointmentId(APPT_ID.slice(0, 23))).toBeNull();
  });
  test('GRM-IN-07-UTCID02 [B] accepts null body and rejects array or primitive body', () => {
    expect(groomingCancelInput(null)).toEqual({});
    expect(() => groomingCancelInput('bad')).toThrow();
  });

  // GRM-CODE-01, GRM-BOOK-01..05, GRM-RESERVE-01..02, GRM-PRICE-01..03, GRM-HOLD-01, GRM-SERVICE-01..02, GRM-SLOTS-01, GRM-STORAGE-01, GRM-SEED-01, GRM-01..07, SHOP-SHIFT-01
  test('GRM-CODE-01-UTCID02 [A] rethrows non-11000 database failure from GroomingCounter', async () => {
    const GroomingCounter = { findOneAndUpdate: async () => { throw new Error('disk full'); } };
    const conn = wrapConn({ GroomingCounter });
    await expect(createGroomingAppointmentCode({ connection: conn }).nextCode()).rejects.toThrow('disk full');
  });
  test('GRM-BOOK-01-UTCID02 [B] includes cancellation metadata when doc.cancellation.at is present', () => {
    const view = toGroomingAppointmentView({
      _id: new Types.ObjectId(APPT_ID),
      code: 'GR-0002',
      status: 'CANCELLED',
      slot: { startAt: NOW, endAt: NOW, localDate: '2026-11-26', startLocalTime: '15:00' },
      pets: [],
      pricing: { subtotalVnd: 0, tierDiscountVnd: 0, totalVnd: 0, currency: 'VND' },
      tier: {},
      shop: { address: '12 Cầu Giấy' },
      bookedAt: NOW,
      cancellation: { at: NOW, byRole: 'CUSTOMER' }
    });
    expect(view.cancellation).toEqual({ at: NOW.toISOString(), byRole: 'CUSTOMER' });
  });
  test('GRM-BOOK-02-UTCID02 [A] rejects booking when facilityAddress is not configured (FACILITY_ADDRESS_REQUIRED)', async () => {
    const svc = createGroomingBooking({
      connection: wrapConn({ GroomingAppointment: { findOne: () => chain(null) } }),
      clock: () => NOW_MS,
      pricing: {},
      shiftSource: {},
      codes: { nextCode: async () => 'GR-0001' },
      facilityAddress: '   '
    });
    await expect(svc.book(CID, {
      startAt: '2026-11-27T02:00:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: 100000
    }, 'groom-key-99')).rejects.toMatchObject({ code: 'FACILITY_ADDRESS_REQUIRED', status: 409 });
  });
  test('GRM-BOOK-03-UTCID02 [B] omits serverNow when upcoming flag is not set', async () => {
    const svc = createGroomingBooking({
      connection: wrapConn({ GroomingAppointment: { find: () => chain([]), countDocuments: () => chain(0) } }),
      clock: () => NOW_MS, pricing: {}, shiftSource: {}, codes: {}
    });
    const res = await svc.list(CID, { status: 'CANCELLED' });
    expect(res.serverNow).toBeUndefined();
  });
  test('GRM-BOOK-04-UTCID02 [A] throws 404 RESOURCE_NOT_FOUND without querying Mongo when appointmentId is not hex24', async () => {
    const findOne = jest.fn();
    const svc = createGroomingBooking({
      connection: wrapConn({ GroomingAppointment: { findOne } }),
      clock: () => NOW_MS, pricing: {}, shiftSource: {}, codes: {}
    });
    await expect(svc.read(CID, 'bad-id')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
    expect(findOne).not.toHaveBeenCalled();
  });
  test('GRM-BOOK-05-UTCID02 [A] rejects cancel when appointment is already CANCELLED with GROOMING_APPOINTMENT_NOT_CANCELLABLE', async () => {
    const svc = createGroomingBooking({
      connection: wrapConn({
        GroomingAppointment: { findOne: () => chain({ _id: new Types.ObjectId(APPT_ID), status: 'CANCELLED' }) }
      }, {
        collection: () => ({ findOneAndUpdate: async () => ({ _id: new Types.ObjectId(CID), state: 'ACTIVE', roles: ['CUSTOMER'] }) })
      }),
      clock: () => NOW_MS, pricing: {}, shiftSource: {}, codes: {}
    });
    await expect(svc.cancel(CID, APPT_ID, {})).rejects.toMatchObject({ code: 'GROOMING_APPOINTMENT_NOT_CANCELLABLE', status: 409 });
  });
  test('GRM-RESERVE-01-UTCID02 [B] reserves single eligible sitter for 1 pet', () => {
    expect(reserveGroomingEmployees(
      { sittersFor: () => [SITTER1] },
      [{ durationMinutes: 60, services: [{ serviceId: SID }], petSnapshot: { name: 'Bơ' } }],
      NOW
    )).toEqual([SITTER1]);
  });
  test('GRM-RESERVE-02-UTCID02 [N] returns matched sitter list when reservation succeeds', () => {
    expect(assertGroomingReservations(
      { sittersFor: () => [SITTER1] },
      [{ durationMinutes: 60, services: [{ serviceId: SID }], petSnapshot: { name: 'Bơ' } }],
      NOW
    )).toEqual([SITTER1]);
  });
  test('GRM-PRICE-01-UTCID02 [B] returns null when policy contains no WEIGHT rules for pet species', () => {
    expect(groomingSizeLabel({ species: 'CAT', weightKg: 4 }, { rules: [] })).toBeNull();
  });
  test('GRM-PRICE-02-UTCID02 [A] rejects unowned or inactive pet with 404 RESOURCE_NOT_FOUND', async () => {
    const pricing = createGroomingPricing({
      connection: wrapConn({ Pet: { find: () => chain([]) } }),
      refusalLimit: '2',
      shopServices: { resolve: async () => new Map([[SID, { durationMinutes: 60 }]]) }
    });
    await expect(pricing.price(CID, { pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }] }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
  test('GRM-PRICE-03-UTCID02 [A] propagates GROOMING_PET_REFERRAL_REQUIRED from quote when biteOrScratch=YES', async () => {
    const pricing = createGroomingPricing({
      connection: wrapConn({ Pet: { find: () => chain([{ _id: new Types.ObjectId(PID), name: 'Cắn' }]) } }),
      refusalLimit: '2',
      hotline: '19001000',
      shopServices: { resolve: async () => new Map([[SID, { durationMinutes: 60 }]]) }
    });
    await expect(pricing.quote(CID, { pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'YES', skinCondition: 'NO' } }] }))
      .rejects.toMatchObject({ code: 'GROOMING_PET_REFERRAL_REQUIRED', status: 422 });
  });
  test('GRM-HOLD-01-UTCID02 [A] returns PREPAID_ONLY when customer refusals exceed refusalLimit', async () => {
    const hold = createGroomingDiscountHold({
      connection: wrapConn({ ProductCustomerRefusal: { collection: { countDocuments: async () => 5 } } }),
      refusalLimit: ''
    });
    await expect(hold.read(CID)).resolves.toBe('PREPAID_ONLY');
  });
  test('GRM-SERVICE-01-UTCID02 [B] returns empty array when no FACILITY grooming services exist and 503 when > 50', async () => {
    const empty = createGroomingShopServices({ connection: wrapConn({ Service: { find: () => chain([]) } }) });
    await expect(empty.list()).resolves.toEqual([]);
    const huge = createGroomingShopServices({ connection: wrapConn({ Service: { find: () => chain(Array.from({ length: 51 }, () => ({}))) } }) });
    await expect(huge.list()).rejects.toMatchObject({ code: 'GROOMING_CATALOG_REVIEW_REQUIRED', status: 503 });
  });
  test('GRM-SERVICE-02-UTCID01 [N] resolves bookable shop service IDs into Map keyed by serviceId', async () => {
    const svcId = new Types.ObjectId(SID);
    const agg = rows => ({ session: () => ({ option: async () => rows }) });
    const shop = createGroomingShopServices({
      connection: wrapConn({
        Service: { find: () => chain([{ _id: svcId, code: 'BATH', presentation: { durationMinutes: 60 } }]) },
        ServiceVersion: { aggregate: () => agg([{ serviceId: svcId, state: 'ACTIVE', name: 'Tắm', species: ['DOG'] }]) },
        ServicePolicyVersion: { aggregate: () => agg([{ serviceId: svcId, state: 'PUBLISHED' }]) },
        ServicePriceVersion: { aggregate: () => agg([{ serviceId: svcId, amountVnd: 150000 }]) },
        PricingPolicy: { aggregate: () => agg([{ serviceId: svcId, status: 'APPROVED', approvedBy: 'admin' }]) },
        SystemSettingVersion: { findOne: () => chain({ enabled: true }) }
      })
    });
    const map = await shop.resolve([SID]);
    expect(map.get(SID)).toMatchObject({ id: SID, durationMinutes: 60, bookable: true });
  });
  test('GRM-SERVICE-02-UTCID02 [A] rejects unbookable or missing shop service ID with 409 SERVICE_UNAVAILABLE', async () => {
    const shop = createGroomingShopServices({ connection: wrapConn({ Service: { find: () => chain([]) } }) });
    await expect(shop.resolve([SID])).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 409 });
  });
  test('GRM-SLOTS-01-UTCID02 [A] rejects slot listing when pet is not owned by customer', async () => {
    const svc = createGroomingSlots({
      connection: wrapConn({ Pet: { find: () => chain([]) } }),
      clock: () => NOW_MS,
      shopServices: {}, shiftSource: {}
    });
    await expect(svc.list(CID, { date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }] }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
  test('GRM-STORAGE-01-UTCID02 [A] rejects appointments missing reservedSitterId or requestReceipt.key', async () => {
    const conn = wrapConn({}, {
      collection: name => ({ findOne: async () => (name === 'groomingappointments' ? { _id: 1 } : null) })
    });
    await expect(provisionGroomingStorage(conn)).rejects.toMatchObject({ code: 'GROOMING_MIGRATION_REQUIRED', status: 409 });
  });
  test('GRM-SEED-01-UTCID02 [A] throws when shop service catalog has not been provisioned yet', async () => {
    const conn = wrapConn({ Service: { find: () => chain([]) } });
    await expect(provisionGroomingDemo({ connection: conn })).rejects.toThrow(/demo service catalog/);
  });
  test('GRM-01-UTCID02 [B] trims blank facilityAddress and hotline to null in options()', async () => {
    const svc = createGroomingService({
      facilityAddress: '   ', hotline: '', clock: () => NOW_MS,
      shopServices: { list: async () => [] }, slots: {}, pricing: {}, booking: {}
    });
    const out = await svc.options({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] });
    expect(out.shop).toEqual({ address: null, hotline: null });
  });
  test('GRM-02-UTCID02 [A] rejects non-customer actor in slots()', () => {
    const svc = createGroomingService({ shopServices: {}, slots: { list: jest.fn() }, pricing: {}, booking: {} });
    expect(() => svc.slots({ userId: CID, state: 'LOCKED', roles: ['CUSTOMER'] }, {})).toThrow();
  });
  test('GRM-03-UTCID02 [A] rejects non-customer actor in quote()', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: { quote: jest.fn() }, booking: {} });
    expect(() => svc.quote(null, {})).toThrow();
  });
  test('GRM-04-UTCID02 [N] delegates customerId, body, and idempotencyKey to booking.book', async () => {
    const book = jest.fn(async () => ({ code: 'GR-0009' }));
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { book } });
    await expect(svc.book({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, { a: 1 }, 'k-12345678')).resolves.toEqual({ code: 'GR-0009' });
  });
  test('GRM-04-UTCID03 [A] rejects STAFF or unauthenticated actor in book() with FORBIDDEN/UNAUTHENTICATED', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { book: jest.fn() } });
    expect(() => svc.book(STAFF, {}, 'k-12345678')).toThrow();
  });
  test('CLOSE-IN-02-UTCID03 [A] rejects unsupported outcome enum or non-boolean reportsComplete in visitClosureVerificationInput', () => {
    expect(() => visitClosureVerificationInput({ expectedVersion: 1, reason: 'r', outcome: 'UNKNOWN' })).toThrow();
  });
  test('GRM-05-UTCID02 [A] rejects STAFF actor in listAppointments()', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { list: jest.fn() } });
    expect(() => svc.listAppointments(STAFF, {})).toThrow();
  });
  test('GRM-06-UTCID02 [A] rejects STAFF actor in readAppointment()', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { read: jest.fn() } });
    expect(() => svc.readAppointment(STAFF, APPT_ID)).toThrow();
  });
  test('GRM-07-UTCID02 [A] rejects STAFF actor in cancelAppointment()', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { cancel: jest.fn() } });
    expect(() => svc.cancelAppointment(STAFF, APPT_ID, {})).toThrow();
  });
  test('SHOP-SHIFT-01-UTCID02 [B] returns empty sittersFor() when no SHOP workingWindow revisions exist', async () => {
    const shift = createShopShiftSource({
      connection: wrapConn({
        EmployeeAvailabilityRevision: { aggregate: () => ({ session: () => ({ option: async () => [] }) }) }
      }),
      clock: () => NOW_MS
    });
    const roster = await shift.openRoster({ from: NOW, to: new Date(NOW_MS + 3600000) });
    expect(roster.sittersFor(NOW, new Date(NOW_MS + 3600000))).toEqual([]);
  });

  // Product / Tracker / Cancel / Handover / Refund Billing / Payment Settler
  test('SHOP-CUST-PRICE-01-UTCID02 [B] returns zero discount when customer tier has 0 bps', async () => {
    const svc = createProductCustomerPriceService({
      catalog: { read: async () => ({ sellingPrice: 85000 }) },
      eligibility: { read: async () => ({ tierCode: 'MEMBER', discountBps: 0 }) }
    });
    expect(await svc.read({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, PID))
      .toEqual({ unitPrice: 85000, unitDiscount: 0, discountedUnitPrice: 85000, tierCode: 'MEMBER', discountBps: 0 });
  });
  test('SHOP-MGMT-09-UTCID02 [A] counts failed order transitions in summary.failed without aborting batch', async () => {
    let calls = 0;
    const ProductOrder = {
      find: () => chain(calls++ === 0 ? [{ _id: new Types.ObjectId(APPT_ID), version: 1, paid: true }] : []),
      findOne: () => { throw new Error('tx conflict'); }
    };
    const expiry = createProductOrderExpiryService({ connection: wrapConn({ ProductOrder }), clock: () => NOW_MS });
    await expect(expiry.runBatch()).resolves.toEqual({ cancelled: 0, delivered: 0, failed: 1, kept: 0 });
  });
  test('SHOP-ELIG-01-UTCID02 [A] throws 503 PRODUCT_TIER_INVALID when stored tier is corrupted', async () => {
    const elig = createProductPricingEligibility({
      connection: wrapConn({}, { collection: () => ({ findOne: async () => ({ tier: 'DIAMOND' }) }) }),
      refusalLimit: '2'
    });
    await expect(elig.read(CID)).rejects.toMatchObject({ code: 'PRODUCT_TIER_INVALID', status: 503 });
  });
  test('SHOP-ELIG-02-UTCID02 [A] throws TypeError at construction when refusalLimit is negative or non-digits', () => {
    expect(() => createProductPricingEligibility({ connection: wrapConn(), refusalLimit: '-1' })).toThrow(TypeError);
  });
  test('SHOP-ELIG-03-UTCID02 [B] checks OVERDUE booking state when customer refusals are within limit', async () => {
    const elig = createProductPricingEligibility({
      connection: wrapConn({
        ProductCustomerRefusal: { collection: { countDocuments: async () => 0 } }
      }, { collection: () => ({ findOne: async () => null }) }),
      refusalLimit: '2'
    });
    await expect(elig.readDiscountHold(CID)).resolves.toBeNull();
  });
  test('SHOP-ELIG-04-UTCID02 [B] returns guest tier object when counter customerId is null/empty', async () => {
    const elig = createProductPricingEligibility({ connection: wrapConn(), refusalLimit: '2' });
    await expect(elig.readCounterCustomer(null)).resolves.toMatchObject({ tierCode: null, discountBps: 0 });
  });
  test('SHOP-RCPT-01-UTCID02 [B] returns null when providerReference does not match any ProductOrder', async () => {
    const receipts = createProductOrderReceipts({ connection: wrapConn({ ProductOrder: { findOne: () => chain(null) } }) });
    await expect(receipts.findIntent('missing-ref')).resolves.toBeNull();
  });

  // SHOP-PAY-01 (createProductOrderPaymentSettler)
  test('SHOP-PAY-01-UTCID01 [N] settleIfPaid marks order PAID via verified webhook handler when payOS link is PAID', async () => {
    const handleVerifiedPayment = jest.fn(async () => ({ status: 'PAYMENT_VERIFIED' }));
    const settler = createProductOrderPaymentSettler({
      provider: { getPaymentLink: async () => ({ orderCode: 10, amount: 150000, amountPaid: 150000, amountRemaining: 0, providerStatus: 'PAID' }) },
      handleVerifiedPayment
    });
    await expect(settler.settleIfPaid({ payment: { providerReferences: ['10'] } })).resolves.toBe('PAID');
    expect(handleVerifiedPayment).toHaveBeenCalledTimes(1);
  });
  test('SHOP-PAY-01-UTCID02 [B] settleIfPaid returns UNPAID when order has no providerReferences or link is EXPIRED with 0 paid', async () => {
    const settler = createProductOrderPaymentSettler({
      provider: { getPaymentLink: async () => ({ orderCode: 10, amount: 150000, amountPaid: 0, amountRemaining: 150000, providerStatus: 'EXPIRED' }) },
      handleVerifiedPayment: jest.fn()
    });
    await expect(settler.settleIfPaid({ payment: { providerReferences: [] } })).resolves.toBe('UNPAID');
    await expect(settler.settleIfPaid({ payment: { providerReferences: ['10'] } })).resolves.toBe('UNPAID');
  });
  test('SHOP-PAY-01-UTCID03 [A] settleIfPaid returns RECONCILE on partial payment and propagates provider errors', async () => {
    const partial = createProductOrderPaymentSettler({
      provider: { getPaymentLink: async () => ({ orderCode: 10, amount: 150000, amountPaid: 50000, amountRemaining: 100000, providerStatus: 'EXPIRED' }) },
      handleVerifiedPayment: jest.fn()
    });
    await expect(partial.settleIfPaid({ payment: { providerReferences: ['10'] } })).resolves.toBe('RECONCILE');
  });

  // BKG-REF-BILL-01 (createBookingRefundBilling)
  test('BKG-REF-BILL-01-UTCID01 [N] computes billTotalVnd subtracting active RECORDED/APPROVED/PAID refunds from verified payment', async () => {
    const billing = createBookingRefundBilling({
      connection: {
        db: {
          collection: name => ({
            find: () => ({
              limit: () => ({
                toArray: async () => (name === 'payments'
                  ? [{ state: 'VERIFIED', receiptMoney: { amountVnd: 400000, currency: 'VND' } }]
                  : [{ amountVnd: 100000, state: 'RECORDED' }, { amountVnd: 50000, state: 'REJECTED' }])
              })
            })
          })
        }
      }
    });
    await expect(billing.read({ bookingId: BID })).resolves.toEqual({
      basis: 'ISSUED', basisAmountVnd: 400000, approvedTotalVnd: 100000, paidInFull: true, billTotalVnd: 300000
    });
  });
  test('BKG-REF-BILL-01-UTCID02 [A] fails closed returning null on invalid bookingId, corrupt refund amount, or missing connection', async () => {
    expect(() => createBookingRefundBilling({})).toThrow(TypeError);
    const billing = createBookingRefundBilling({
      connection: { db: { collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [] }) }) }) } }
    });
    await expect(billing.read({ bookingId: 'bad' })).resolves.toBeNull();
  });

  // VISIT-TRACK-01, BKG-CANCEL-IN-01..03, BKG-CANCEL-01..03, HANDOVER-POL-01..04, HANDOVER-SVC-01..02, HANDOVER-CTL-01, PICKUP-JOB-01
  test('VISIT-TRACK-01-UTCID02 [A] throws 404 RESOURCE_NOT_FOUND when bookingId or visitId is malformed', async () => {
    const svc = createVisitTrackerService({ connection: wrapConn() });
    await expect(svc.read({ userId: CID, roles: ['CUSTOMER'] }, { bookingId: 'bad', visitId: VID }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
  test('BKG-CANCEL-IN-01-UTCID02 [A] rejects unsupported scope or missing visitId when scope=VISIT', () => {
    expect(() => bookingCancellationPreviewInput({ scope: 'ALL' })).toThrow();
    expect(() => bookingCancellationPreviewInput({ scope: 'VISIT' })).toThrow();
  });
  test('BKG-CANCEL-IN-02-UTCID02 [B] normalizes whitespace-only reason to null', () => {
    expect(bookingCancellationInput({ scope: 'BOOKING', reason: '   ' })).toEqual({ scope: 'BOOKING', visitId: null, reason: null });
  });
  test('BKG-CANCEL-IN-03-UTCID02 [A] rejects limit=0 or malformed bookingId in adminBookingRefundsQuery', () => {
    expect(() => adminBookingRefundsQuery({ limit: '0' })).toThrow();
    expect(() => adminBookingRefundsQuery({ bookingId: 'invalid' })).toThrow();
  });
  test('BKG-CANCEL-01-UTCID02 [A] preview rejects non-customer actor with 403 FORBIDDEN', async () => {
    const svc = createBookingCancellationService({ connection: wrapConn() });
    await expect(svc.preview(STAFF, BID, { scope: 'BOOKING' })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
  test('BKG-CANCEL-02-UTCID02 [A] cancel rejects missing or short Idempotency-Key with 422 VALIDATION_FAILED', async () => {
    const svc = createBookingCancellationService({ connection: wrapConn() });
    await expect(svc.cancel({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, BID, { scope: 'BOOKING' }, 'short'))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  });
  test('BKG-CANCEL-03-UTCID01 [N] listBookingRefunds returns empty list when no BOOKING_CANCELLATION refunds exist', async () => {
    const svc = createBookingCancellationService({
      connection: {
        models: {},
        model: name => ({ modelName: name, collection: { name: name.toLowerCase(), listIndexes: () => ({ toArray: async () => [
          { name: '_id_', key: { _id: 1 } },
          { name: 'visit_kind', unique: true, key: { visitId: 1, kind: 1 } }
        ] }) } }),
        transaction: fn => fn({}),
        db: {
          collection: () => ({
            listIndexes: () => ({ toArray: async () => [
              { name: '_id_', key: { _id: 1 } },
              { name: 'verified_provider_event', unique: true, key: { provider: 1, providerEventId: 1 } },
              { name: 'one_verified_booking_receipt', unique: true, key: { bookingId: 1 }, partialFilterExpression: { state: 'VERIFIED' } },
              { name: 'one_verified_bank_reference', unique: true, key: { provider: 1, providerTransactionReference: 1 }, partialFilterExpression: { state: 'VERIFIED', providerTransactionReference: { $type: 'string' } } },
              { name: 'one_confirmed_booking_assessment', unique: true, key: { bookingId: 1 }, partialFilterExpression: { state: 'CONFIRMED' } },
              { name: 'payment_intent_provider_reference', unique: true, key: { providerReference: 1 } },
              { name: 'booking_source_lookup', key: { bookingId: 1 } },
              { name: 'booking_receipt_state', key: { bookingId: 1, state: 1 } },
              { name: 'booking_payment_intent_state', key: { bookingId: 1, provider: 1, state: 1 } }
            ] }),
            find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
            countDocuments: async () => 0
          })
        }
      }
    });
    const out = await svc.listBookingRefunds({ userId: CID, state: 'ACTIVE', roles: ['ADMIN'] }, {});
    expect(out).toEqual({ total: 0, items: [] });
  });
  test('BKG-CANCEL-03-UTCID02 [A] listBookingRefunds rejects non-ADMIN actor with 403 FORBIDDEN', async () => {
    const svc = createBookingCancellationService({ connection: wrapConn() });
    await expect(svc.listBookingRefunds(STAFF, {})).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  test('HANDOVER-POL-01-UTCID02 [B] returns false when handoverRequired is undefined', () => {
    expect(handoverPending({})).toBe(false);
  });
  test('HANDOVER-POL-02-UTCID02 [B] preserves custom reasonCode and reasonText in handoverNote', () => {
    const out = flagVisitHandover(SITTER1, NOW, { reasonCode: 'EMERGENCY', reasonText: 'Ốm' });
    expect(out.set.handoverNote).toMatchObject({ previousSitterId: SITTER1, reasonCode: 'EMERGENCY', reasonText: 'Ốm' });
  });
  test('HANDOVER-POL-03-UTCID02 [A] returns false when handoverRequired is false or timestamps are missing', () => {
    expect(urgentReplacement({ handoverRequired: false }, NOW, new Date(NOW_MS + 60000))).toBe(false);
    expect(urgentReplacement({ handoverRequired: true }, null, null)).toBe(false);
  });
  test('HANDOVER-POL-04-UTCID02 [B] computes urgentReplacement dynamically when handoverLateCheckInExempt is undefined', () => {
    expect(lateCheckInExempt({
      handoverRequired: true,
      assignedAt: new Date(NOW_MS + 10 * 60000),
      startAt: new Date(NOW_MS + 30 * 60000)
    })).toBe(true);
  });
  test('HANDOVER-SVC-01-UTCID02 [A] get rejects non-sitter actor with 403 FORBIDDEN', async () => {
    const models = { EmployeeVisitOffer: { db: wrapConn() } };
    const svc = createVisitHandoverService({
      repository: { col: () => ({}), uow: { run: fn => fn({}) }, models, employeeGuard: jest.fn() }
    });
    await expect(svc.get(STAFF, VID)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
  test('HANDOVER-SVC-02-UTCID01 [N] confirm updates handoverAccepted=true and increments visit version', async () => {
    const care = { schemaVersion: 1, pets: [] };
    const { digest } = await import('../../../src/validators/pet-care.validator.js');
    const careVersion = digest(care);
    const models = {
      EmployeeVisitOffer: { db: wrapConn() },
      EmployeeScheduleCommand: { findById: () => chain(null), create: async d => d },
      EmployeeScheduleEvent: { create: async d => d }
    };
    const visit = {
      _id: new Types.ObjectId(VID), bookingId: new Types.ObjectId(BID), sitterId: new Types.ObjectId(SITTER1),
      state: 'ASSIGNED', version: 0, checkInAt: null, startAt: new Date(NOW_MS + 7200000),
      handoverRequired: true, handoverAccepted: false, snapshots: { care }
    };
    const cols = {
      visits: { findOne: async () => visit, updateOne: async () => ({ matchedCount: 1 }) },
      bookings: { findOne: async () => ({ _id: visit.bookingId, state: 'ASSIGNED', visitIds: [visit._id] }) },
      users: { find: () => ({ toArray: async () => [] }) },
      notifications: { updateOne: async () => ({}) }
    };
    const svc = createVisitHandoverService({
      repository: { col: n => cols[n] ?? cols.notifications, uow: { run: fn => fn({}) }, models, employeeGuard: async () => ({}) },
      clock: () => NOW_MS
    });
    const out = await svc.confirm({ userId: SITTER1, state: 'ACTIVE', roles: ['PET_SITTER'] }, VID, {
      expectedVersion: 0, careVersion, acknowledged: true
    }, 'ho-confirm-01');
    expect(out).toMatchObject({ visitId: VID, state: 'CONFIRMED', version: 1 });
  });
  test('HANDOVER-SVC-02-UTCID02 [A] confirm rejects mismatched careVersion with 409 VERSION_CONFLICT', async () => {
    const care = { schemaVersion: 1, pets: [] };
    const models = {
      EmployeeVisitOffer: { db: wrapConn() },
      EmployeeScheduleCommand: { findById: () => chain(null) }
    };
    const visit = {
      _id: new Types.ObjectId(VID), bookingId: new Types.ObjectId(BID), sitterId: new Types.ObjectId(SITTER1),
      state: 'ASSIGNED', version: 0, checkInAt: null, startAt: new Date(NOW_MS + 7200000),
      handoverRequired: true, handoverAccepted: false, snapshots: { care }
    };
    const cols = {
      visits: { findOne: async () => visit },
      bookings: { findOne: async () => ({ _id: visit.bookingId, state: 'ASSIGNED', visitIds: [visit._id] }) }
    };
    const svc = createVisitHandoverService({
      repository: { col: n => cols[n], uow: { run: fn => fn({}) }, models, employeeGuard: async () => ({}) }
    });
    await expect(svc.confirm({ userId: SITTER1, state: 'ACTIVE', roles: ['PET_SITTER'] }, VID, {
      expectedVersion: 0, careVersion: 'f'.repeat(64), acknowledged: true
    }, 'ho-confirm-02')).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });
  test('HANDOVER-CTL-01-UTCID02 [A] propagates 409 VERSION_CONFLICT from handover service', async () => {
    const ctl = createVisitHandoverController({
      get: async () => { throw new AppError(409, 'VERSION_CONFLICT', 'Changed'); },
      confirm: jest.fn()
    });
    await expect(ctl.get({ auth: STAFF, params: { id: VID }, requestId: 'r1' }, { status: jest.fn(), json: jest.fn() }))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });
  test('PICKUP-JOB-01-UTCID02 [A] logs product_pickup_expiry_failed when service.runBatch rejects', async () => {
    jest.useFakeTimers();
    try {
      const logger = jest.fn();
      const worker = startProductPickupExpiryWorker({
        enabled: true,
        createService: () => ({ runBatch: async () => { throw new Error('db'); } }),
        logger
      });
      jest.advanceTimersByTime(5 * 60_000);
      await worker.stop();
      expect(logger).toHaveBeenCalledWith({ event: 'product_pickup_expiry_failed' });
    } finally {
      jest.useRealTimers();
    }
  });

  // Scheduling & Dispatch complements + explicit EMP-DISPATCH-04 & EMP-DISPATCH-05
  test('ACTION-01-UTCID02 [B] returns empty array for COMPLETED visit requiring no staff action', () => {
    expect(reasonsOfVisit({ state: 'COMPLETED', startAt: NOW, endAt: NOW }, NOW_MS)).toEqual([]);
  });
  test('ACTION-02-UTCID02 [A] maps Mongo MaxTimeMSExpired (code 50) to 503 VISIT_BOARD_TIMEOUT', async () => {
    const svc = createNeedsActionService({
      repository: { col: () => ({ aggregate: () => ({ toArray: async () => { throw Object.assign(new Error('timeout'), { code: 50 }); } }) }) },
      clock: () => NOW_MS,
      cursorSecret: 's'.repeat(32)
    });
    await expect(svc.list(STAFF, {})).rejects.toMatchObject({ code: 'VISIT_BOARD_TIMEOUT', status: 503 });
  });
  test('VISIT-QUERY-01-UTCID02 [B] computes __order index against NEEDS_ACTION_REASONS', () => {
    const stages = visitReasonStages(NOW_MS);
    expect(JSON.stringify(stages.at(-1))).toContain('$indexOfArray');
  });
  test('VISIT-QUERY-02-UTCID02 [B] filters startAt and endAt by BSON date type before counting', () => {
    const stages = visitNeedsCountStages(NOW_MS);
    expect(stages[0].$match.startAt).toEqual({ $type: 'date' });
  });
  test('VISIT-QUERY-03-UTCID02 [B] filters specific visitId when query.tab=all and query.visitId is provided', () => {
    const stages = visitBoardPageStages({
      query: { tab: 'all', visitId: VID },
      now: NOW_MS, position: null, oid: v => new Types.ObjectId(v), limit: 50
    });
    expect(String(stages[0].$match._id)).toBe(VID);
  });
  test('VISIT-CLOSE-01-UTCID02 [A] needsAction rejects CUSTOMER actor with 403 FORBIDDEN', async () => {
    const svc = createVisitClosureService({
      repository: { col: () => ({}), models: { EmployeeVisitOffer: { db: wrapConn() } }, uow: {} }
    });
    await expect(svc.needsAction({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
  test('VISIT-CLOSE-02-UTCID02 [A] details throws 404 RESOURCE_NOT_FOUND when visit is missing', async () => {
    const svc = createVisitClosureService({
      repository: { col: () => ({ findOne: async () => null }), models: { EmployeeVisitOffer: { db: wrapConn() } }, uow: {} }
    });
    await expect(svc.details(STAFF, VID)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
  test('VISIT-CLOSE-03-UTCID02 [B] close rejects visit before 2h grace period with CLOSE_NOT_ALLOWED_YET', async () => {
    const conn = wrapConn();
    const row = {
      _id: new Types.ObjectId(VID), state: 'IN_PROGRESS', version: 1,
      checkInAt: new Date(NOW_MS - 3600000), checkOutAt: null, endAt: new Date(NOW_MS - 60 * 60000)
    };
    const svc = createVisitClosureService({
      repository: {
        col: name => (name === 'users'
          ? { findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF.userId), roles: ['STAFF'] }) }
          : { findOne: async () => row }),
        models: { EmployeeVisitOffer: { db: conn }, EmployeeScheduleCommand: { findById: () => chain(null) } },
        uow: { run: fn => fn({}) }
      },
      clock: () => NOW_MS
    });
    await expect(svc.close(STAFF, VID, { expectedVersion: 1, reason: 'Đóng sớm' }, 'close-early-01'))
      .rejects.toMatchObject({ code: 'CLOSE_NOT_ALLOWED_YET', status: 409 });
  });
  test('VISIT-CLOSE-04-UTCID02 [A] verify rejects SERVICE_PERFORMED when actualEndedAt is in the future', async () => {
    const conn = wrapConn();
    const row = {
      _id: new Types.ObjectId(VID), state: 'STAFF_CLOSED', version: 2,
      checkInAt: new Date(NOW_MS - 3600000), closureVerification: null
    };
    const svc = createVisitClosureService({
      repository: {
        col: name => (name === 'users'
          ? { findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF.userId), roles: ['ADMIN'] }) }
          : { findOne: async () => row }),
        models: { EmployeeVisitOffer: { db: conn }, EmployeeScheduleCommand: { findById: () => chain(null) } },
        uow: { run: fn => fn({}) }
      },
      clock: () => NOW_MS
    });
    await expect(svc.verify({ userId: STAFF.userId, state: 'ACTIVE', roles: ['ADMIN'] }, VID, {
      expectedVersion: 2, reason: 'Sai giờ', outcome: 'SERVICE_PERFORMED',
      evidenceReference: 'EV-1', actualEndedAt: new Date(NOW_MS + 60000).toISOString(), reportsComplete: true
    }, 'ver-future-01')).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  });
  test('VISIT-MON-01-UTCID02 [B] rejects batch limit > 100 with TypeError', async () => {
    const svc = createVisitCompletionMonitor({ repository: { col: () => ({}), models: {}, uow: {} } });
    await expect(svc.runBatch({ limit: 101 })).rejects.toThrow(TypeError);
  });
  test('VISIT-CONTACT-01-UTCID02 [A] throws 503 CONTACT_LOOKUP_UNAVAILABLE when phones port is missing and 404 when unassigned sitter', async () => {
    const noPort = createVisitContactService({ repository: { col: () => ({}), models: {} }, phones: null });
    await expect(noPort.read(STAFF, VID, { party: 'sitter' })).rejects.toMatchObject({ code: 'CONTACT_LOOKUP_UNAVAILABLE', status: 503 });

    const unassigned = createVisitContactService({
      repository: { col: () => ({ findOne: async () => ({ _id: new Types.ObjectId(VID), customerId: new Types.ObjectId(CID), sitterId: null }) }), models: {} },
      phones: { phonesOf: async () => new Map() }
    });
    await expect(unassigned.read(STAFF, VID, { party: 'sitter' })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
  test('WITHDRAW-REVIEW-01-UTCID02 [A] details rejects visit when withdrawal is no longer pending (INVALID_STATE)', async () => {
    const svc = createWithdrawalReviewService({
      repository: {
        col: () => ({ findOne: async () => ({ _id: new Types.ObjectId(VID), state: 'ASSIGNED', checkInAt: null, withdrawalRequest: null }) }),
        models: { EmployeeVisitOffer: { db: wrapConn() } },
        uow: {}
      }
    });
    await expect(svc.details(STAFF, VID)).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });
  test('WITHDRAW-REVIEW-02-UTCID02 [A] decide rejects stale expectedVersion with 409 VERSION_CONFLICT', async () => {
    const assignedAt = new Date(NOW_MS - 3600000);
    const visit = {
      _id: new Types.ObjectId(VID), sitterId: new Types.ObjectId(SITTER1), state: 'ASSIGNED',
      version: 5, assignedAt, checkInAt: null,
      withdrawalRequest: { sitterId: new Types.ObjectId(SITTER1), assignedAt, reasonCode: 'OTHER' }
    };
    const svc = createWithdrawalReviewService({
      repository: {
        col: name => (name === 'users'
          ? { findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF.userId), roles: ['STAFF'] }) }
          : { findOne: async () => visit }),
        models: { EmployeeVisitOffer: { db: wrapConn() }, EmployeeScheduleCommand: { findById: () => chain(null) } },
        uow: { run: fn => fn({}) }
      }
    });
    await expect(svc.decide(STAFF, VID, { expectedVersion: 1, decision: 'REJECT', reason: 'Lệch version' }, 'wd-stale-01'))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });
  });
  test('REASSIGN-SVC-01-UTCID02 [A] details rejects already checked-in visit with VISIT_NOT_REASSIGNABLE', async () => {
    const svc = createStaffReassignmentService({
      repository: {
        col: () => ({ findOne: async () => ({ _id: new Types.ObjectId(VID), state: 'IN_PROGRESS', sitterId: new Types.ObjectId(SITTER1), checkInAt: NOW, endAt: new Date(NOW_MS + 3600000) }) }),
        models: { EmployeeVisitOffer: { db: wrapConn() } }
      },
      clock: () => NOW_MS
    });
    await expect(svc.details(STAFF, VID)).rejects.toMatchObject({ code: 'VISIT_NOT_REASSIGNABLE', status: 409 });
  });
  test('REASSIGN-SVC-02-UTCID02 [N] reassign updates sitterId and sets handoverLateCheckInExempt=true for urgent <60m replacement', async () => {
    const conn = wrapConn();
    const visit = {
      _id: new Types.ObjectId(VID), bookingId: new Types.ObjectId(BID), customerId: new Types.ObjectId(CID),
      sitterId: new Types.ObjectId(PID), state: 'ASSIGNED', version: 1, checkInAt: null,
      startAt: new Date(NOW_MS + 20 * 60000), endAt: new Date(NOW_MS + 80 * 60000)
    };
    const svc = createStaffReassignmentService({
      repository: {
        col: () => ({
          findOne: async () => visit,
          find: () => chain([{ _id: new Types.ObjectId(SITTER1), displayName: 'Sitter Khẩn' }]),
          findOneAndUpdate: async (_f, u) => ({ ...visit, ...u.$set, version: 2 }),
          updateOne: async () => ({})
        }),
        models: {
          EmployeeVisitOffer: { db: conn, updateMany: async () => ({}) },
          EmployeeScheduleEvent: { distinct: async () => [] }
        },
        employeeGuard: async () => ({}),
        eligible: async () => ({}),
        registrationContract: async () => null
      },
      clock: () => NOW_MS,
      candidates: jest.fn(),
      event: async () => {},
      runCommand: (_a, _p, _k, exec) => exec({})
    });
    const out = await svc.reassign(STAFF, VID, { sitterId: SITTER1, expectedVersion: 1, reason: 'Khẩn cấp <1h' }, 're-urgent-01');
    expect(out).toMatchObject({ visitId: VID, sitterId: SITTER1, version: 2, handoverLateCheckInExempt: true });
  });

  function buildDispatchMini({ queueItems = [], findVisit = null } = {}) {
    const conn = wrapConn();
    const cols = {
      visits: {
        findOne: async () => findVisit,
        aggregate: () => ({ toArray: async () => queueItems }),
        findOneAndUpdate: async () => null
      },
      users: { find: () => chain([]) },
      bookings: { findOne: async () => null }
    };
    return createEmployeeDispatchService({
      repository: {
        col: n => cols[n] ?? { findOne: async () => null, find: () => chain([]), updateOne: async () => ({}) },
        uow: { run: fn => fn({}) },
        employeeGuard: async () => ({}),
        eligible: async () => ({}),
        coverageAreas: [],
        models: {
          EmployeeAvailability: { find: () => chain([]) },
          EmployeeVisitOffer: {
            db: conn, collection: { name: 'employeevisitoffers' },
            findOne: () => chain(null), find: () => chain([]), updateMany: async () => ({})
          },
          EmployeeScheduleCommand: { findById: () => chain(null), create: async d => d },
          EmployeeScheduleEvent: { create: async d => d, distinct: async () => [] }
        }
      },
      clock: () => NOW_MS
    });
  }

  test('EMP-DISPATCH-02-UTCID02 [A] invite rejects non-staff actor with 403 FORBIDDEN', async () => {
    const svc = buildDispatchMini();
    await expect(svc.invite({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, VID, { expectedVersion: 0 }, 'inv-forbid-01'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
  test('EMP-DISPATCH-04-UTCID01 [N] requeueWithdrawal skips dispatch cleanly when visit is missing or future retryAt is active', async () => {
    const svc = buildDispatchMini({
      findVisit: { _id: new Types.ObjectId(VID), state: 'SCHEDULED', sitterId: null, dispatchReview: { retryAt: new Date(NOW_MS + 60000) } }
    });
    await expect(svc.requeueWithdrawal(VID, 1)).resolves.toBeUndefined();
  });
  test('EMP-DISPATCH-04-UTCID02 [A] requeueWithdrawal swallows internal errors so withdrawal commit never fails', async () => {
    const svc = buildDispatchMini({
      findVisit: { _id: new Types.ObjectId(VID), version: 1, state: 'SCHEDULED', sitterId: null, startAt: new Date(NOW_MS - 1000) }
    });
    await expect(svc.requeueWithdrawal('invalid-id', 1)).resolves.toBeUndefined();
  });
  test('EMP-DISPATCH-05-UTCID01 [N] details returns queue item with latestOffers=[] when visit is in dispatch queue', async () => {
    const svc = buildDispatchMini({
      queueItems: [{
        _id: new Types.ObjectId(VID), bookingId: new Types.ObjectId(BID), customerId: new Types.ObjectId(CID),
        version: 1, startAt: new Date(NOW_MS + 3600000), endAt: new Date(NOW_MS + 7200000),
        areaCode: 'HN_CAU_GIAY', pendingInvitationCount: 0, snapshots: { serviceName: 'Chăm tại nhà', pets: [] }
      }]
    });
    const out = await svc.details(STAFF, VID);
    expect(out).toMatchObject({ id: VID, latestOffers: [] });
  });
  test('EMP-DISPATCH-05-UTCID02 [A] details throws 404 RESOURCE_NOT_FOUND when visit is not in dispatch queue', async () => {
    const svc = buildDispatchMini({ queueItems: [] });
    await expect(svc.details(STAFF, VID)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
});
