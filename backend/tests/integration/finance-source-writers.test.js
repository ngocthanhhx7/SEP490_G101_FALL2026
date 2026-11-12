import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createComplaintRouter } from '../../src/routes/complaint.routes.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { settlementModels } from '../../src/models/settlement.model.js';
import { earningAccrualModels } from '../../src/models/earning-accrual.model.js';
import { financeSourceModels } from '../../src/models/finance-source.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';
import { createMongoComplaintRepository } from '../../src/services/complaints/mongo-complaint.repository.js';
import { payrollModels } from '../../src/models/payroll.model.js';

let replica, connection, service, webhook, booking, visits, actors, admin, customer, complaints, images, at, models;
const oid = () => new mongoose.Types.ObjectId();
const col = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'finance_primary_writer_test', autoIndex: false }).asPromise();
  await provisionSettlementStorage(connection); await provisionFinanceSources(connection, { legacyTasks: true });
  await col('privateimages').insertOne({ _id: 'provisioning-sentinel' }); await col('privateimages').deleteMany({});
  models = { ...financeSourceModels(connection, { legacyTasks: true }), ...earningAccrualModels(connection), ...settlementModels(connection),
    ...payrollModels(connection), SitterStatus: sitterApplicationModels(connection).SitterStatus };
  for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  await models.SitterStatus.createCollection(); await models.SitterStatus.createIndexes();
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  for (const name of ['bookings', 'visits', 'payments', 'taxassessments', 'paymentintents', 'cases', 'refunds',
    'privateimages', 'users', 'notifications', 'syntheticcomplaintadjustments']) await col(name).deleteMany({});
  for (const model of Object.values(models)) await model.deleteMany({});
  at = new Date('2026-10-30T03:00:00Z');
  service = createBookingFinanceSourceService({ connection, clock: () => at, compensationModel: 'LEGACY_PARTNER' });
  webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => at });
  actors = [0, 1].map(() => ({ userId: String(oid()), state: 'ACTIVE', roles: ['PET_SITTER'], expiresAt: at.getTime() + 86400000 }));
  admin = { userId: String(oid()), state: 'ACTIVE', roles: ['ADMIN'], expiresAt: at.getTime() + 86400000 };
  customer = { userId: String(oid()), state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: at.getTime() + 86400000 };
  complaints = createComplaintService({ repository: createMongoComplaintRepository({ connection, finance: service, compensationModel: 'LEGACY_PARTNER',
    cursorSecret: 'synthetic-complaint-cursor-secret-0001' }), clock: () => at });
  for (const actor of actors) await models.SitterStatus.create({ userId: actor.userId, status: 'ACTIVE', changedAt: at });
  booking = { _id: oid(), customerId: new mongoose.Types.ObjectId(customer.userId),
    state: 'AWAITING_PAYMENT', originalVisitCount: 2, paymentMode: 'PREPAY', version: 0 };
  visits = actors.map((actor, index) => ({ _id: oid(), bookingId: booking._id, sitterId: new mongoose.Types.ObjectId(actor.userId),
    state: 'ASSIGNED', startAt: at, endAt: new Date(at.getTime() + 3600000), version: 0,
    snapshots: { serviceBasisVnd: (index + 1) * 100000, checklistItemIds: ['feed'] }, evidenceRefs: [] }));
  booking.visitIds = visits.map(row => row._id);
  await col('bookings').insertOne(booking); await col('visits').insertMany(visits);
  await col('paymentintents').insertOne({ _id: oid(), bookingId: booking._id, provider: 'PAYOS', providerReference: '12345',
    amountVnd: 300000, currency: 'VND', state: 'PENDING', version: 0, expiresAt: new Date(at.getTime() + 600000) });
  images = actors.map((actor, index) => [String(index + 1).repeat(64), String(index + 3).repeat(64)]);
  for (let index = 0; index < actors.length; index++) for (const mediaId of images[index]) {
    await col('privateimages').insertOne({ _id: mediaId, ownerId: new mongoose.Types.ObjectId(actors[index].userId),
      state: 'READY', contentDigest: 'a'.repeat(64), byteLength: 100, contentType: 'image/jpeg' });
  }
});
const payment = () => ({ data: { orderCode: 12345, reference: 'synthetic-bank-transaction', amount: 300000, currency: 'VND', code: '00' } });
const command = (index, expectedVersion, key, extra = {}) => ({ actor: actors[index], visitId: String(visits[index]._id),
  expectedVersion, idempotencyKey: key, ...extra });
async function payAndAssign() {
  expect(await webhook.handleWebhook(payment())).toEqual({ status: 'PAYMENT_VERIFIED' });
  // Assignment is an independent upstream command, outside these source writers.
  await col('bookings').updateOne({ _id: booking._id }, { $set: { state: 'ASSIGNED' }, $inc: { version: 1 } });
}
async function finish(index) {
  await service.checkIn(command(index, 0, 'check-in-one', { mediaId: images[index][0] }));
  await service.updateChecklist(command(index, 1, 'checklist-one', { items: [{ itemId: 'feed', status: 'DONE' }] }));
  return service.checkOut(command(index, 2, 'check-out-one', { mediaId: images[index][1] }));
}

test('verified webhook, real checkout writers and delayed assessment create reconciled immutable earnings', async () => {
  await payAndAssign();
  expect(await webhook.handleWebhook(payment())).toEqual({ status: 'DUPLICATE' });
  await finish(0);
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
  await finish(1);
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(2);
  expect(await models.Earning.countDocuments()).toBe(0);
  expect((await service.drain()).every(row => row.code === 'EARNING_SOURCE_PENDING')).toBe(true);
  const current = await col('bookings').findOne({ _id: booking._id });
  const assessment = { actor: admin, bookingId: String(booking._id), expectedVersion: current.version,
    idempotencyKey: 'assessment-one', totalTaxVnd: 10000, evidenceReference: 'assessment:synthetic-confirmed' };
  const first = await service.confirmAssessment(assessment);
  expect(await service.confirmAssessment(assessment)).toEqual(first);
  expect((await service.drain()).every(row => row.code === 'ACCRUED')).toBe(true);
  expect(await service.checkOut(command(1, 2, 'check-out-one', { mediaId: images[1][1] })))
    .toMatchObject({ state: 'COMPLETED', version: 3 });
  const snapshots = await models.BookingEarningSnapshot.find().sort({ serviceBasisVnd: 1 }).lean();
  expect(snapshots.map(row => row.sitterTaxCostVnd)).toEqual([1667, 3333]);
  expect(snapshots.map(row => row.accruedVnd)).toEqual([88333, 176667]);
  expect(await models.EarningLedgerEntry.countDocuments()).toBe(2);
  expect(await service.drain()).toEqual([]);
});

test('prepayment, ownership, time window, incomplete checklist and reused evidence block primary writes', async () => {
  await col('bookings').updateOne({ _id: booking._id }, { $set: { state: 'ASSIGNED' } });
  await expect(service.checkIn(command(0, 0, 'check-in-one', { mediaId: images[0][0] }))).rejects.toMatchObject({ code: 'PREPAYMENT_REQUIRED' });
  await col('bookings').updateOne({ _id: booking._id }, { $set: { state: 'AWAITING_PAYMENT' } });
  await payAndAssign();
  await expect(service.checkIn(command(0, 0, 'check-in-one', { mediaId: images[1][0] }))).rejects.toMatchObject({ code: 'EVIDENCE_NOT_READY' });
  const savedAt = at; at = new Date(at.getTime() - 1800001);
  await expect(service.checkIn(command(0, 0, 'check-in-one', { mediaId: images[0][0] }))).rejects.toMatchObject({ code: 'CHECK_IN_TOO_EARLY' });
  at = savedAt;
  await service.checkIn(command(0, 0, 'check-in-one', { mediaId: images[0][0] }));
  await expect(service.checkOut(command(0, 1, 'check-out-one', { mediaId: images[0][1] }))).rejects.toMatchObject({ code: 'CHECKLIST_REQUIRED' });
  await service.updateChecklist(command(0, 1, 'checklist-one', { items: [{ itemId: 'feed', status: 'SKIPPED', reason: 'Synthetic exception' }] }));
  await expect(service.checkOut(command(0, 2, 'check-out-one', { mediaId: images[0][0] }))).rejects.toMatchObject({ code: 'EVIDENCE_ALREADY_USED' });
  expect((await col('visits').findOne({ _id: visits[0]._id })).state).toBe('IN_PROGRESS');
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
});

test('transaction rollback preserves checkout when completion ordinal storage is unavailable', async () => {
  await payAndAssign(); await finish(0);
  await service.checkIn(command(1, 0, 'check-in-one', { mediaId: images[1][0] }));
  await service.updateChecklist(command(1, 1, 'checklist-one', { items: [{ itemId: 'feed', status: 'DONE' }] }));
  await models.WeeklyBookingCounter.collection.dropIndex('sitterId_1_weekKey_1');
  try {
    await expect(service.checkOut(command(1, 2, 'check-out-one', { mediaId: images[1][1] })))
      .rejects.toMatchObject({ code: 'SETTLEMENT_STORAGE_NOT_READY' });
    expect((await col('visits').findOne({ _id: visits[1]._id })).state).toBe('IN_PROGRESS');
    expect(await models.CareMediaBinding.exists({ _id: images[1][1] })).toBeNull();
    expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
  } finally { await models.WeeklyBookingCounter.createIndexes(); }
});

test('simultaneous final checkouts produce one booking completion and distinct durable tasks', async () => {
  await payAndAssign();
  for (let index = 0; index < 2; index++) {
    await service.checkIn(command(index, 0, 'check-in-one', { mediaId: images[index][0] }));
    await service.updateChecklist(command(index, 1, 'checklist-one', { items: [{ itemId: 'feed', status: 'DONE' }] }));
  }
  await Promise.all([0, 1].map(index => service.checkOut(command(index, 2, 'check-out-one', { mediaId: images[index][1] }))));
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(2);
  expect(await models.FinanceSourceEvent.countDocuments({ type: 'BookingCompleted' })).toBe(1);
  expect(await models.EarningAccrualTask.countDocuments()).toBe(2);
});

async function assessAndAccrue() {
  const current = await col('bookings').findOne({ _id: booking._id });
  await service.confirmAssessment({ actor: admin, bookingId: String(booking._id), expectedVersion: current.version,
    idempotencyKey: 'assessment-one', totalTaxVnd: 10000, evidenceReference: 'assessment:synthetic-confirmed' });
  return service.drain();
}
async function openComplaint() {
  return complaints.submit({ actor: customer, visitId: String(visits[0]._id), expectedVersion: 3,
    idempotencyKey: 'complaint-one', category: 'OTHER', summary: 'Synthetic complaint', description: 'Synthetic description' });
}
async function closeComplaint(opened) {
  await complaints.resolve({ actor: admin, complaintId: opened.complaintId, expectedVersion: 0,
    idempotencyKey: 'complaint-resolve', customerResult: 'Synthetic resolution', handlingNotes: 'Synthetic internal note' });
  await complaints.object({ actor: customer, complaintId: opened.complaintId, expectedVersion: 1,
    idempotencyKey: 'complaint-object', reason: 'Synthetic objection' });
  await complaints.decide({ actor: admin, complaintId: opened.complaintId, expectedVersion: 2,
    idempotencyKey: 'complaint-decision', customerResult: 'Synthetic final conclusion' });
}

test('real complaint writer holds both sitter accruals and audited Admin close wakes the durable tasks', async () => {
  await payAndAssign(); await finish(0); await finish(1);
  const opened = await openComplaint();
  expect(await openComplaint()).toEqual(opened);
  expect((await assessAndAccrue()).every(row => row.code === 'EARNING_HELD')).toBe(true);
  expect(await models.Earning.countDocuments()).toBe(0);
  await closeComplaint(opened);
  expect((await service.drain()).every(row => row.code === 'ACCRUED')).toBe(true);
  expect(await models.Earning.countDocuments()).toBe(2);
  const list = await complaints.list({ actor: customer, query: { limit: 1 } });
  expect(list.items).toHaveLength(1);
  await expect(complaints.get({ actor: { ...customer, userId: String(oid()) }, complaintId: opened.complaintId }))
    .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});

test('complaint opened after accrual moves both earnings to HELD and releases through ledger audit', async () => {
  await payAndAssign(); await finish(0); await finish(1); await assessAndAccrue();
  const opened = await openComplaint();
  expect(await models.Earning.countDocuments({ state: 'HELD' })).toBe(2);
  expect(await models.EarningLedgerEntry.countDocuments({ toBucket: 'HELD' })).toBe(2);
  await closeComplaint(opened);
  expect(await models.Earning.countDocuments({ state: 'AVAILABLE' })).toBe(2);
  expect(await models.EarningLedgerEntry.countDocuments({ fromBucket: 'HELD', toBucket: 'AVAILABLE' })).toBe(2);
});

test('GBR-26 automatic finality clears the complaint hold view while legacy ledger locks still require release', async () => {
  await payAndAssign(); await finish(0); await finish(1); await assessAndAccrue();
  const { complaintId } = await openComplaint();
  expect(await models.Earning.countDocuments({ state: 'HELD' })).toBe(2);
  await complaints.resolve({ actor: admin, complaintId, expectedVersion: 0,
    idempotencyKey: 'automatic-final-result', handlingNotes: 'Synthetic notes', customerResult: 'Synthetic result' });

  const cutoff = new Date(+at + 72 * 3600000);
  at = cutoff;
  expect(await complaints.readBookingComplaintHold({ bookingId: String(booking._id) })).toMatchObject({
    billState: null, hasUnfinalizedComplaints: false, latestFinalAt: cutoff.toISOString()
  });
  expect(await service.drain()).toEqual([]);
  expect(await models.Earning.countDocuments({ state: 'HELD' })).toBe(2);
  expect(await models.EarningLedgerEntry.countDocuments({ fromBucket: 'HELD', toBucket: 'AVAILABLE' })).toBe(0);
});

test('employee completion writes one immutable credit per visit and never creates partner earnings', async () => {
  service = createBookingFinanceSourceService({ connection, clock: () => at });
  webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => at });
  await col('bookings').updateOne({ _id: booking._id }, { $set: { paymentSnapshot: { currency: 'VND', amountVnd: 300000 } } });
  for (const visit of visits) await col('visits').updateOne({ _id: visit._id }, { $set: { 'snapshots.employeeServiceNetVnd': visit.snapshots.serviceBasisVnd - 10000 } });
  await payAndAssign();
  for (let index = 0; index < 2; index++) {
    await service.checkIn(command(index, 0, 'employee-check-in', { mediaId: images[index][0] }));
    await service.updateChecklist(command(index, 1, 'employee-checklist', { items: [{ itemId: 'feed', status: 'DONE' }] }));
  }
  at = new Date(at.getTime() + 3600000);
  await Promise.all([0, 1].map(index => service.checkOut(command(index, 2, 'employee-check-out', { mediaId: images[index][1] }))));
  await service.checkOut(command(1, 2, 'employee-check-out', { mediaId: images[1][1] }));
  const credits = await models.PayrollServiceCredit.find().sort({ serviceNetVnd: 1 }).lean();
  expect(credits.map(c => [c.serviceNetVnd, c.careMinutes, c.onTime, c.reportsComplete])).toEqual([[90000, 60, true, true], [190000, 60, true, true]]);
  expect(await models.Earning.countDocuments()).toBe(0);
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
  expect(await models.EarningAccrualTask.countDocuments()).toBe(0);
  expect(await service.drain()).toEqual([]);
});

test('employee completion refuses legacy price basis and rolls back the final checkout', async () => {
  service = createBookingFinanceSourceService({ connection, clock: () => at });
  webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => at });
  await col('bookings').updateOne({ _id: booking._id }, { $set: { paymentSnapshot: { currency: 'VND', amountVnd: 300000 } } });
  await payAndAssign(); await finish(0);
  await expect(finish(1)).rejects.toMatchObject({ code: 'PAYROLL_SOURCE_RECONCILIATION_REQUIRED' });
  expect((await col('visits').findOne({ _id: visits[1]._id })).state).toBe('IN_PROGRESS');
  expect(await models.PayrollServiceCredit.countDocuments()).toBe(0);
  expect(await models.CareMediaBinding.exists({ _id: images[1][1] })).toBeNull();
});


test('UC-52 whole booking and visit have independent holds, scoped by owner', async () => {
  await payAndAssign(); await finish(0); await finish(1);
  const customerVisitId = String(oid());
  await col('visits').updateOne({ _id: visits[0]._id }, { $set: { customerVisitId } });
  const eligibility = await complaints.eligibility({ actor: customer, bookingId: String(booking._id) });
  expect(eligibility.visits).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: String(visits[0]._id), customerVisitId }),
    expect.objectContaining({ id: String(visits[1]._id) })
  ]));
  const input = { actor: customer, scope: 'BOOKING', bookingId: String(booking._id),
    description: 'Synthetic booking complaint', idempotencyKey: 'booking-complaint' };
  const opened = await complaints.submit(input);
  expect(opened).toMatchObject({ messageCode: 'MSG128', complaint: {
    scope: 'BOOKING', visitId: null, state: 'OPEN', code: expect.stringMatching(/^KN-[0-9A-F]{12}$/)
  } });
  await expect(complaints.submit(input)).resolves.toEqual(opened);
  await expect(complaints.submit({ ...input, idempotencyKey: 'duplicate-booking-complaint' }))
    .rejects.toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
  await openComplaint();
  expect(await complaints.readBookingComplaintHold({ bookingId: input.bookingId }))
    .toMatchObject({ billState: 'ON_HOLD', hasUnfinalizedComplaints: true });
  expect(await col('bookings').findOne({ _id: booking._id })).toMatchObject({ state: 'COMPLETED' });
  expect(await col('cases').findOne({ _id: opened.complaintId })).toMatchObject({ visitId: null, billState: 'ON_HOLD' });
  await expect(complaints.get({ actor: actors[0], complaintId: opened.complaintId })).rejects.toMatchObject({ status: 404 });
});

test('UC-52 rejects an ineligible booking, and fails closed when all visits were cancelled without a bill source', async () => {
  const input = { actor: customer, scope: 'BOOKING', bookingId: String(booking._id),
    description: 'Synthetic booking complaint', idempotencyKey: 'booking-complaint' };
  await expect(complaints.submit(input)).rejects.toMatchObject({ code: 'BOOKING_NOT_ENDED' });
  await col('visits').updateMany({ bookingId: booking._id }, { $set: { state: 'CANCELLED', cancelledAt: at } });
  await expect(complaints.submit(input)).rejects.toMatchObject({ status: 503, code: 'BILLING_SOURCE_UNAVAILABLE' });
  expect(await col('cases').countDocuments()).toBe(0);
  expect(await col('bookings').findOne({ _id: booking._id })).toMatchObject({ state: 'AWAITING_PAYMENT' });
});

test('UC-52 staff-closed eligibility uses bound check-in photo and close time', async () => {
  const input = { actor: customer, scope: 'VISIT', visitId: String(visits[0]._id), bookingId: String(booking._id),
    idempotencyKey: 'staff-close-complaint', description: 'Synthetic complaint' };
  await payAndAssign();
  await col('visits').updateOne({ _id: visits[0]._id }, { $set: { state: 'STAFF_CLOSED', closedAt: at } });
  await expect(complaints.submit(input)).rejects.toMatchObject({ code: 'VISIT_NOT_ELIGIBLE' });
  await col('privateimages').updateOne({ _id: images[0][0] }, { $set: { careVisitId: input.visitId, careKind: 'CHECK_IN' } });
  await col('visits').updateOne({ _id: visits[0]._id }, { $set: { evidenceRefs: [{ kind: 'CHECK_IN', mediaId: images[0][0] }] } });
  await expect(complaints.submit(input)).resolves.toMatchObject({ state: 'OPEN' });
});

test('GBR-26 a published result is final at the stored 72-hour cutoff and releases the complaint slot', async () => {
  await payAndAssign(); await finish(0); await finish(1);
  const opened = await openComplaint();
  const resolved = await complaints.resolve({ actor: admin, complaintId: opened.complaintId,
    expectedVersion: 0, idempotencyKey: 'no-money-result', handlingNotes: 'Internal only', customerResult: 'Synthetic result' });
  expect(resolved).toMatchObject({ state: 'RESOLVED', messageCode: 'MSG131' });
  const cutoff = new Date(+at + 72 * 3600000);
  const ownerAt = time => ({ ...customer, expiresAt: +time + 3600000 });
  at = new Date(+cutoff - 1);
  expect(await complaints.get({ actor: ownerAt(at), complaintId: opened.complaintId })).toMatchObject({
    finalAt: null, objection: { allowed: true }
  });
  await expect(complaints.submit({ actor: ownerAt(at), visitId: String(visits[0]._id),
    description: 'Synthetic retry', idempotencyKey: 'different-complaint' })).rejects.toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
  at = cutoff;
  const detail = await complaints.get({ actor: ownerAt(at), complaintId: opened.complaintId });
  expect(detail).toMatchObject({ state: 'RESOLVED', finalAt: cutoff.toISOString(), objection: { allowed: false } });
  expect(detail).not.toHaveProperty('handlingNotes');
  const status = await complaints.readBookingComplaintHold({ bookingId: String(booking._id) });
  expect(status).toMatchObject({ billState: null, hasUnfinalizedComplaints: false, latestFinalAt: cutoff.toISOString() });
  await expect(complaints.object({ actor: ownerAt(at), complaintId: opened.complaintId,
    expectedVersion: 1, reason: 'Synthetic late reason', idempotencyKey: 'late-objection' }))
    .rejects.toMatchObject({ code: 'OBJECTION_WINDOW_EXPIRED' });
  await expect(complaints.submit({ actor: ownerAt(at), visitId: String(visits[0]._id),
    description: 'Synthetic second complaint', idempotencyKey: 'different-complaint' })).resolves.toMatchObject({ state: 'OPEN' });
});

test('UC-51 unwired billing leaves a complaint open with no proposal or financial effects', async () => {
  await payAndAssign(); await finish(0); await finish(1);
  const { complaintId } = await openComplaint();
  await col('privateimages').insertOne({ _id: 'a'.repeat(64), state: 'READY', contentType: 'image/jpeg', ownerId: new mongoose.Types.ObjectId(admin.userId) });
  await expect(complaints.resolve({ actor: admin, complaintId, expectedVersion: 0, idempotencyKey: 'propose-refund',
    handlingNotes: 'Synthetic notes', customerResult: 'Synthetic result',
    proposal: { amountVnd: 10000, reason: 'Synthetic reason', evidenceRefs: ['a'.repeat(64)] } }))
    .rejects.toMatchObject({ status: 503, code: 'BILLING_SOURCE_UNAVAILABLE' });
  expect(await col('cases').findOne({ _id: complaintId })).toMatchObject({ state: 'OPEN', version: 0 });
  expect(await col('refunds').countDocuments()).toBe(0);
});


function complaintBillingFixture({ basis = 'EXPECTED', billTotalVnd = 100000, paidInFull = false } = {}) {
  return {
    async read({ session }) {
      const adjusted = await col('syntheticcomplaintadjustments').aggregate([
        { $group: { _id: null, total: { $sum: '$deltaVnd' } } }
      ], { session }).next();
      return { basis, billTotalVnd, basisAmountVnd: 100000, approvedTotalVnd: 70000 + (adjusted?.total ?? 0), paidInFull };
    },
    async applyAdjustment({ session, ref, bookingId, amountVnd, priorAmountVnd, disposition }) {
      await col('syntheticcomplaintadjustments').insertOne({ _id: ref, bookingId,
        deltaVnd: amountVnd - priorAmountVnd, disposition }, { session });
      return { applied: true };
    }
  };
}

function complaintServiceWithFixture(billing, readImage) {
  return createComplaintService({ billing, readImage, clock: () => at, repository: createMongoComplaintRepository({
    connection, finance: service, compensationModel: 'LEGACY_PARTNER',
    cursorSecret: 'synthetic-complaint-cursor-secret-0001', clock: () => at
  }) });
}

function complaintApp(complaintService, actor) {
  const app = express();
  app.use(express.json(), requestId);
  app.use('/api/v1/complaints', createComplaintRouter({ service: complaintService, clock: () => +at,
    sessionPort: { authenticate: async () => actor, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' },
    allowedOrigins: ['https://pwc.example.invalid'] }));
  app.use(errorHandler(() => {}));
  return request(app);
}

const csrf = (req, key) => req.set('Origin', 'https://pwc.example.invalid')
  .set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', key);

test.each([
  ['APPROVE', 24000, false], ['REDUCE', 14000, true], ['REJECT', null, false]
])('UC-51 fixture %s publishes the customer result and preserves role and money boundaries', async (outcome, amountVnd, paidInFull) => {
  await payAndAssign(); await finish(0); await finish(1);
  const staff = { ...admin, userId: String(oid()), roles: ['STAFF'] };
  for (const operator of [staff, admin]) {
    await col('users').insertOne({ _id: new mongoose.Types.ObjectId(operator.userId), roles: operator.roles,
      state: 'ACTIVE', displayName: 'Synthetic operator' });
  }
  const mediaId = 'a'.repeat(64), customerImage = 'b'.repeat(64);
  await col('privateimages').insertMany([
    { _id: mediaId, state: 'READY', contentType: 'image/jpeg', ownerId: new mongoose.Types.ObjectId(staff.userId) },
    { _id: customerImage, state: 'READY', contentType: 'image/png', ownerId: new mongoose.Types.ObjectId(customer.userId) }
  ]);
  complaints = complaintServiceWithFixture(complaintBillingFixture({ basis: paidInFull ? 'ISSUED' : 'EXPECTED', paidInFull }),
    async ({ id }) => ({ contentType: id === customerImage ? 'image/png' : 'image/jpeg', body: Buffer.from('synthetic-blob') }));
  const opened = await complaints.submit({ actor: customer, visitId: String(visits[0]._id), expectedVersion: 3,
    idempotencyKey: 'submit-complaint', description: 'Synthetic feedback', evidenceRefs: [customerImage] });
  const path = '/api/v1/complaints/' + opened.complaintId;
  const staffApi = complaintApp(complaints, staff), adminApi = complaintApp(complaints, admin), customerApi = complaintApp(complaints, customer);
  const proposal = { amountVnd: 24000, reason: 'Synthetic private reason', evidenceRefs: [mediaId] };
  const base = { expectedVersion: 0, handlingNotes: 'Synthetic private notes', customerResult: 'Synthetic public result' };
  const overCap = await csrf(staffApi.post(path + '/resolution'), 'propose-too-much')
    .send({ ...base, proposal: { ...proposal, amountVnd: 30001 } });
  expect(overCap.status).toBe(422);
  expect(overCap.body.error).toMatchObject({ code: 'REFUND_CAP_EXCEEDED', messageCode: 'MSG44', remainingVnd: 30000 });
  const sent = await csrf(staffApi.post(path + '/resolution'), 'propose-refund').send({ ...base, proposal });
  expect(sent.status).toBe(200);
  expect(sent.body.data).toMatchObject({ state: 'OPEN', messageCode: 'MSG147' });
  const proposals = await adminApi.get('/api/v1/complaints/refund-proposals').expect(200);
  expect(proposals.body.data.items).toHaveLength(1);
  expect((await adminApi.get(path + '/refund-proposal').expect(200)).body.data.proposal).toMatchObject({
    amountVnd: proposal.amountVnd, reason: proposal.reason, evidenceRefs: [{ mediaId }]
  });
  const waiting = await customerApi.get(path);
  expect(waiting.body.data).toMatchObject({ state: 'OPEN', customerResult: null, approvedAmountVnd: null });
  expect(waiting.text).not.toContain('Synthetic private');
  expect(waiting.text).not.toContain(mediaId);
  const evidence = await staffApi.get(path + '/evidence/' + customerImage + '/content').expect(200);
  expect(evidence.headers['cache-control']).toBe('private, no-store');
  expect(evidence.body).toEqual(Buffer.from('synthetic-blob'));
  expect((await customerApi.get(path + '/evidence/' + mediaId + '/content')).status).toBe(404);
  expect((await complaintApp(complaints, actors[0]).get(path + '/evidence/' + customerImage + '/content')).status).toBe(403);

  const payload = { expectedVersion: 1, outcome, ...(outcome === 'REDUCE' ? { amountVnd } : {}),
    ...(outcome === 'REJECT' ? { reason: 'Synthetic rejection' } : {}) };
  expect((await csrf(staffApi.post(path + '/refund-decision'), 'decide-refund').send(payload)).status).toBe(403);
  if (outcome === 'REJECT') {
    const missing = await csrf(adminApi.post(path + '/refund-decision'), 'reject-without-reason').send({ expectedVersion: 1, outcome });
    expect(missing.body.error).toMatchObject({ messageCode: 'MSG01' });
  }
  const decided = await csrf(adminApi.post(path + '/refund-decision'), 'decide-refund').send(payload);
  expect(decided.status).toBe(200);
  expect(decided.body.data).toMatchObject({ state: 'RESOLVED', complaint: { moneyDecision: { outcome, amountVnd, decidedBy: admin.userId } } });
  const replay = await csrf(adminApi.post(path + '/refund-decision'), 'decide-refund').send(payload);
  expect(replay.body.data).toEqual(decided.body.data);
  expect((await customerApi.get(path)).body.data).toMatchObject({
    state: 'RESOLVED', customerResult: 'Synthetic public result', approvedAmountVnd: amountVnd, objection: { allowed: true }
  });
  const adjustments = await col('syntheticcomplaintadjustments').find().toArray();
  expect(adjustments).toEqual(amountVnd === null ? [] : [expect.objectContaining({
    deltaVnd: amountVnd, disposition: paidInFull ? 'ACCOUNTING_REFUND' : 'BILL_CREDIT'
  })]);
  const notifications = await col('notifications').find({ eventType: { $in: [
    'ComplaintOpened', 'ComplaintRefundProposed', 'ComplaintRefundDecided'
  ] } }).toArray();
  expect(notifications.map(({ eventType, recipientId }) => [eventType, recipientId])).toEqual(expect.arrayContaining([
    ['ComplaintOpened', staff.userId], ['ComplaintRefundProposed', admin.userId],
    ['ComplaintRefundDecided', staff.userId], ['ComplaintRefundDecided', customer.userId]
  ]));
  expect(notifications).toHaveLength(4);
  const customerLink = '/account/bookings/' + booking._id + '/complaints/new?complaint=' + opened.complaintId;
  expect(notifications.find(notification => notification.recipientId === customer.userId)?.deepLink).toBe(customerLink);
  expect(notifications.filter(notification => notification.recipientId !== customer.userId)
    .every(notification => notification.deepLink === null)).toBe(true);

  if (outcome === 'APPROVE') {
    const disputed = await csrf(customerApi.post(path + '/objections'), 'reject-result')
      .send({ expectedVersion: 2, reason: 'Synthetic objection' });
    expect(disputed.body.data.state).toBe('ESCALATED');
    const final = await csrf(adminApi.post(path + '/decision'), 'final-decision')
      .send({ expectedVersion: 3, customerResult: 'Synthetic revised result', amountVnd: 10000 });
    expect(final.body.data).toMatchObject({ state: 'RESOLVED', complaint: {
      finalAt: at.toISOString(), approvedAmountVnd: 10000
    } });
    expect(await col('notifications').findOne({ eventType: 'ComplaintDecided', recipientId: customer.userId }))
      .toMatchObject({ deepLink: customerLink });
    expect(await col('syntheticcomplaintadjustments').countDocuments({ deltaVnd: -14000 })).toBe(1);
  }
});

test.each([0, 15000])('UC-52 all-cancelled booking requires a positive issued bill (%s VND fixture)', async billTotalVnd => {
  await col('visits').updateMany({ bookingId: booking._id }, { $set: { state: 'CANCELLED', cancelledAt: at } });
  complaints = complaintServiceWithFixture(complaintBillingFixture({ basis: 'ISSUED', billTotalVnd }));
  const bookingId = String(booking._id);
  const path = '/api/v1/complaints/eligibility/bookings/' + bookingId;
  const { body: { data: eligibility } } = await complaintApp(complaints, customer).get(path).expect(200);
  await complaintApp(complaints, { ...customer, userId: String(oid()) }).get(path).expect(404);
  expect(eligibility.wholeBooking).toMatchObject({ eligible: billTotalVnd > 0, aboveVisitTable: billTotalVnd > 0 });
  expect(eligibility.visits.every(visit => !visit.canSubmit)).toBe(true);
  const result = complaints.submit({ actor: customer, scope: 'BOOKING', bookingId,
    description: 'Synthetic all-cancelled case', idempotencyKey: 'all-cancelled-complaint' });
  if (billTotalVnd) {
    await expect(result).resolves.toMatchObject({ state: 'OPEN' });
    expect(await col('bookings').findOne({ _id: booking._id })).toMatchObject({ state: 'AWAITING_PAYMENT' });
  } else await expect(result).rejects.toMatchObject({ code: 'BOOKING_NOT_ELIGIBLE' });
});

test('UC-53 searches, counts and paginates by sent time with role-scoped detail', async () => {
  await payAndAssign(); await finish(0); await finish(1);
  await col('bookings').updateOne({ _id: booking._id }, { $set: { code: 'BK-0042' } });
  await col('users').insertOne({ _id: new mongoose.Types.ObjectId(customer.userId), displayName: 'Trần Thị Lan' });
  const first = await openComplaint();
  at = new Date(+at + 1000);
  const second = await complaints.submit({ actor: customer, scope: 'BOOKING', bookingId: String(booking._id),
    description: 'Synthetic second case', idempotencyKey: 'second-complaint' });
  const list = await complaints.list({ actor: admin, query: { q: 'BK-0042', limit: 1 } });
  expect(list).toMatchObject({ items: [{ id: second.complaintId }], counts: { OPEN: 2, ESCALATED: 0, RESOLVED: 0 } });
  expect((await complaints.list({ actor: admin, query: { q: 'BK-0042', limit: 1, cursor: list.nextCursor } })).items[0].id)
    .toBe(first.complaintId);
  expect((await complaints.list({ actor: admin, query: { q: 'Trần', sort: 'oldest' } })).items[0].id).toBe(first.complaintId);
  expect((await complaints.list({ actor: admin, query: { q: first.complaint.code } })).items).toHaveLength(1);
  expect((await complaints.list({ actor: admin, query: { q: '.*' } })).items).toHaveLength(0);
  expect((await complaintApp(complaints, null).get('/api/v1/complaints')).status).toBe(401);
  expect((await complaintApp(complaints, { ...customer, roles: ['SALE_STAFF'] }).get('/api/v1/complaints')).status).toBe(401);
  expect((await complaintApp(complaints, { ...customer, userId: String(oid()) }).get('/api/v1/complaints/' + first.complaintId)).status)
    .toBe(404);
});


test.each(['AWAITING_PAYMENT', 'OVERDUE'])('GBR-26 complaint hold preserves %s booking state and payment deadline', async state => {
  await payAndAssign(); await finish(0); await finish(1);
  const paymentDeadlineAt = new Date(+at + 3600000);
  await col('bookings').updateOne({ _id: booking._id }, { $set: { state, paymentDeadlineAt } });
  const results = await Promise.allSettled(['first-case', 'second-case'].map(idempotencyKey => complaints.submit({
    actor: customer, visitId: String(visits[0]._id), description: 'Synthetic complaint', idempotencyKey
  })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
  const bookingId = String(booking._id);
  await connection.transaction(async session => {
    expect(await complaints.readBookingComplaintHold({ bookingId, session }))
      .toMatchObject({ hasUnfinalizedComplaints: true, billState: 'ON_HOLD' });
    expect(await col('bookings').findOne({ _id: booking._id }, { session })).toMatchObject({ state, paymentDeadlineAt });
  });
});
