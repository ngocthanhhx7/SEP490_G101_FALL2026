import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import { createProductCustomerPriceService } from '../../../src/services/product-sales/product-customer-price.service.js';
import { createProductOrderExpiryService } from '../../../src/services/product-sales/product-order-management.service.js';
import { createProductPricingEligibility } from '../../../src/services/product-sales/product-pricing-eligibility.service.js';
import { createProductOrderReceipts } from '../../../src/services/product-sales/product-order-receipt.service.js';
import { createVisitTrackerService } from '../../../src/services/visit-tracker/visit-tracker.service.js';
import {
  bookingCancellationPreviewInput, bookingCancellationInput, adminBookingRefundsQuery
} from '../../../src/validators/booking-cancellation.validator.js';
import { createBookingCancellationService } from '../../../src/services/booking-proposals/booking-cancellation.service.js';
import {
  handoverPending, flagVisitHandover, urgentReplacement, lateCheckInExempt
} from '../../../src/services/care/visit-handover-policy.service.js';
import { createVisitHandoverService } from '../../../src/services/care/visit-handover.service.js';
import { digest } from '../../../src/validators/pet-care.validator.js';
import { financeSourceIndexes } from '../../../src/services/settlements/source-provisioning.js';

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
        listIndexes: () => ({
          toArray: async () => [
            { name: '_id_', key: { _id: 1 } },
            ...(name === 'CareMediaBinding' ? [{ name: 'visit_kind', unique: true, key: { visitId: 1, kind: 1 } }] : [])
          ]
        }),
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

const CID = '507f1f77bcf86cd799439011';
const SITTER_ID = '507f1f77bcf86cd799439012';
const ADMIN_ID = '507f1f77bcf86cd799439099';
const PROD_ID = '507f1f77bcf86cd799439021';
const ORD_ID = '507f1f77bcf86cd799439022';
const BID = '507f1f77bcf86cd799439031';
const VID = '507f1f77bcf86cd799439032';
const NOW_MS = Date.parse('2026-11-26T08:00:00.000Z');
const NOW = new Date(NOW_MS);

function chain(val) {
  const q = {
    sort: () => q,
    select: () => q,
    limit: () => q,
    maxTimeMS: () => q,
    session: () => q,
    lean: async () => val,
    toArray: async () => val,
    then: (res, rej) => Promise.resolve(val).then(res, rej)
  };
  return q;
}

describe('Product Pricing, Expiry & Receipts (SHOP-CUST-PRICE-01, SHOP-MGMT-09, SHOP-ELIG-01..04, SHOP-RCPT-01..02)', () => {
  // SHOP-CUST-PRICE-01
  test('SHOP-CUST-PRICE-01-UTCID01 [N] computes customer tier unit discount and rejects non-customer actor', async () => {
    const svc = createProductCustomerPriceService({
      catalog: { read: async () => ({ sellingPrice: 120000 }) },
      eligibility: { read: async () => ({ tierCode: 'GOLD', discountBps: 1000 }) }
    });
    const out = await svc.read({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, PROD_ID);
    expect(out).toEqual({
      unitPrice: 120000,
      unitDiscount: 12000,
      discountedUnitPrice: 108000,
      tierCode: 'GOLD',
      discountBps: 1000
    });
    await expect(svc.read({ userId: CID, state: 'ACTIVE', roles: ['STAFF'] }, PROD_ID)).rejects.toMatchObject({ status: 403 });
  });

  // SHOP-MGMT-09
  test('SHOP-MGMT-09-UTCID01 [N] expires overdue pickup and unpaid prepaid orders, releasing held stock', async () => {
    const pickupOrder = {
      _id: new Types.ObjectId(ORD_ID),
      customerId: new Types.ObjectId(CID),
      status: 'READY',
      receiveMethod: 'PICKUP',
      paymentMethod: 'COD',
      paid: false,
      version: 1,
      lines: [{ productId: new Types.ObjectId(PROD_ID), quantity: 2 }]
    };
    let findCall = 0;
    const ProductOrder = {
      find: jest.fn(() => chain(findCall++ === 0 ? [pickupOrder] : [])),
      findOne: jest.fn(() => chain(pickupOrder)),
      findOneAndUpdate: jest.fn(() => chain({ ...pickupOrder, status: 'CANCELLED', version: 2 }))
    };
    const Product = { updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
    const ProductCustomerRefusal = { create: jest.fn(async d => d) };
    const models = { Product, ProductOrder, ProductCustomerRefusal, ProductCart: {}, ProductStockReceipt: {}, Supplier: {}, User: {} };
    const conn = wrapConn(models, {
      collection: () => ({ insertOne: async () => ({}), updateOne: async () => ({}), findOne: async () => null })
    });
    const expiry = createProductOrderExpiryService({ connection: conn, clock: () => NOW_MS });
    const summary = await expiry.runBatch();
    expect(summary).toEqual({ cancelled: 1, failed: 0, kept: 0 });
    expect(ProductCustomerRefusal.create).toHaveBeenCalledTimes(1);
    expect(Product.updateOne).toHaveBeenCalledTimes(1);
  });

  // SHOP-ELIG-01..04
  function buildEligHarness({ refusals = 0, overdue = null, userActive = true, verifiedContact = true } = {}) {
    const models = {
      Product: {}, ProductOrder: {}, ProductCart: {}, ProductStockReceipt: {}, Supplier: {},
      ProductCustomerRefusal: { collection: { countDocuments: async () => refusals } },
      User: { exists: () => chain(userActive ? { _id: CID } : null) },
      Contact: { exists: () => chain(verifiedContact ? { _id: 'c1' } : null) },
      OtpChallenge: {}, Session: {}, AccountEvent: {}
    };
    const conn = wrapConn(models, {
      collection: (name) => ({
        findOne: async () => {
          if (name === 'customer_tiers') return { tier: 'SILVER' };
          if (name === 'customer_tier_policies') return {
            _id: 'current', version: 2, state: 'APPROVED', approvedBy: 'owner',
            approvedAt: new Date(NOW_MS - 1000), approvalReference: 'APP-02',
            discountsBps: { MEMBER: 0, SILVER: 500, GOLD: 1000 }
          };
          if (name === 'bookings') return overdue;
          return null;
        }
      })
    });
    return createProductPricingEligibility({ connection: conn, refusalLimit: '2' });
  }

  test('SHOP-ELIG-01-UTCID01 [N] returns SILVER 500 bps when eligible and zeroes discount when overdue or guest', async () => {
    const elig = buildEligHarness();
    expect(await elig.read(null)).toMatchObject({ tierCode: null, discountBps: 0, prepaidOnly: false });
    expect(await elig.read(CID, { includeReason: true })).toEqual({
      tierCode: 'SILVER',
      tierPolicyVersion: 2,
      discountBps: 500,
      prepaidOnly: false,
      discountBlockedReason: null
    });

    const overdueElig = buildEligHarness({ overdue: { _id: 1 } });
    expect(await overdueElig.read(CID, { includeReason: true })).toMatchObject({
      discountBps: 0,
      discountBlockedReason: 'OVERDUE'
    });
  });

  test('SHOP-ELIG-02-UTCID01 [B] requiresPrepayment is false at limit (2) and true above limit (3)', async () => {
    expect(await buildEligHarness({ refusals: 2 }).requiresPrepayment(CID)).toBe(false);
    expect(await buildEligHarness({ refusals: 3 }).requiresPrepayment(CID)).toBe(true);
  });

  test('SHOP-ELIG-03-UTCID01 [N] readDiscountHold returns PREPAID_ONLY, OVERDUE, or null', async () => {
    expect(await buildEligHarness({ refusals: 3 }).readDiscountHold(CID)).toBe('PREPAID_ONLY');
    expect(await buildEligHarness({ overdue: { _id: 1 } }).readDiscountHold(CID)).toBe('OVERDUE');
    expect(await buildEligHarness().readDiscountHold(CID)).toBeNull();
  });

  test('SHOP-ELIG-04-UTCID01 [N] readCounterCustomer returns tier for verified customer and rejects unverified customer', async () => {
    await expect(buildEligHarness().readCounterCustomer(CID)).resolves.toMatchObject({ tierCode: 'SILVER', discountBps: 500 });
    await expect(buildEligHarness({ verifiedContact: false }).readCounterCustomer(CID))
      .rejects.toMatchObject({ code: 'COUNTER_CUSTOMER_UNAVAILABLE', status: 422 });
  });

  // SHOP-RCPT-01..02
  test('SHOP-RCPT-01-UTCID01 [N] findIntent maps online PLACED order to PRODUCT_ORDER AWAITING_PAYMENT intent', async () => {
    const orderDoc = {
      _id: new Types.ObjectId(ORD_ID),
      channel: 'ONLINE',
      receiveMethod: 'DELIVERY',
      paymentMethod: 'PREPAID',
      status: 'PLACED',
      paid: false,
      total: 250000,
      version: 1,
      paymentDeadlineAt: NOW,
      payment: { providerReferences: ['123456'] }
    };
    const ProductOrder = {
      findOne: () => chain(orderDoc),
      findOneAndUpdate: () => chain({ ...orderDoc, paid: true, version: 2 }),
      updateOne: jest.fn(async () => ({}))
    };
    const models = { ProductOrder, Product: {}, ProductCart: {}, ProductStockReceipt: {}, Supplier: {}, ProductCustomerRefusal: {} };
    const receipts = createProductOrderReceipts({
      connection: {
        models,
        model: n => models[n] ?? { collection: { name: n.toLowerCase() } },
        db: { collection: () => ({ findOne: async () => null, insertOne: async () => ({}), updateOne: async () => ({}) }) }
      }
    });

    const intent = await receipts.findIntent('123456');
    expect(intent).toMatchObject({ kind: 'PRODUCT_ORDER', id: ORD_ID, state: 'PENDING', orderState: 'AWAITING_PAYMENT', amountVnd: 250000 });
  });

  test('SHOP-RCPT-02-UTCID01 [N] apply records verified payment receipt and transitions unpaid PLACED order to APPLIED', async () => {
    const orderDoc = {
      _id: new Types.ObjectId(ORD_ID),
      channel: 'ONLINE',
      receiveMethod: 'DELIVERY',
      paymentMethod: 'PREPAID',
      status: 'PLACED',
      paid: false,
      total: 250000,
      version: 1,
      paymentDeadlineAt: NOW,
      payment: { providerReferences: ['123456'] }
    };
    const ProductOrder = {
      findOne: () => chain(orderDoc),
      findOneAndUpdate: () => chain({ ...orderDoc, paid: true, version: 2 }),
      updateOne: jest.fn(async () => ({}))
    };
    const models = { ProductOrder, Product: {}, ProductCart: {}, ProductStockReceipt: {}, Supplier: {}, ProductCustomerRefusal: {} };
    const receipts = createProductOrderReceipts({
      connection: {
        models,
        model: n => models[n] ?? { collection: { name: n.toLowerCase() } },
        db: { collection: () => ({ findOne: async () => null, insertOne: async () => ({}), updateOne: async () => ({}) }) }
      }
    });
    const applied = await receipts.apply({
      session: {},
      decision: { type: 'APPLY', intentId: ORD_ID, expectedIntentVersion: 1 },
      receipt: {
        eventId: 'ev1',
        providerOrderCode: '123456',
        providerTransactionReference: 'tx-001',
        amountVnd: 250000,
        currency: 'VND',
        providerCode: '00'
      },
      at: NOW
    });
    expect(applied).toEqual({ status: 'APPLIED', orderId: ORD_ID });
  });

  test('SHOP-RCPT-02-UTCID02 [A] apply returns DUPLICATE for already-recorded identical receipt and RECONCILIATION_REQUIRED for unknown order', async () => {
    const paidOrder = {
      _id: new Types.ObjectId(ORD_ID),
      channel: 'ONLINE',
      receiveMethod: 'DELIVERY',
      paymentMethod: 'PREPAID',
      status: 'PLACED',
      paid: true,
      total: 250000,
      version: 2,
      payment: {
        providerReferences: ['123456'],
        receipts: [{ state: 'VERIFIED', providerOrderCode: '123456', transactionReference: 'tx-001', amountVnd: 250000 }]
      }
    };
    let present = true;
    const models = {
      ProductOrder: { findOne: () => chain(present ? paidOrder : null), updateOne: jest.fn(async () => ({})) },
      Product: {}, ProductCart: {}, ProductStockReceipt: {}, Supplier: {}, ProductCustomerRefusal: {}
    };
    const receipts = createProductOrderReceipts({
      connection: { models, model: n => models[n] ?? { collection: { name: n.toLowerCase() } }, db: { collection: () => ({ findOne: async () => null }) } }
    });
    await expect(receipts.apply({
      session: {},
      decision: { type: 'APPLY', intentId: ORD_ID, expectedIntentVersion: 1 },
      receipt: { eventId: 'ev2', providerOrderCode: '123456', providerTransactionReference: 'tx-001', amountVnd: 250000, currency: 'VND', providerCode: '00' },
      at: NOW
    })).resolves.toEqual({ status: 'DUPLICATE' });

    present = false;
    await expect(receipts.apply({
      session: {},
      decision: { type: 'APPLY', intentId: ORD_ID, expectedIntentVersion: 1 },
      receipt: { eventId: 'ev3', providerOrderCode: '999', amountVnd: 1000 },
      at: NOW
    })).resolves.toMatchObject({ status: 'RECONCILIATION_REQUIRED', reason: 'UNKNOWN_REFERENCE' });
  });
});

describe('Visit Tracker, Booking Cancellation & Visit Handover', () => {
  // VISIT-TRACK-01
  test('VISIT-TRACK-01-UTCID01 [N] builds customer milestone progress for COMPLETED visit and throws 404 for non-customer', async () => {
    const checkInAt = new Date(NOW_MS - 3600000);
    const checkOutAt = new Date(NOW_MS - 600000);
    const booking = { _id: new Types.ObjectId(BID), state: 'CLOSED', bookingCode: 'BK-10', visitIds: [new Types.ObjectId(VID)] };
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: booking._id,
      state: 'COMPLETED',
      sitterId: new Types.ObjectId(SITTER_ID),
      assignedAt: new Date(NOW_MS - 7200000),
      checkInAt,
      checkOutAt,
      startAt: checkInAt,
      endAt: checkOutAt,
      checklist: [{ itemId: 'i1', status: 'DONE' }],
      snapshots: { serviceName: 'Chăm tại nhà', careMinutes: 60, pets: [{ name: 'Bơ' }] }
    };
    const dbCols = {
      bookings: { findOne: async () => booking },
      visits: { findOne: async () => visit },
      pets: { find: () => ({ toArray: async () => [] }) },
      users: { findOne: async () => ({ _id: new Types.ObjectId(SITTER_ID), displayName: 'Sitter An', state: 'ACTIVE', roles: ['PET_SITTER'] }) },
      reviews: { aggregate: () => ({ toArray: async () => [{ rating: 4.8, reviewCount: 5 }] }) },
      sitterstatuses: { findOne: async () => ({ _id: 1 }) },
      sitterpublicprofiles: { findOne: async () => ({ bio: 'Yêu thú cưng', areas: ['HN'] }) }
    };
    const FinanceSourceEvent = { collection: { findOne: async () => ({ at: new Date(NOW_MS - 1800000) }) } };
    const models = {
      FinanceSourceCommand: {}, FinanceSourceEvent, BookingChangeProposal: {},
      Service: {}, ServiceVersion: {}, ServicePolicyVersion: {}, ServicePriceVersion: {},
      SystemSettingVersion: {}, PetBreed: { find: () => chain([]) }
    };
    const svc = createVisitTrackerService({
      connection: wrapConn(models, { collection: n => dbCols[n] }),
      clock: () => NOW_MS
    });
    const out = await svc.read({ userId: CID, roles: ['CUSTOMER'] }, { bookingId: BID, visitId: VID });
    expect(out.visit.status).toBe('REPORT_READY');
    expect(out.actions.careReport).toBe(true);
    expect(out.sitter).toMatchObject({ name: 'Sitter An', reviewCount: 5 });

    await expect(svc.read({ userId: CID, roles: ['STAFF'] }, { bookingId: BID, visitId: VID }))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });

  // BKG-CANCEL-IN-01..03
  test('BKG-CANCEL-IN-01-UTCID01 [N] validates BOOKING vs VISIT scope in bookingCancellationPreviewInput', () => {
    expect(bookingCancellationPreviewInput({ scope: 'BOOKING' })).toEqual({ scope: 'BOOKING', visitId: null });
    expect(bookingCancellationPreviewInput({ scope: 'VISIT', visitId: VID })).toEqual({ scope: 'VISIT', visitId: VID });
    expect(() => bookingCancellationPreviewInput({ scope: 'BOOKING', visitId: VID })).toThrow();
  });

  test('BKG-CANCEL-IN-02-UTCID01 [N] trims optional cancellation reason and rejects > 500 chars', () => {
    expect(bookingCancellationInput({ scope: 'BOOKING', reason: '  Thay đổi kế hoạch  ' }))
      .toEqual({ scope: 'BOOKING', visitId: null, reason: 'Thay đổi kế hoạch' });
    expect(() => bookingCancellationInput({ scope: 'BOOKING', reason: 'x'.repeat(501) })).toThrow();
  });

  test('BKG-CANCEL-IN-03-UTCID01 [B] parses adminBookingRefundsQuery limit 1..100 and optional bookingId', () => {
    expect(adminBookingRefundsQuery({})).toEqual({ limit: 50, bookingId: null });
    expect(adminBookingRefundsQuery({ limit: '100', bookingId: BID })).toEqual({ limit: 100, bookingId: BID });
    expect(() => adminBookingRefundsQuery({ limit: '101' })).toThrow();
  });

  // BKG-CANCEL-01..03
  function buildCancelHarness() {
    const startAt = new Date(NOW_MS + 48 * 3600000); // > 24h free cancellation
    const endAt = new Date(NOW_MS + 49 * 3600000);
    const booking = {
      _id: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      state: 'DISPATCH_PENDING',
      paymentMode: 'PREPAY',
      paymentState: 'PAID',
      version: 1,
      visitIds: [new Types.ObjectId(VID)],
      paymentSnapshot: { amountVnd: 300000 },
      checkoutSnapshot: { customerVisits: [{ visitId: VID, amountVnd: 300000, snapshots: { serviceName: 'Chăm tại nhà' } }] }
    };
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: booking._id,
      customerId: booking.customerId,
      state: 'SCHEDULED',
      version: 0,
      startAt,
      endAt,
      sitterId: null,
      snapshots: { serviceName: 'Chăm tại nhà', baseVnd: 300000 }
    };
    const requiredCollections = [
      'bookings', 'visits', 'payments', 'paymentintents', 'refunds', 'cases',
      'financesourcecommands', 'financesourceevents', 'bookingchangeproposals',
      'bookingchangerequests', 'employeevisitoffers', 'notificationoutboxes', 'users'
    ];
    const insertedRefunds = [];
    const dbCols = {
      bookings: {
        findOne: async () => booking,
        findOneAndUpdate: async (_f, u) => ({ ...booking, ...u.$set, version: 2 }),
        find: () => ({ toArray: async () => [booking] })
      },
      visits: {
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [visit] }) }), limit: () => ({ toArray: async () => [{ ...visit, state: 'CANCELLED' }] }), toArray: async () => [visit] }),
        updateOne: async () => ({ matchedCount: 1 })
      },
      payments: {
        find: () => ({ limit: () => ({ toArray: async () => [{ state: 'VERIFIED', receiptMoney: { currency: 'VND', amountVnd: 300000 } }] }) })
      },
      refunds: {
        find: () => ({
          limit: () => ({ toArray: async () => [] }),
          sort: () => ({ limit: () => ({ toArray: async () => insertedRefunds }) })
        }),
        countDocuments: async () => insertedRefunds.length,
        findOne: async () => null,
        insertOne: async doc => { insertedRefunds.push(doc); return {}; }
      },
      employeevisitoffers: { updateMany: async () => ({}) },
      bookingchangerequests: { find: () => ({ limit: () => ({ toArray: async () => [] }) }) },
      users: { find: () => ({ toArray: async () => [{ _id: new Types.ObjectId(CID), displayName: 'Khách An' }] }) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const models = {
      FinanceSourceCommand: { collection: { name: 'financesourcecommands' }, findById: () => chain(null), create: async d => d },
      FinanceSourceEvent: { collection: { name: 'financesourceevents' }, create: async d => d },
      BookingChangeProposal: { collection: { name: 'bookingchangeproposals' } }
    };
    const conn = wrapConn(models, {
      listCollections: () => ({ toArray: async () => requiredCollections.map(name => ({ name })) }),
      collection: name => ({
        listIndexes: () => ({
          toArray: async () => [
            { name: '_id_', key: { _id: 1 } },
            ...financeSourceIndexes
              .filter(([colName]) => colName === name)
              .map(([, keys, opts]) => ({ key: keys, ...opts }))
          ]
        }),
        find: () => ({ toArray: async () => [] }),
        insertOne: async () => ({}),
        updateOne: async () => ({}),
        findOne: async () => null,
        ...(dbCols[name] ?? {})
      })
    });
    return createBookingCancellationService({ connection: conn, clock: () => NOW });
  }

  test('BKG-CANCEL-01-UTCID01 [N] preview computes full 300,000 VND free cancellation refund >= 24h before visit', async () => {
    const svc = buildCancelHarness();
    const prev = await svc.preview({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, BID, { scope: 'BOOKING' });
    expect(prev).toMatchObject({
      bookingId: BID,
      freeCancellation: true,
      lateFeeTotalVnd: 0,
      refundTotalVnd: 300000
    });
  });

  test('BKG-CANCEL-02-UTCID01 [N] cancel records accounting refund, returns MSG28, and BKG-CANCEL-03 lists admin refunds', async () => {
    const svc = buildCancelHarness();
    const res = await svc.cancel(
      { userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] },
      BID,
      { scope: 'BOOKING', reason: 'Thay đổi kế hoạch' },
      'cancel-key-0001'
    );
    expect(res).toMatchObject({
      bookingId: BID,
      bookingState: 'CANCELLED',
      refundTotalVnd: 300000,
      recordedRefundIds: [`cancel:${VID}`],
      messageCode: 'MSG28'
    });

    // BKG-CANCEL-03
    const list = await svc.listBookingRefunds({ userId: ADMIN_ID, state: 'ACTIVE', roles: ['ADMIN'] }, { bookingId: BID });
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ bookingId: BID, amountVnd: 300000 });
  });

  // HANDOVER-POL-01..04 & HANDOVER-SVC-01..02
  test('HANDOVER-POL-01-UTCID01 [N] handoverPending is true only when handoverRequired=true and handoverAccepted!==true', () => {
    expect(handoverPending({ handoverRequired: true, handoverAccepted: false })).toBe(true);
    expect(handoverPending({ handoverRequired: true, handoverAccepted: true })).toBe(false);
    expect(handoverPending({ handoverRequired: false })).toBe(false);
  });

  test('HANDOVER-POL-02-UTCID01 [N] flagVisitHandover sets handoverRequired and clears prior acceptance/acknowledgement', () => {
    const flagged = flagVisitHandover(SITTER_ID, NOW, { reasonText: 'Đổi người' });
    expect(flagged.set).toMatchObject({ handoverRequired: true, handoverAccepted: false });
    expect(flagged.unset).toHaveProperty('careAcknowledgement', 1);
  });

  test('HANDOVER-POL-03-UTCID01 [B] urgentReplacement is true inside 60m window and false at exact 60m boundary', () => {
    const startAt = new Date(NOW_MS + 60 * 60000);
    expect(urgentReplacement({ handoverRequired: true }, new Date(NOW_MS + 1), startAt)).toBe(true);
    expect(urgentReplacement({ handoverRequired: true }, NOW, startAt)).toBe(false);
  });

  test('HANDOVER-POL-04-UTCID01 [N] lateCheckInExempt honors explicit flag or falls back to urgentReplacement', () => {
    expect(lateCheckInExempt({ handoverRequired: true, handoverLateCheckInExempt: true })).toBe(true);
    expect(lateCheckInExempt({ handoverRequired: false, handoverLateCheckInExempt: true })).toBe(false);
  });

  test('HANDOVER-SVC-01-UTCID01 [N] get returns PENDING care version and HANDOVER-SVC-02 confirm marks CONFIRMED', async () => {
    const care = {
      schemaVersion: 1,
      capturedAt: NOW,
      pets: [{ id: PROD_ID, name: 'Bơ', careProfile: { feeding: { status: 'KNOWN', value: 'Ăn hạt 2 bữa' } } }]
    };
    const careVersion = digest(care);
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      sitterId: new Types.ObjectId(SITTER_ID),
      state: 'ASSIGNED',
      version: 1,
      checkInAt: null,
      assignedAt: NOW,
      startAt: new Date(NOW_MS + 7200000),
      endAt: new Date(NOW_MS + 10800000),
      handoverRequired: true,
      handoverAccepted: false,
      handoverNote: { previousSitterId: CID, reasonText: 'Ốm' },
      snapshots: { care, serviceName: 'Chăm tại nhà', checklistItems: [{ label: 'Cho ăn' }] }
    };
    const booking = {
      _id: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      bookingCode: 'BK-99',
      state: 'ASSIGNED',
      visitIds: [visit._id],
      checkoutSnapshot: { consentAt: NOW }
    };
    const models = {
      Pet: { find: () => chain([{ _id: new Types.ObjectId(PROD_ID), breedCode: 'POODLE' }]) },
      PetBreed: { find: () => chain([{ code: 'POODLE', name: 'Poodle' }]) },
      VaccinationRecord: {}, CustomerAddress: {},
      EmployeeVisitOffer: { db: null },
      EmployeeScheduleCommand: { findById: () => chain(null), create: jest.fn(async d => d) },
      EmployeeScheduleEvent: { create: jest.fn(async d => d) }
    };
    models.EmployeeVisitOffer.db = wrapConn(models);
    const cols = {
      visits: {
        findOne: async () => visit,
        find: () => ({ sort: () => ({ toArray: async () => [] }) }),
        updateOne: async () => ({ matchedCount: 1 })
      },
      bookings: { findOne: async () => booking },
      users: { find: () => ({ toArray: async () => [{ _id: new Types.ObjectId(CID), displayName: 'Sitter Cũ', roles: ['STAFF'] }] }) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const svc = createVisitHandoverService({
      repository: {
        col: n => cols[n] ?? cols.notificationoutboxes,
        uow: { run: fn => fn({}) },
        models,
        employeeGuard: jest.fn(async () => ({}))
      },
      clock: () => NOW_MS
    });
    const sitter = { userId: SITTER_ID, state: 'ACTIVE', roles: ['PET_SITTER'] };
    const got = await svc.get(sitter, VID);
    expect(got).toMatchObject({ visitId: VID, state: 'PENDING', care: { version: careVersion, tasks: ['Cho ăn'] } });

    // HANDOVER-SVC-02
    const confirmed = await svc.confirm(sitter, VID, {
      expectedVersion: 1,
      careVersion,
      acknowledged: true
    }, 'ho-key-0001');
    expect(confirmed).toMatchObject({ visitId: VID, state: 'CONFIRMED', version: 2 });
  });
});
