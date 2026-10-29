import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
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
  await provisionSettlementStorage(connection); await provisionFinanceSources(connection);
  await col('privateimages').insertOne({ _id: 'provisioning-sentinel' }); await col('privateimages').deleteMany({});
  models = { ...financeSourceModels(connection), ...earningAccrualModels(connection), ...settlementModels(connection),
    ...payrollModels(connection), SitterStatus: sitterApplicationModels(connection).SitterStatus };
  for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  await models.SitterStatus.createCollection(); await models.SitterStatus.createIndexes();
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  for (const name of ['bookings', 'visits', 'payments', 'taxassessments', 'paymentintents', 'cases', 'refunds', 'privateimages']) await col(name).deleteMany({});
  for (const model of Object.values(models)) await model.deleteMany({});
  at = new Date('2026-10-30T03:00:00Z');
  service = createBookingFinanceSourceService({ connection, clock: () => at, compensationModel: 'LEGACY_PARTNER' });
  webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => at });
  actors = [0, 1].map(() => ({ userId: String(oid()), state: 'ACTIVE', roles: ['PET_SITTER'], expiresAt: at.getTime() + 86400000 }));
  admin = { userId: String(oid()), state: 'ACTIVE', roles: ['ADMIN'], expiresAt: at.getTime() + 86400000 };
  customer = { userId: String(oid()), state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: at.getTime() + 86400000 };
  complaints = createComplaintService({ repository: createMongoComplaintRepository({ connection, finance: service,
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
  await complaints.review({ actor: admin, complaintId: opened.complaintId, expectedVersion: 0,
    idempotencyKey: 'complaint-review', summary: 'Synthetic review' });
  await complaints.resolve({ actor: admin, complaintId: opened.complaintId, expectedVersion: 1,
    idempotencyKey: 'complaint-resolve', summary: 'Synthetic resolution', financialHold: true });
  await complaints.decide({ actor: admin, complaintId: opened.complaintId, expectedVersion: 2,
    idempotencyKey: 'complaint-decision', summary: 'Synthetic final conclusion', financialHold: false });
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

test('employee completion writes one immutable credit per visit and never creates partner earnings', async () => {
  service = createBookingFinanceSourceService({ connection, clock: () => at });
  webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance: service }), clock: () => at });
  await payAndAssign();
  for (let index = 0; index < 2; index++) {
    await service.checkIn(command(index, 0, 'employee-check-in', { mediaId: images[index][0] }));
    await service.updateChecklist(command(index, 1, 'employee-checklist', { items: [{ itemId: 'feed', status: 'DONE' }] }));
  }
  at = new Date(at.getTime() + 3600000);
  await Promise.all([0, 1].map(index => service.checkOut(command(index, 2, 'employee-check-out', { mediaId: images[index][1] }))));
  await service.checkOut(command(1, 2, 'employee-check-out', { mediaId: images[1][1] }));
  const credits = await models.PayrollServiceCredit.find().sort({ serviceNetVnd: 1 }).lean();
  expect(credits.map(c => [c.serviceNetVnd, c.careMinutes, c.onTime, c.reportsComplete])).toEqual([[100000, 60, true, true], [200000, 60, true, true]]);
  expect(await models.Earning.countDocuments()).toBe(0);
  expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
  expect(await models.EarningAccrualTask.countDocuments()).toBe(0);
  expect(await service.drain()).toEqual([]);
});
