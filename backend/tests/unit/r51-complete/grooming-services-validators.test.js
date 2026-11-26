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

const CID = '507f1f77bcf86cd799439011';
const PID = '507f1f77bcf86cd799439012';
const SID = '507f1f77bcf86cd799439013';
const SITTER1 = '507f1f77bcf86cd799439021';
const APPT_ID = '507f1f77bcf86cd799439031';
const NOW_MS = Date.parse('2026-11-26T01:00:00.000Z'); // 08:00 +07:00 on 2026-11-26

function chain(val) {
  const q = {
    sort: () => q,
    select: () => q,
    limit: () => q,
    skip: () => q,
    maxTimeMS: () => q,
    session: () => q,
    option: () => Promise.resolve(val),
    lean: async () => val,
    then: (res, rej) => Promise.resolve(val).then(res, rej)
  };
  return q;
}

function wrapConn(rawModels, db = {}) {
  const models = {};
  const ensure = (name, val = {}) => {
    if (typeof val === 'function') {
      val.collection = { name: name.toLowerCase() + 's', listIndexes: () => ({ toArray: async () => [] }), ...(val.collection ?? {}) };
      val.schema = val.schema ?? { indexes: () => [] };
      val.createCollection = val.createCollection ?? (async () => {});
      val.createIndexes = val.createIndexes ?? (async () => {});
      models[name] = val;
      return val;
    }
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
  for (const [k, v] of Object.entries(rawModels)) ensure(k, v);
  return {
    models,
    model: name => models[name] ?? ensure(name, {}),
    transaction: async fn => fn({ inTransaction: () => true }),
    startSession: async () => ({ withTransaction: fn => fn({ inTransaction: () => true }), endSession: async () => {} }),
    db
  };
}

describe('Grooming Time Utils (GRM-TIME-01..09)', () => {
  test('GRM-TIME-01-UTCID01 [N] converts UTC timestamp across midnight into +07:00 local YYYY-MM-DD', () => {
    expect(groomingLocalDate('2026-11-25T18:30:00.000Z')).toBe('2026-11-26');
  });
  test('GRM-TIME-02-UTCID01 [N] formats +07:00 HH:mm local time', () => {
    expect(groomingLocalTime('2026-11-26T02:00:00.000Z')).toBe('09:00');
  });
  test('GRM-TIME-03-UTCID01 [N] returns UTC instant of 00:00:00+07:00 for local date', () => {
    expect(groomingDayStart('2026-11-26').toISOString()).toBe('2026-11-25T17:00:00.000Z');
  });
  test('GRM-TIME-04-UTCID01 [N] builds canonical +07:00 slot key', () => {
    expect(groomingSlotKey('2026-11-26T02:00:00.000Z')).toBe('2026-11-26T09:00+07:00');
  });
  test('GRM-TIME-05-UTCID01 [N] accepts valid calendar YYYY-MM-DD and rejects impossible 2026-02-30', () => {
    expect(isGroomingDate('2026-11-26')).toBe(true);
    expect(isGroomingDate('2026-02-30')).toBe(false);
    expect(isGroomingDate('26/11/2026')).toBe(false);
  });
  test('GRM-TIME-06-UTCID01 [N] returns 7-day local booking window starting from local today', () => {
    const win = groomingWindow(NOW_MS);
    expect(win.firstDate).toBe('2026-11-26');
    expect(win.dates).toHaveLength(7);
    expect(win.lastDate).toBe('2026-12-02');
  });
  test('GRM-TIME-07-UTCID01 [N] generates 24 hourly slot starts for a local day', () => {
    const starts = groomingSlotStarts('2026-11-26');
    expect(starts).toHaveLength(24);
    expect(starts[0].toISOString()).toBe('2026-11-25T17:00:00.000Z');
  });
  test('GRM-TIME-08-UTCID01 [B] rounds duration up to 60-minute slots with minimum 1 slot', () => {
    expect(groomingSlotsNeeded(0)).toBe(1);
    expect(groomingSlotsNeeded(60)).toBe(1);
    expect(groomingSlotsNeeded(61)).toBe(2);
  });
  test('GRM-TIME-09-UTCID01 [N] enumerates covered hourly slot instants for multi-hour duration', () => {
    const covered = groomingCoveredSlots('2026-11-26T02:00:00.000Z', 120);
    expect(covered.map(d => d.toISOString())).toEqual(['2026-11-26T02:00:00.000Z', '2026-11-26T03:00:00.000Z']);
  });
});

describe('Grooming Validators (GRM-IN-01..07)', () => {
  test('GRM-IN-01-UTCID01 [N] validates groomingSlotsInput and rejects duplicate pets or invalid date', () => {
    expect(groomingSlotsInput({ date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }] }))
      .toEqual({ date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }] });
    expect(() => groomingSlotsInput({ date: 'bad', pets: [{ petId: PID, serviceIds: [SID] }] })).toThrow();
    expect(() => groomingSlotsInput({ date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }, { petId: PID, serviceIds: [SID] }] })).toThrow();
  });

  test('GRM-IN-02-UTCID01 [N] validates groomingQuoteInput with biteOrScratch/skinCondition answers', () => {
    const out = groomingQuoteInput({
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }]
    });
    expect(out.pets[0].answers.biteOrScratch).toBe('NO');
    expect(() => groomingQuoteInput({
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'MAYBE', skinCondition: 'NO' } }]
    })).toThrow();
  });

  test('GRM-IN-03-UTCID01 [N] validates exact ISO hour-boundary startAt and non-negative integer expectedTotalVnd', () => {
    const out = groomingBookingInput({
      startAt: '2026-11-27T02:00:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: 200000
    });
    expect(out.startAt).toBeInstanceOf(Date);
    expect(() => groomingBookingInput({
      startAt: '2026-11-27T02:30:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: 200000
    })).toThrow();
  });

  test('GRM-IN-04-UTCID01 [B] accepts 8..200 char idempotency key and rejects 7-char key', () => {
    expect(groomingIdempotencyKey('grooming:1234')).toBe('grooming:1234');
    expect(() => groomingIdempotencyKey('short77')).toThrow();
  });

  test('GRM-IN-05-UTCID01 [N] parses status, boolean upcoming, and rejects unknown query fields', () => {
    expect(groomingListQuery({ page: '1', limit: '10', status: 'BOOKED', upcoming: 'true' }))
      .toEqual({ page: 1, limit: 10, status: 'BOOKED', upcoming: true });
    expect(() => groomingListQuery({ extra: '1' })).toThrow();
  });

  test('GRM-IN-06-UTCID01 [N] converts valid 24-hex id to ObjectId and returns null otherwise', () => {
    expect(groomingAppointmentId(APPT_ID)).toBeInstanceOf(Types.ObjectId);
    expect(groomingAppointmentId('not-an-id')).toBeNull();
  });

  test('GRM-IN-07-UTCID01 [N] accepts undefined, null, or empty {} body and rejects extra fields', () => {
    expect(groomingCancelInput(undefined)).toEqual({});
    expect(groomingCancelInput({})).toEqual({});
    expect(() => groomingCancelInput({ reason: 'extra' })).toThrow();
  });
});

describe('Grooming Services (GRM-CODE-01, GRM-BOOK-01..05, GRM-SEED-01, GRM-HOLD-01, GRM-PRICE-01..03, GRM-RESERVE-01..02, GRM-SERVICE-01..02, GRM-SLOTS-01, GRM-STORAGE-01, GRM-01..07, SHOP-SHIFT-01)', () => {
  // GRM-CODE-01
  test('GRM-CODE-01-UTCID01 [N] formats GR-0001 and retries once on duplicate key 11000', async () => {
    let n = 0;
    const GroomingCounter = {
      findOneAndUpdate: jest.fn(async () => {
        n += 1;
        if (n === 1) throw Object.assign(new Error('dup'), { code: 11000 });
        return { value: 7 };
      })
    };
    const conn = { models: { GroomingCounter, GroomingAppointment: {} }, model: name => ({ GroomingCounter })[name] };
    const code = await createGroomingAppointmentCode({ connection: conn }).nextCode();
    expect(code).toBe('GR-0007');
  });

  // GRM-BOOK-01..05
  const sampleDoc = {
    _id: new Types.ObjectId(APPT_ID),
    code: 'GR-0001',
    customerId: new Types.ObjectId(CID),
    status: 'BOOKED',
    version: 0,
    slot: {
      startAt: new Date('2026-11-27T02:00:00.000Z'),
      endAt: new Date('2026-11-27T03:00:00.000Z'),
      localDate: '2026-11-27',
      startLocalTime: '09:00'
    },
    pets: [{
      petId: new Types.ObjectId(PID),
      status: 'BOOKED',
      reservedSitterId: new Types.ObjectId(SITTER1),
      petSnapshot: { name: 'Bơ' },
      durationMinutes: 60,
      finalPriceVnd: 200000,
      services: [{ serviceId: new Types.ObjectId(SID), name: 'Tắm sấy', durationMinutes: 60, sizeLabel: 'chó dưới 5 kg', priceVnd: 200000 }]
    }],
    pricing: { subtotalVnd: 200000, tierDiscountVnd: 0, totalVnd: 200000, currency: 'VND' },
    tier: { code: 'MEMBER', discountBps: 0, discountBlockedReason: null },
    shop: { address: '12 Cầu Giấy' },
    bookedAt: new Date(NOW_MS)
  };

  test('GRM-BOOK-01-UTCID01 [N] maps appointment document to public customer view hiding internalreservedSitterId', () => {
    const view = toGroomingAppointmentView(sampleDoc, '19001000');
    expect(view).toMatchObject({ id: APPT_ID, code: 'GR-0001', depositRequired: false, shop: { hotline: '19001000' } });
    expect(view.pets[0].reservedSitterId).toBeUndefined();
  });

  function buildBookingService(overrides = {}) {
    let priorReceipt = overrides.priorReceipt ?? null;
    const apptDoc = overrides.apptDoc === undefined ? sampleDoc : overrides.apptDoc;
    const GroomingAppointment = function (fields) {
      const obj = { _id: new Types.ObjectId(APPT_ID), ...fields };
      return { ...obj, toObject: () => ({ ...obj }), validate: async () => {} };
    };
    Object.assign(GroomingAppointment, {
      collection: { insertOne: jest.fn(async () => ({})) },
      findOne: jest.fn((filter) => {
        if (filter['requestReceipt.key']) return chain(priorReceipt);
        return chain(apptDoc);
      }),
      find: jest.fn((filter) => chain(filter?.pets ? (overrides.busyDocs ?? []) : (apptDoc ? [apptDoc] : []))),
      countDocuments: jest.fn(() => chain(apptDoc ? 1 : 0)),
      findOneAndUpdate: jest.fn((_f, u) => chain(apptDoc ? {
        ...apptDoc,
        status: 'CANCELLED',
        cancellation: u.$set.cancellation,
        pets: apptDoc.pets.map(p => ({ ...p, status: 'CANCELLED_NO_CHARGE' }))
      } : null))
    });
    const Pet = { collection: { updateOne: jest.fn(async () => ({ matchedCount: 1 })) } };
    const PayrollMonthGuard = { findOneAndUpdate: jest.fn(() => chain({ version: 1 })) };
    const models = {
      GroomingAppointment,
      GroomingCounter: {},
      Pet,
      PetBreed: {},
      VaccinationRecord: {},
      CustomerAddress: {},
      PayrollMonthGuard,
      EmploymentContract: {},
      PayrollStatement: {},
      SalaryAdvance: {},
      PayrollServiceCredit: {},
      PayrollAdjustment: {},
      PayrollSourceClaim: {},
      PayrollCommand: {},
      PayrollEvent: {},
      EmployeeAvailability: {},
      EmployeeAvailabilityRevision: {},
      EmployeeVisitOffer: {},
      EmployeeDayOrigin: {},
      EmployeeScheduleCommand: {},
      EmployeeScheduleEvent: {}
    };
    const conn = wrapConn(models, {
      collection: () => ({
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(CID), state: 'ACTIVE', roles: ['CUSTOMER'] }),
        find: () => ({ limit: () => ({ toArray: async () => [] }),
          sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })
      })
    });
    return createGroomingBooking({
      connection: conn,
      clock: () => overrides.nowMs ?? NOW_MS,
      pricing: {
        price: jest.fn(async () => ({
          pets: [{
            pet: { _id: new Types.ObjectId(PID), name: 'Bơ', species: 'DOG', weightKg: 4, version: 0, traits: [] },
            answers: { biteOrScratch: 'NO', skinCondition: 'NO' },
            lines: [{ serviceId: SID, label: 'Tắm sấy', sizeLabel: 'chó dưới 5 kg', amountVnd: 200000, durationMinutes: 60, serviceVersion: 1, priceVersion: 1, policyVersion: 1 }],
            priceVnd: 200000,
            durationMinutes: 60
          }],
          subtotalVnd: 200000,
          tierDiscountVnd: 0,
          totalVnd: 200000,
          tier: { code: 'MEMBER', discountBps: 0, blockedReason: null }
        }))
      },
      shiftSource: { openRoster: jest.fn(async () => ({ sittersFor: () => [SITTER1] })) },
      codes: { nextCode: async () => 'GR-0001' },
      facilityAddress: overrides.facilityAddress === undefined ? '12 Cầu Giấy' : overrides.facilityAddress,
      hotline: '19001000'
    });
  }

  test('GRM-BOOK-02-UTCID01 [N] books shop grooming appointment and rejects mismatched expectedTotalVnd with GROOMING_PRICE_CHANGED', async () => {
    const svc = buildBookingService();
    const body = {
      startAt: '2026-11-27T02:00:00.000Z',
      pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }],
      expectedTotalVnd: 200000
    };
    const view = await svc.book(CID, body, 'grooming-key-01');
    expect(view).toMatchObject({ code: 'GR-0001', status: 'BOOKED' });

    await expect(svc.book(CID, { ...body, expectedTotalVnd: 150000 }, 'grooming-key-02'))
      .rejects.toMatchObject({ code: 'GROOMING_PRICE_CHANGED', status: 409 });
  });

  test('GRM-BOOK-03-UTCID01 [N] lists upcoming customer appointments including serverNow', async () => {
    const svc = buildBookingService();
    const res = await svc.list(CID, { upcoming: 'true' });
    expect(res.items).toHaveLength(1);
    expect(res.serverNow).toBe('2026-11-26T01:00:00.000Z');
  });

  test('GRM-BOOK-04-UTCID01 [N] reads owned appointment and throws 404 RESOURCE_NOT_FOUND when missing', async () => {
    const svc = buildBookingService();
    await expect(svc.read(CID, APPT_ID)).resolves.toMatchObject({ id: APPT_ID });
    await expect(buildBookingService({ apptDoc: null }).read(CID, APPT_ID))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });

  test('GRM-BOOK-05-UTCID01 [N] cancels BOOKED appointment >= 2h before startAt and rejects < 2h with GROOMING_CANCEL_TOO_LATE', async () => {
    const svc = buildBookingService();
    const cancelled = await svc.cancel(CID, APPT_ID, {});
    expect(cancelled.status).toBe('CANCELLED');

    const lateSvc = buildBookingService({ nowMs: Date.parse('2026-11-27T00:30:00.000Z') }); // 1.5h before 02:00Z
    await expect(lateSvc.cancel(CID, APPT_ID, {}))
      .rejects.toMatchObject({ code: 'GROOMING_CANCEL_TOO_LATE', status: 409 });
  });

  // GRM-RESERVE-01..02
  test('GRM-RESERVE-01-UTCID01 [N] matches distinct sitters via bipartite augmenting path and returns null when impossible', () => {
    const roster = {
      sittersFor: (_s, _e, { pet }) => (pet.name === 'P1' ? [SITTER1, 's2'] : [SITTER1])
    };
    const pets = [
      { durationMinutes: 60, services: [{ serviceId: SID }], petSnapshot: { name: 'P1' } },
      { durationMinutes: 60, services: [{ serviceId: SID }], petSnapshot: { name: 'P2' } }
    ];
    expect(reserveGroomingEmployees(roster, pets, new Date(NOW_MS))).toEqual(['s2', SITTER1]);
    expect(reserveGroomingEmployees({ sittersFor: () => [SITTER1] }, pets, new Date(NOW_MS))).toBeNull();
  });

  test('GRM-RESERVE-02-UTCID01 [A] throws 409 GROOMING_SLOT_TAKEN when distinct sitters cannot be reserved', () => {
    const pets = [{ durationMinutes: 60, services: [{ serviceId: SID }], petSnapshot: { name: 'P1' } }];
    expect(() => assertGroomingReservations({ sittersFor: () => [] }, pets, new Date(NOW_MS)))
      .toThrow(/No distinct qualified/);
  });

  // GRM-PRICE-01..03 & GRM-HOLD-01
  test('GRM-PRICE-01-UTCID01 [N] formats Vietnamese size label from WEIGHT pricing rules', () => {
    const policy = {
      rules: [
        { exclusiveGroup: 'WEIGHT', when: { species: 'DOG', minWeightKg: 5, maxWeightKg: 15 } },
        { exclusiveGroup: 'WEIGHT', when: { species: 'DOG', minWeightKg: 15 } }
      ]
    };
    expect(groomingSizeLabel({ species: 'DOG', weightKg: 8 }, policy)).toBe('chó 5–15 kg');
    expect(groomingSizeLabel({ species: 'DOG', weightKg: 3 }, policy)).toBe('chó dưới 5 kg');
    expect(groomingSizeLabel({ species: 'DOG', weightKg: 20 }, policy)).toBe('chó trên 15 kg');
  });

  function buildPricingHarness(biteAnswer = 'NO') {
    const petDoc = { _id: new Types.ObjectId(PID), ownerId: CID, state: 'ACTIVE', name: 'Bơ', species: 'DOG', breedCode: 'POODLE', weightKg: 6 };
    const models = {
      Pet: { find: () => chain([petDoc]) },
      PetBreed: { find: () => chain([{ code: 'POODLE', species: 'DOG', active: true }]) },
      VaccinationRecord: {}, CustomerAddress: { findOne: () => chain(null) },
      Service: { findById: () => chain({ _id: new Types.ObjectId(SID), code: 'BATH' }) },
      ServiceVersion: { findOne: () => chain({ _id: new Types.ObjectId(), serviceId: new Types.ObjectId(SID), version: 1, state: 'ACTIVE', species: ['DOG'] }) },
      ServicePolicyVersion: { findOne: () => chain({ version: 1, state: 'PUBLISHED' }) },
      ServicePriceVersion: { findOne: () => chain({ version: 1, amountVnd: 200000, currency: 'VND' }) },
      SystemSettingVersion: { findOne: () => chain({ enabled: true }) },
      PricingPolicy: { findOne: () => chain({
        version: 1, status: 'APPROVED', approvedBy: 'admin', effectiveAt: new Date(NOW_MS - 1000),
        unitMinutes: 60, maxPets: 4, extraPetBps: 0, maxSurchargeBps: 20000,
        orderStepVnd: 1000000, orderStepBps: 0, maxOrderTierBps: 0,
        rules: [{
          code: 'W1', label: 'Chó vừa', explanation: 'Theo cân nặng 5–15 kg',
          scope: 'PET', bps: 0, flatVnd: 0, exclusiveGroup: 'WEIGHT',
          when: { species: 'DOG', minWeightKg: 5, maxWeightKg: 15 }
        }]
      }) },
      QuoteRecord: {},
      Product: {}, ProductOrder: {}, ProductCart: {}, ProductStockReceipt: {}, Supplier: {},
      ProductCustomerRefusal: { collection: { countDocuments: async () => 0 } },
      Contact: {}, User: {}
    };
    const conn = wrapConn(models, {
      collection: (name) => ({
        findOne: async () => {
          if (name === 'customer_tiers') return { tier: 'SILVER' };
          if (name === 'customer_tier_policies') return {
            _id: 'current', version: 1, state: 'APPROVED', approvedBy: 'owner',
            approvedAt: new Date(NOW_MS - 1000), approvalReference: 'APP-01',
            discountsBps: { MEMBER: 0, SILVER: 500, GOLD: 1000 }
          };
          return null;
        }
      })
    });
    const pricing = createGroomingPricing({
      connection: conn,
      clock: () => NOW_MS,
      refusalLimit: '2',
      hotline: '19001000',
      shopServices: { resolve: async () => new Map([[SID, { id: SID, name: 'Tắm sấy', durationMinutes: 60, bookable: true }]]) }
    });
    return {
      conn,
      pricing,
      input: { pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: biteAnswer, skinCondition: 'NO' } }] }
    };
  }

  test('GRM-PRICE-02-UTCID01 [N] computes pet lines and tier discount, and rejects biteOrScratch=YES with GROOMING_PET_REFERRAL_REQUIRED', async () => {
    const { pricing, input } = buildPricingHarness('NO');
    const priced = await pricing.price(CID, input);
    expect(priced.subtotalVnd).toBe(200000);
    expect(priced.tierDiscountVnd).toBe(10000);
    expect(priced.totalVnd).toBe(190000);

    const bad = buildPricingHarness('YES');
    await expect(bad.pricing.price(CID, bad.input)).rejects.toMatchObject({ code: 'GROOMING_PET_REFERRAL_REQUIRED', status: 422 });
  });

  test('GRM-PRICE-03-UTCID01 [N] quote formats currency VND, applied tier discount, and pet line breakdown', async () => {
    const { pricing, input } = buildPricingHarness('NO');
    const q = await pricing.quote(CID, input);
    expect(q).toMatchObject({ currency: 'VND', subtotalVnd: 200000, totalVnd: 190000, tier: { code: 'SILVER', applied: true } });
  });

  test('GRM-HOLD-01-UTCID01 [N] delegates discount hold check to common eligibility service', async () => {
    const { conn } = buildPricingHarness('NO');
    const hold = createGroomingDiscountHold({ connection: conn, refusalLimit: '2' });
    await expect(hold.read(CID)).resolves.toBeNull();
  });

  // GRM-SERVICE-01..02
  test('GRM-SERVICE-01-UTCID01 [N] lists FACILITY grooming services with bookable flag and resolves bookable IDs', async () => {
    const svcId = new Types.ObjectId(SID);
    const agg = rows => ({ session: () => ({ option: async () => rows }) });
    const models = {
      Service: { find: () => chain([{ _id: svcId, code: 'GRM_BATH', presentation: { durationMinutes: 60, locations: ['FACILITY'], category: 'Làm đẹp' } }]) },
      ServiceVersion: { aggregate: () => agg([{ serviceId: svcId, state: 'ACTIVE', name: 'Tắm sấy', species: ['DOG'] }]) },
      ServicePolicyVersion: { aggregate: () => agg([{ serviceId: svcId, state: 'PUBLISHED' }]) },
      ServicePriceVersion: { aggregate: () => agg([{ serviceId: svcId, amountVnd: 180000 }]) },
      PricingPolicy: { aggregate: () => agg([{ serviceId: svcId, status: 'APPROVED', approvedBy: 'owner' }]) },
      SystemSettingVersion: { findOne: () => chain({ enabled: true }) },
      QuoteRecord: {}
    };
    const shopServices = createGroomingShopServices({ connection: { models, model: n => models[n] }, clock: () => NOW_MS });
    const list = await shopServices.list();
    expect(list).toEqual([{ id: SID, code: 'GRM_BATH', name: 'Tắm sấy', durationMinutes: 60, fromPriceVnd: 180000, species: ['DOG'], bookable: true }]);

    // GRM-SERVICE-02
    const resolved = await shopServices.resolve([SID]);
    expect(resolved.get(SID).bookable).toBe(true);
    await expect(shopServices.resolve(['507f1f77bcf86cd799439099'])).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 409 });
  });

  // GRM-SLOTS-01
  test('GRM-SLOTS-01-UTCID01 [N] lists AVAILABLE and FULL slots within booking window and rejects out-of-window date', async () => {
    const models = {
      Pet: { find: () => chain([{ _id: new Types.ObjectId(PID), ownerId: CID, state: 'ACTIVE', species: 'DOG', weightKg: 5, traits: [] }]) },
      PetBreed: {}, VaccinationRecord: {}, CustomerAddress: {}
    };
    const slotsSvc = createGroomingSlots({
      connection: wrapConn(models),
      clock: () => NOW_MS,
      shopServices: { resolve: async () => new Map([[SID, { durationMinutes: 60 }]]) },
      shiftSource: {
        openRoster: async () => ({
          sittersFor: (start, _end, opts) => {
            if (start.toISOString() === '2026-11-27T02:00:00.000Z') return opts.ignoreReservations ? [SITTER1] : [SITTER1];
            if (start.toISOString() === '2026-11-27T03:00:00.000Z') return opts.ignoreReservations ? [SITTER1] : [];
            return [];
          }
        })
      }
    });
    const out = await slotsSvc.list(CID, { date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }] });
    expect(out.slots).toEqual([
      { startAt: '2026-11-27T02:00:00.000Z', time: '09:00', state: 'AVAILABLE' },
      { startAt: '2026-11-27T03:00:00.000Z', time: '10:00', state: 'FULL' }
    ]);
    await expect(slotsSvc.list(CID, { date: '2026-12-25', pets: [{ petId: PID, serviceIds: [SID] }] }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  // GRM-STORAGE-01 & GRM-SEED-01
  test('GRM-STORAGE-01-UTCID01 [N] provisions collections/indexes and rejects legacy unmigrated documents', async () => {
    const createCollection = jest.fn(async () => {});
    const createIndexes = jest.fn(async () => {});
    const models = {
      GroomingAppointment: { createCollection, createIndexes },
      GroomingCounter: { createCollection, createIndexes }
    };
    const okConn = { models, db: { collection: () => ({ findOne: async () => null }) } };
    await provisionGroomingStorage(okConn);
    expect(createCollection).toHaveBeenCalledTimes(2);

    const legacyConn = { models, db: { collection: () => ({ findOne: async () => ({ _id: 1 }) }) } };
    await expect(provisionGroomingStorage(legacyConn)).rejects.toMatchObject({ code: 'GROOMING_MIGRATION_REQUIRED', status: 409 });
  });

  test('GRM-SEED-01-UTCID01 [N] provisions demo sitters idempotently and returns ALREADY_APPLIED on rerun', async () => {
    const existingId = new Types.ObjectId(SITTER1);
    const noopModel = { createCollection: async () => {}, createIndexes: async () => {}, exists: async () => true, create: async () => {} };
    const models = {
      User: { findOne: () => chain({ _id: existingId }), create: jest.fn() },
      Service: { find: () => chain([{ _id: new Types.ObjectId(SID) }]) },
      GroomingAppointment: noopModel, GroomingCounter: noopModel,
      EmploymentContract: noopModel, PayrollMonthGuard: noopModel, PayrollStatement: noopModel,
      SalaryAdvance: noopModel, PayrollServiceCredit: noopModel, PayrollAdjustment: noopModel,
      PayrollSourceClaim: noopModel, PayrollCommand: noopModel, PayrollEvent: noopModel,
      EmployeeAvailability: noopModel, EmployeeAvailabilityRevision: noopModel,
      EmployeeVisitOffer: noopModel, EmployeeDayOrigin: noopModel,
      EmployeeScheduleCommand: noopModel, EmployeeScheduleEvent: noopModel
    };
    const res = await provisionGroomingDemo({
      connection: wrapConn(models, {
        collection: () => ({ findOne: async () => null, updateOne: async () => ({}) })
      }),
      clock: () => NOW_MS
    });
    expect(res).toMatchObject({ state: 'ALREADY_APPLIED', shopServices: 1, sitters: 2 });
  });

  // GRM-01..07
  test('GRM-01-UTCID01 [N] createGroomingService enforces ACTIVE CUSTOMER actor and delegates all 7 operations', async () => {
    const cust = { userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] };
    const svc = createGroomingService({
      facilityAddress: ' 12 Cầu Giấy ',
      hotline: ' 19001000 ',
      clock: () => NOW_MS,
      shopServices: { list: async () => [{ id: SID }] },
      slots: { list: jest.fn(async (_c, input) => ({ date: input.date, slots: [] })) },
      pricing: { quote: jest.fn(async () => ({ totalVnd: 200000 })) },
      booking: {
        book: jest.fn(async () => ({ code: 'GR-0001' })),
        cancel: jest.fn(async () => ({ status: 'CANCELLED' })),
        list: jest.fn(async () => ({ items: [] })),
        read: jest.fn(async () => ({ id: APPT_ID }))
      }
    });
    // GRM-01
    const opt = await svc.options(cust);
    expect(opt.shop).toEqual({ address: '12 Cầu Giấy', hotline: '19001000' });
    // GRM-02..07
    await expect(svc.slots(cust, { date: '2026-11-27', pets: [{ petId: PID, serviceIds: [SID] }] })).resolves.toEqual({ date: '2026-11-27', slots: [] });
    await expect(svc.quote(cust, { pets: [{ petId: PID, serviceIds: [SID], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }] })).resolves.toEqual({ totalVnd: 200000 });
    await expect(svc.book(cust, {}, 'k-12345678')).resolves.toEqual({ code: 'GR-0001' });
    await expect(svc.listAppointments(cust, {})).resolves.toEqual({ items: [] });
    await expect(svc.readAppointment(cust, APPT_ID)).resolves.toEqual({ id: APPT_ID });
    await expect(svc.cancelAppointment(cust, APPT_ID, {})).resolves.toEqual({ status: 'CANCELLED' });

    await expect(svc.options({ userId: CID, state: 'ACTIVE', roles: ['STAFF'] })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  test('GRM-02-UTCID01 [N] slots validates payload before delegating', () => {
    const svc = createGroomingService({ shopServices: {}, slots: { list: () => ({ ok: true }) }, pricing: {}, booking: {} });
    expect(() => svc.slots({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, { date: 'invalid' })).toThrow();
  });
  test('GRM-03-UTCID01 [N] quote validates payload before delegating', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: { quote: () => ({ ok: true }) }, booking: {} });
    expect(() => svc.quote({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, { pets: [] })).toThrow();
  });
  test('GRM-04-UTCID01 [N] book rejects synthetic customer actor', () => {
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { book: () => ({}) } });
    expect(() => svc.book({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'], synthetic: true }, {}, 'k-12345678')).toThrow();
  });
  test('GRM-05-UTCID01 [N] listAppointments delegates customerId and query', async () => {
    const list = jest.fn(async () => ({ items: [], total: 0 }));
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { list } });
    await svc.listAppointments({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, { page: '1' });
    expect(list).toHaveBeenCalledWith(CID, { page: '1' });
  });
  test('GRM-06-UTCID01 [N] readAppointment delegates customerId and appointmentId', async () => {
    const read = jest.fn(async () => ({ id: APPT_ID }));
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { read } });
    await svc.readAppointment({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, APPT_ID);
    expect(read).toHaveBeenCalledWith(CID, APPT_ID);
  });
  test('GRM-07-UTCID01 [N] cancelAppointment delegates customerId, appointmentId, and body', async () => {
    const cancel = jest.fn(async () => ({ id: APPT_ID, status: 'CANCELLED' }));
    const svc = createGroomingService({ shopServices: {}, slots: {}, pricing: {}, booking: { cancel } });
    await svc.cancelAppointment({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, APPT_ID, {});
    expect(cancel).toHaveBeenCalledWith(CID, APPT_ID, {});
  });

  // SHOP-SHIFT-01
  test('SHOP-SHIFT-01-UTCID01 [N] openRoster returns qualified FULL_TIME shop sitter covering SHOP window with no same-day home visit', async () => {
    const sitterOid = new Types.ObjectId(SITTER1);
    const start = new Date('2026-11-26T02:00:00.000Z'); // Thu 09:00 +07:00 (weekday=4)
    const end = new Date('2026-11-26T03:00:00.000Z');
    const models = {
      EmploymentContract: {
        find: () => chain([{
          employeeId: sitterOid,
          employmentType: 'FULL_TIME',
          verifiedBy: 'admin',
          signedAt: new Date(NOW_MS - 86400000),
          effectiveAt: new Date('2026-10-01T00:00:00.000Z'),
          endsAt: null,
          weeklyMinutes: 2400
        }])
      },
      PayrollMonthGuard: {}, PayrollStatement: {}, SalaryAdvance: {}, PayrollServiceCredit: {},
      PayrollAdjustment: {}, PayrollSourceClaim: {}, PayrollCommand: {}, PayrollEvent: {},
      EmployeeAvailability: { find: () => chain([{ _id: SITTER1, state: 'ACTIVE', dayOffDates: [] }]) },
      EmployeeAvailabilityRevision: {
        aggregate: () => ({ session: () => ({ option: async () => [{ _id: SITTER1 }] }) }),
        find: () => chain([{
          sitterId: SITTER1,
          effectiveFrom: '2026-01-01',
          workingWindows: [{ weekday: 4, startLocalTime: '08:00', endLocalTime: '12:00', workLocation: 'SHOP' }]
        }])
      },
      EmployeeVisitOffer: {}, EmployeeDayOrigin: {}, EmployeeScheduleCommand: {}, EmployeeScheduleEvent: {}
    };
    const dbCols = {
      users: [{ _id: sitterOid }],
      sitterstatuses: [{ userId: sitterOid }],
      aisitterprofiles: [{ userId: sitterOid, active: true, serviceIds: [new Types.ObjectId(SID)], species: ['DOG'], maxWeightKg: 25, maxPets: 2, allowedTraits: [] }],
      visits: [],
      aischeduleblocks: [],
      groomingappointments: []
    };
    const shift = createShopShiftSource({
      connection: {
        models,
        model: n => models[n],
        db: { collection: name => ({ find: () => ({ limit: () => ({ toArray: async () => dbCols[name] ?? [] }) }) }) }
      },
      clock: () => NOW_MS
    });
    const roster = await shift.openRoster({ serviceIds: [SID], from: start, to: end });
    expect(roster.sittersFor(start, end, { serviceIds: [SID], pet: { species: 'DOG', weightKg: 8, traits: [] } })).toEqual([SITTER1]);
  });
});
