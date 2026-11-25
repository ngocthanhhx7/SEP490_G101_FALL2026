import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createSessionService } from '../../src/services/session.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { provisionBookingChanges } from '../../src/services/booking-change/booking-change-store.js';
import { createBookingRefundBilling } from '../../src/services/complaints/booking-refund-billing.service.js';
import { pricingModels } from '../../src/models/pricing.model.js';
import { bookingChangeModels } from '../../src/models/booking-change.model.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { notificationModels } from '../../src/models/notification.model.js';

const HOST = 'localhost:3000';
const ORIGIN = 'http://localhost:3000';
const BASE_NOW = Date.parse('2026-11-26T02:00:00Z'); // 09:00 Asia/Ho_Chi_Minh

let replica;
let connection;
let currentNow = BASE_NOW;
let app;
let sessionService;
let customerId;
let otherCustomerId;
let sitterId;
let adminId;
let serviceId;

async function issueSession(userId) {
  const user = await connection.db.collection('users').findOne({ _id: userId });
  return connection.transaction(mongoSession => sessionService.issueInTransaction(user, mongoSession));
}

function authHeaders(session) {
  return {
    Host: HOST,
    Origin: ORIGIN,
    Cookie: `${sessionService.cookieName}=${session.token}`,
    'X-CSRF-Token': session.csrfToken
  };
}

async function seedBooking({
  ownerId = customerId,
  bookingState = 'DISPATCH_PENDING',
  paymentMode = 'PREPAY',
  paymentState = 'PAID',
  visitSpecs,
  comboPerVisitBps = 100,
  comboMaxBps = 1000,
  orderFeeVnd = 0,
  paidReceiptVnd = null
}) {
  const { PricingPolicy } = pricingModels(connection);
  const policyVersion = 1;
  await PricingPolicy.updateOne(
    { serviceId, version: policyVersion },
    {
      $set: {
        serviceId,
        version: policyVersion,
        status: 'APPROVED',
        effectiveAt: new Date(BASE_NOW - 86400000),
        approvedAt: new Date(BASE_NOW - 86400000),
        billingMode: 'PER_VISIT',
        unitMinutes: 60,
        maxPets: 2,
        extraPetBps: 0,
        maxSurchargeBps: 10000,
        orderStepVnd: 5000000,
        orderStepBps: 200,
        maxOrderTierBps: 2000,
        groupStrategy: 'MAX',
        comboPerVisitBps,
        comboMaxBps,
        rules: []
      }
    },
    { upsert: true }
  );

  const count = visitSpecs.length;
  const comboBps = Math.min(count * comboPerVisitBps, comboMaxBps);
  const totalBase = visitSpecs.reduce((sum, spec) => sum + (spec.baseVnd ?? 120000), 0);
  const totalSurcharge = visitSpecs.reduce((sum, spec) => sum + (spec.surchargeVnd ?? 0), 0);
  const totalDiscount = Math.round((totalBase * comboBps) / 10000);
  const subtotalVnd = totalBase + totalSurcharge - totalDiscount;
  const totalVnd = subtotalVnd + orderFeeVnd;

  const bookingId = new mongoose.Types.ObjectId();
  const visits = visitSpecs.map((spec, index) => {
    const baseVnd = spec.baseVnd ?? 120000;
    const surchargeVnd = spec.surchargeVnd ?? 0;
    const discountVnd = Math.round((baseVnd * comboBps) / 10000);
    const employeeServiceNetVnd = baseVnd + surchargeVnd - discountVnd;
    return {
      _id: new mongoose.Types.ObjectId(),
      bookingId,
      customerId: ownerId,
      serviceId,
      petIds: [new mongoose.Types.ObjectId()],
      sitterId: spec.sitterId ?? null,
      state: spec.state ?? 'SCHEDULED',
      version: 0,
      sequence: index,
      areaCode: 'DISTRICT_CAU_GIAY',
      location: 'HOME',
      startAt: new Date(spec.startAt),
      endAt: new Date(spec.startAt + 3600000),
      evidenceRefs: [],
      snapshots: {
        baseVnd,
        surchargeVnd,
        discountVnd,
        employeeServiceNetVnd,
        pricingPolicyVersion: policyVersion,
        serviceName: 'Chăm sóc tại gia',
        serviceAddress: '12 Cầu Giấy, Hà Nội',
        careMinutes: 60,
        pets: [{ id: 'pet-1', name: 'Bông', species: 'DOG', weightKg: 6, traits: [], version: 0 }]
      }
    };
  });

  await connection.db.collection('bookings').insertOne({
    _id: bookingId,
    customerId: ownerId,
    quoteId: new mongoose.Types.ObjectId(),
    quoteVersion: 1,
    originalVisitCount: visits.length,
    careVisitCount: visits.length,
    visitIds: visits.map(row => row._id),
    state: bookingState,
    paymentMode,
    paymentState,
    paymentSnapshot: { amountVnd: totalVnd, currency: 'VND' },
    ...(paymentMode === 'PREPAY' ? { paymentDeadlineAt: new Date(BASE_NOW + 900000) } : {}),
    version: 0,
    financeGuardVersion: 0,
    createdAt: new Date(BASE_NOW - 3600000),
    checkoutSnapshot: {
      quote: {
        baseVnd: totalBase,
        surchargeVnd: totalSurcharge,
        discountVnd: totalDiscount,
        comboBps,
        subtotalVnd,
        orderFeeVnd,
        totalVnd,
        visitCount: visits.length
      },
      customerVisits: visits,
      consentAt: new Date(BASE_NOW - 3600000)
    }
  });
  await connection.db.collection('visits').insertMany(visits);

  if (paymentState === 'PAID') {
    await connection.db.collection('payments').insertOne({
      _id: new mongoose.Types.ObjectId(),
      bookingId,
      customerId: ownerId,
      provider: 'PAYOS',
      providerEventId: 'evt-' + String(bookingId),
      state: 'VERIFIED',
      receiptMoney: { amountVnd: paidReceiptVnd ?? totalVnd, currency: 'VND' },
      verifiedAt: new Date(BASE_NOW - 3500000),
      version: 0
    });
  }

  return { bookingId: String(bookingId), bookingOid: bookingId, visits, totalVnd, totalDiscount };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'booking_cancel_test' }).asPromise();
  await provisionFinanceSources(connection);
  await provisionBookingChanges(connection);
  for (const model of [
    ...Object.values(pricingModels(connection)),
    ...Object.values(employeeSchedulingModels(connection)),
    ...Object.values(notificationModels(connection))
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }

  const config = {
    env: 'test',
    app: { name: 'paw-world-care-test', version: '0.1.0' },
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000,
    auth: {
      enabled: true,
      tokenSecret: 't'.repeat(32),
      csrfSecret: 'c'.repeat(32),
      otpSecret: 'o'.repeat(32),
      contactLookupSecret: 'l'.repeat(32),
      contactEncryptionKey: 'e'.repeat(32)
    }
  };
  const clock = () => currentNow;
  sessionService = createSessionService({
    connection,
    clock,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });

  app = createApp({
    config,
    connection,
    clock,
    env: {
      BOOKING_CHECKOUT_ENABLED: 'true',
      FINANCE_SOURCES_ENABLED: 'true',
      BOOKING_WEB_ORIGIN: ORIGIN
    }
  });
}, 120000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

beforeEach(async () => {
  currentNow = BASE_NOW;
  for (const name of [
    'users', 'sessions', 'bookings', 'visits', 'payments', 'paymentintents', 'refunds',
    'employeevisitoffers', 'bookingchangerequests', 'notifications', 'financesourcecommands', 'financesourceevents'
  ]) {
    await connection.db.collection(name).deleteMany({});
  }
  customerId = new mongoose.Types.ObjectId();
  otherCustomerId = new mongoose.Types.ObjectId();
  sitterId = new mongoose.Types.ObjectId();
  adminId = new mongoose.Types.ObjectId();
  serviceId = new mongoose.Types.ObjectId();
  await connection.db.collection('users').insertMany([
    { _id: customerId, displayName: 'Khách hàng A', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
    { _id: otherCustomerId, displayName: 'Khách hàng B', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
    { _id: sitterId, displayName: 'Sitter Minh', roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
    { _id: adminId, displayName: 'Quản trị viên', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0 }
  ]);
});

describe('Customer cancel booking or visit (UC-39, GBR-15, GBR-17, GBR-19)', () => {
  test('ST-BKG-30: free cancellation >= 24h cancels whole booking, revokes offers, records refunds and notifies sitter', async () => {
    const customerSession = await issueSession(customerId);
    const { bookingId, visits } = await seedBooking({
      visitSpecs: [
        { startAt: BASE_NOW + 30 * 3600000, state: 'ASSIGNED', sitterId, baseVnd: 120000 },
        { startAt: BASE_NOW + 54 * 3600000, state: 'OFFERED', baseVnd: 120000 }
      ]
    });
    await connection.db.collection('employeevisitoffers').insertOne({
      _id: new mongoose.Types.ObjectId(),
      visitId: visits[1]._id,
      sitterId,
      state: 'PENDING',
      version: 0
    });

    const preview = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellation-preview`)
      .set(authHeaders(customerSession))
      .send({ scope: 'BOOKING' });
    expect(preview.status).toBe(200);
    expect(preview.body.data.freeCancellation).toBe(true);
    expect(preview.body.data.lateFeeTotalVnd).toBe(0);
    expect(preview.body.data.refundTotalVnd).toBe(235200); // 240,000 - 2% combo (4,800)

    const cancel = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-free-booking-01' })
      .send({ scope: 'BOOKING', reason: 'Thay đổi kế hoạch' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data).toMatchObject({
      bookingId,
      bookingState: 'CANCELLED',
      lateFeeTotalVnd: 0,
      refundTotalVnd: 235200,
      notifiedSitterCount: 1,
      messageCode: 'MSG28'
    });
    expect(cancel.body.data.recordedRefundIds).toHaveLength(2);

    const savedBooking = await connection.db.collection('bookings').findOne({ _id: new mongoose.Types.ObjectId(bookingId) });
    expect(savedBooking.state).toBe('CANCELLED');
    const savedVisits = await connection.db.collection('visits').find({ bookingId: savedBooking._id }).toArray();
    expect(savedVisits.every(v => v.state === 'CANCELLED' && v.cancellationReason === 'Thay đổi kế hoạch')).toBe(true);
    const offer = await connection.db.collection('employeevisitoffers').findOne({ visitId: visits[1]._id });
    expect(offer.state).toBe('REVOKED');
    const sitterNotice = await connection.db.collection('notifications').findOne({ recipientId: String(sitterId), eventType: 'VisitCancelledByCustomer' });
    expect(sitterNotice).toBeTruthy();

    // Booking details includes recorded refunds
    const details = await request(app)
      .get(`/api/v1/checkout/bookings/${bookingId}`)
      .set(authHeaders(customerSession));
    expect(details.status).toBe(200);
    expect(details.body.data.details.refunds).toHaveLength(2);
    expect(details.body.data.details.refunds.reduce((sum, row) => sum + row.amountVnd, 0)).toBe(235200);
  });

  test('ST-BKG-30: < 24h without accepted sitter is free; < 24h with accepted sitter keeps 30% of pre-discount price', async () => {
    const customerSession = await issueSession(customerId);
    // Case A: < 24h, SCHEDULED (no sitter accepted) -> free (GBR-15)
    const freeCase = await seedBooking({
      visitSpecs: [{ startAt: BASE_NOW + 6 * 3600000, state: 'SCHEDULED', baseVnd: 100000, surchargeVnd: 20000 }],
      comboPerVisitBps: 0
    });
    const freePreview = await request(app)
      .post(`/api/v1/checkout/bookings/${freeCase.bookingId}/cancellation-preview`)
      .set(authHeaders(customerSession))
      .send({ scope: 'BOOKING' });
    expect(freePreview.status).toBe(200);
    expect(freePreview.body.data.lateFeeTotalVnd).toBe(0);
    expect(freePreview.body.data.refundTotalVnd).toBe(120000);

    // Case B: < 24h, ASSIGNED with surcharge + combo -> 30% of pre-discount (base + surcharge)
    const lateCase = await seedBooking({
      visitSpecs: [
        { startAt: BASE_NOW + 6 * 3600000, state: 'ASSIGNED', sitterId, baseVnd: 100000, surchargeVnd: 20000 },
        { startAt: BASE_NOW + 72 * 3600000, state: 'SCHEDULED', baseVnd: 100000, surchargeVnd: 20000 }
      ],
      comboPerVisitBps: 100 // 2 visits => 2% of 200,000 = 4,000 (2,000 each); net per visit = 118,000
    });
    const latePreview = await request(app)
      .post(`/api/v1/checkout/bookings/${lateCase.bookingId}/cancellation-preview`)
      .set(authHeaders(customerSession))
      .send({ scope: 'VISIT', visitId: String(lateCase.visits[0]._id) });
    expect(latePreview.status).toBe(200);
    // Pre-discount price = 120,000 -> 30% late fee = 36,000
    // Remaining 1 visit combo goes 2% -> 1% on 100,000 => combo adjustment = 1,000
    // Refund = 118,000 - 36,000 - 1,000 = 81,000
    expect(latePreview.body.data.lateFeeTotalVnd).toBe(36000);
    expect(latePreview.body.data.comboDiscountAdjustmentVnd).toBe(1000);
    expect(latePreview.body.data.refundTotalVnd).toBe(81000);

    const lateCancel = await request(app)
      .post(`/api/v1/checkout/bookings/${lateCase.bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-late-visit-01' })
      .send({ scope: 'VISIT', visitId: String(lateCase.visits[0]._id), reason: 'Đặt nhầm ngày hoặc giờ' });
    expect(lateCancel.status).toBe(200);
    expect(lateCancel.body.data.lateFeeTotalVnd).toBe(36000);
    expect(lateCancel.body.data.refundTotalVnd).toBe(81000);
    expect(lateCancel.body.data.bookingState).toBe('DISPATCH_PENDING');
  });

  test('final cancellation refunds only the saved order fee, preserving an earlier late fee', async () => {
    const customer = await issueSession(customerId);
    const { bookingId, visits } = await seedBooking({ comboPerVisitBps: 0, orderFeeVnd: 5000, visitSpecs: [
      { startAt: BASE_NOW + 6 * 3600000, state: 'ASSIGNED', sitterId, baseVnd: 100000 },
      { startAt: BASE_NOW + 72 * 3600000, state: 'SCHEDULED', baseVnd: 100000 }
    ] });
    const cancel = i => request(app).post('/api/v1/checkout/bookings/' + bookingId + '/cancellations')
      .set({ ...authHeaders(customer), 'Idempotency-Key': 'late-then-free-' + i })
      .send({ scope: 'VISIT', visitId: String(visits[i]._id) });
    expect((await cancel(0).expect(200)).body.data.refundTotalVnd).toBe(70000);
    expect((await cancel(1).expect(200)).body.data.refundTotalVnd).toBe(105000);
  });

  test('partial cancellation cannot leave an unpaid prepaid intent charging for a cancelled visit', async () => {
    const customer = await issueSession(customerId);
    const { bookingId, visits } = await seedBooking({ paymentState: 'UNPAID', visitSpecs: [
      { startAt: BASE_NOW + 48 * 3600000, state: 'SCHEDULED', baseVnd: 100000 },
      { startAt: BASE_NOW + 72 * 3600000, state: 'SCHEDULED', baseVnd: 100000 }
    ] });
    const result = await request(app).post('/api/v1/checkout/bookings/' + bookingId + '/cancellations')
      .set({ ...authHeaders(customer), 'Idempotency-Key': 'no-stale-intent' })
      .send({ scope: 'VISIT', visitId: String(visits[0]._id) }).expect(409);
    expect(result.body.error.code).toBe('CANCELLATION_PAYMENT_PENDING');
    expect((await connection.db.collection('visits').findOne({ _id: visits[0]._id })).state).toBe('SCHEDULED');
  });

  test('a paid flag without a verified receipt cannot authorize a refund', async () => {
    const customer = await issueSession(customerId);
    const { bookingId, bookingOid } = await seedBooking({ visitSpecs: [
      { startAt: BASE_NOW + 48 * 3600000, state: 'SCHEDULED', baseVnd: 100000 }
    ] });
    await connection.db.collection('payments').deleteMany({ bookingId: bookingOid });
    await request(app).post('/api/v1/checkout/bookings/' + bookingId + '/cancellations')
      .set({ ...authHeaders(customer), 'Idempotency-Key': 'no-receipt-001' }).send({ scope: 'BOOKING' }).expect(409);
    expect(await connection.db.collection('refunds').countDocuments({ bookingId: bookingOid })).toBe(0);
  });

  test('ST-BKG-31: multi-visit sequential cancellation recalculates combo discount accurately and respects GBR-30 cap', async () => {
    const customerSession = await issueSession(customerId);
    const { bookingId, visits, totalVnd } = await seedBooking({
      visitSpecs: [
        { startAt: BASE_NOW + 48 * 3600000, state: 'SCHEDULED', baseVnd: 120000 },
        { startAt: BASE_NOW + 72 * 3600000, state: 'SCHEDULED', baseVnd: 120000 },
        { startAt: BASE_NOW + 96 * 3600000, state: 'SCHEDULED', baseVnd: 120000 }
      ],
      comboPerVisitBps: 100 // 3 visits => 3% = 10,800; total paid = 349,200
    });
    expect(totalVnd).toBe(349200);

    // Cancel visit 1 (3 -> 2 visits): 2 remaining lose 1% each = 2,400 => refund = 116,400 - 2,400 = 114,000
    const first = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'seq-cancel-001' })
      .send({ scope: 'VISIT', visitId: String(visits[0]._id) });
    expect(first.status).toBe(200);
    expect(first.body.data.comboDiscountAdjustmentVnd).toBe(2400);
    expect(first.body.data.refundTotalVnd).toBe(114000);

    // Verify compatibility with #447 booking-refund-billing (GBR-30)
    const billing = createBookingRefundBilling({ connection });
    const billAfterFirst = await billing.read({ bookingId });
    expect(billAfterFirst).toMatchObject({
      basisAmountVnd: 349200,
      approvedTotalVnd: 114000,
      billTotalVnd: 235200
    });

    // Cancel visit 2 (2 -> 1 visit): refund = 117,600 - 1,200 = 116,400
    const second = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'seq-cancel-002' })
      .send({ scope: 'VISIT', visitId: String(visits[1]._id) });
    expect(second.status).toBe(200);
    expect(second.body.data.comboDiscountAdjustmentVnd).toBe(1200);
    expect(second.body.data.refundTotalVnd).toBe(116400);

    // Cancel final visit 3 (1 -> 0 visits): refund = 118,800; sum = 349,200 exact!
    const third = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'seq-cancel-003' })
      .send({ scope: 'VISIT', visitId: String(visits[2]._id) });
    expect(third.status).toBe(200);
    expect(third.body.data.refundTotalVnd).toBe(118800);
    expect(third.body.data.bookingState).toBe('CANCELLED');
    expect(114000 + 116400 + 118800).toBe(349200);
  });

  test('GBR-19: cancelling a visit reconciles pending booking change request and closes it when empty', async () => {
    const customerSession = await issueSession(customerId);
    const { bookingId, visits } = await seedBooking({
      visitSpecs: [{ startAt: BASE_NOW + 48 * 3600000, state: 'SCHEDULED', baseVnd: 120000 }]
    });
    const { BookingChangeRequest } = bookingChangeModels(connection);
    const changeId = new mongoose.Types.ObjectId();
    await BookingChangeRequest.create({
      _id: changeId,
      bookingId,
      customerId: String(customerId),
      scope: 'VISIT',
      state: 'PENDING',
      version: 0,
      expiresAt: new Date(BASE_NOW + 42 * 3600000),
      recheckAt: new Date(BASE_NOW + 60000),
      pendingVisitIds: [String(visits[0]._id)],
      removedVisitIds: [],
      items: [{
        visitId: String(visits[0]._id),
        oldStartAt: visits[0].startAt,
        oldEndAt: visits[0].endAt,
        newStartAt: new Date(BASE_NOW + 72 * 3600000),
        newEndAt: new Date(BASE_NOW + 73 * 3600000)
      }]
    });

    const cancel = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-reconcile-01' })
      .send({ scope: 'VISIT', visitId: String(visits[0]._id) });
    expect(cancel.status).toBe(200);

    const reconciled = await connection.db.collection('bookingchangerequests').findOne({ _id: changeId });
    expect(reconciled.state).toBe('CLOSED');
    expect(reconciled.pendingVisitIds).toEqual([]);
    expect(reconciled.removedVisitIds).toContain(String(visits[0]._id));
  });

  test('rejects started visits, non-owners, and enforces idempotency; exposes Admin booking-refunds endpoint', async () => {
    const customerSession = await issueSession(customerId);
    const otherSession = await issueSession(otherCustomerId);
    const adminSession = await issueSession(adminId);

    const { bookingId, visits } = await seedBooking({
      visitSpecs: [
        { startAt: BASE_NOW - 60000, state: 'SCHEDULED', baseVnd: 120000 }, // already started!
        { startAt: BASE_NOW + 48 * 3600000, state: 'SCHEDULED', baseVnd: 120000 }
      ]
    });

    // Started visit must be rejected on both preview and cancel
    const startedPreview = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellation-preview`)
      .set(authHeaders(customerSession))
      .send({ scope: 'VISIT', visitId: String(visits[0]._id) });
    expect(startedPreview.status).toBe(409);
    expect(startedPreview.body.error.code).toBe('VISIT_ALREADY_STARTED');

    const startedCancel = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-started-01' })
      .send({ scope: 'VISIT', visitId: String(visits[0]._id) });
    expect(startedCancel.status).toBe(409);
    expect(startedCancel.body.error.code).toBe('VISIT_ALREADY_STARTED');

    // Non-owner cannot preview or cancel
    const forbidden = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(otherSession), 'Idempotency-Key': 'cancel-other-owner-01' })
      .send({ scope: 'VISIT', visitId: String(visits[1]._id) });
    expect(forbidden.status).toBe(404);

    // Idempotent replay succeeds with identical result; payload mismatch returns 409
    const ok1 = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-idem-key-01' })
      .send({ scope: 'VISIT', visitId: String(visits[1]._id), reason: 'Lý do khác' });
    expect(ok1.status).toBe(200);

    const ok2 = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-idem-key-01' })
      .send({ scope: 'VISIT', visitId: String(visits[1]._id), reason: 'Lý do khác' });
    expect(ok2.status).toBe(200);
    expect(ok2.body.data).toEqual(ok1.body.data);

    const mismatch = await request(app)
      .post(`/api/v1/checkout/bookings/${bookingId}/cancellations`)
      .set({ ...authHeaders(customerSession), 'Idempotency-Key': 'cancel-idem-key-01' })
      .send({ scope: 'BOOKING' });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    // Admin booking refunds endpoint enforces ADMIN role and returns cancellation refund record
    const custDenied = await request(app)
      .get('/api/v1/admin/booking-refunds')
      .set(authHeaders(customerSession));
    expect(custDenied.status).toBe(403);

    const adminList = await request(app)
      .get('/api/v1/admin/booking-refunds')
      .set(authHeaders(adminSession));
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.total).toBe(1);
    expect(adminList.body.data.items[0]).toMatchObject({
      bookingId,
      visitId: String(visits[1]._id),
      sourceType: 'BOOKING_CANCELLATION',
      state: 'RECORDED',
      reason: 'Lý do khác',
      customer: { id: String(customerId), displayName: 'Khách hàng A' }
    });
  });
});
