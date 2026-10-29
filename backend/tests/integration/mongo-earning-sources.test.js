import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createMongoEarningSources } from '../../src/services/settlements/mongo-earning-sources.repository.js';
import { createEarningAccrualService } from '../../src/services/settlements/earning-accrual.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { earningAccrualModels } from '../../src/models/earning-accrual.model.js';
import { settlementModels } from '../../src/models/settlement.model.js';
import { BOOKING_ALLOCATION_VERSION } from '../../src/services/settlements/booking-allocation.js';

let replica, connection, sources, service, models, booking, visits, sitterIds;
const names = ['bookings', 'visits', 'payments', 'taxassessments', 'cases', 'refunds', 'privateimages'];
const oid = () => new mongoose.Types.ObjectId();
const at = new Date('2026-10-26T03:00:00Z');
const store = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'operational_earning_source_test', autoIndex: false }).asPromise();
  for (const name of names) await connection.db.createCollection(name);
  await provisionSettlementStorage(connection);
  models = { ...earningAccrualModels(connection), ...settlementModels(connection) };
  sources = createMongoEarningSources({ connection });
  service = createEarningAccrualService({ connection, unitOfWork: createUnitOfWork(connection), sources,
    clock: () => new Date('2026-10-30T00:00:00Z') });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  for (const name of names) await store(name).deleteMany({});
  for (const model of Object.values(models)) await model.deleteMany({});
  sitterIds = [oid(), oid()];
  visits = sitterIds.map((sitterId, index) => ({ _id: oid(), sitterId, state: 'COMPLETED',
    startAt: new Date(at.getTime() - 3600000), completedAt: at, version: 1,
    snapshots: { serviceBasisVnd: (index + 1) * 100000 },
    evidenceRefs: [{ kind: 'CHECK_IN', mediaId: String(index + 1).repeat(64) }, { kind: 'CHECK_OUT', mediaId: String(index + 3).repeat(64) }] }));
  booking = { _id: oid(), state: 'COMPLETED', originalVisitCount: 2, paymentMode: 'PREPAY',
    visitIds: visits.map(visit => visit._id), completedAt: at, version: 1 };
  await store('bookings').insertOne(booking);
  await store('visits').insertMany(visits.map(visit => ({ ...visit, bookingId: booking._id })));
  for (const visit of visits) for (const item of visit.evidenceRefs) {
    await store('privateimages').insertOne({ _id: item.mediaId, ownerId: visit.sitterId, state: 'READY',
      contentDigest: 'a'.repeat(64), byteLength: 100 });
  }
  await store('payments').insertOne({ _id: oid(), bookingId: booking._id, state: 'VERIFIED',
    intentId: oid(), provider: 'SYNTHETIC_TEST_PROVIDER', providerEventId: 'synthetic-event',
    verifiedAt: new Date(at.getTime() - 7200000), receiptMoney: { amountVnd: 300000, currency: 'VND' }, version: 1 });
  await store('taxassessments').insertOne({ _id: oid(), bookingId: booking._id, state: 'CONFIRMED', totalTaxVnd: 10000,
    confirmedBy: oid(), confirmedAt: at, evidenceReference: 'synthetic-assessment-evidence', version: 1 });
});
const input = index => ({ bookingId: String(booking._id), sitterId: String(sitterIds[index]) });

test('primary completion/payment/assessment joins create one immutable earning per sitter with reconciled allocation', async () => {
  // Represents the primary completion writer's shared committing transaction.
  await connection.transaction(async session => {
    for (const index of [0, 1]) await service.recognizeCompletion({ ...input(index), session });
  });
  const first = await service.accrue(input(0));
  const second = await service.accrue(input(1));
  expect(first).toMatchObject({ serviceBasisVnd: 100000, confirmedTaxVnd: 3333, ordinal: 1, accruedVnd: 88333,
    sitterTaxCostVnd: 1667, platformTaxCostVnd: 1666, allocationPolicyVersion: BOOKING_ALLOCATION_VERSION });
  expect(second).toMatchObject({ serviceBasisVnd: 200000, confirmedTaxVnd: 6667, ordinal: 1, accruedVnd: 176667 });
  expect(await service.accrue(input(0))).toEqual(first);
  expect(await models.Earning.countDocuments()).toBe(2);
  expect(await models.EarningLedgerEntry.countDocuments()).toBe(2);
  expect(first.sitterTaxCostVnd + second.sitterTaxCostVnd).toBe(5000);
  expect(first.platformTaxCostVnd + second.platformTaxCostVnd).toBe(5000);
  // A later assessment or policy migration must use a separate adjustment.
  await store('taxassessments').updateMany({}, { $set: { totalTaxVnd: 12000 }, $inc: { version: 1 } });
  expect(await service.accrue(input(0))).toEqual(first);
  expect(await service.accrue(input(1))).toEqual(second);
  expect(await models.EarningLedgerEntry.countDocuments()).toBe(2);
});

test('missing T, unverifiable media, incomplete whole booking and receipt mismatch cannot accrue', async () => {
  await service.recognizeCompletion(input(0));
  await store('taxassessments').updateMany({}, { $unset: { totalTaxVnd: '' } });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  await store('taxassessments').updateMany({}, { $set: { totalTaxVnd: 10000 } });
  await store('payments').updateMany({}, { $set: { 'receiptMoney.amountVnd': 299999 } });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  await store('payments').updateMany({}, { $set: { 'receiptMoney.amountVnd': 300000 } });
  await store('privateimages').updateOne({ _id: visits[0].evidenceRefs[1].mediaId }, { $set: { state: 'PENDING' } });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  await store('privateimages').updateMany({}, { $set: { state: 'READY' } });
  await store('visits').updateOne({ _id: visits[1]._id }, { $set: { state: 'CANCELLED' } });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  expect(await models.Earning.countDocuments()).toBe(0);
});

test('real open case/refund sources hold accrual and absent collection is not an empty source', async () => {
  await service.recognizeCompletion(input(0));
  await store('cases').insertOne({ visitId: visits[1]._id, state: 'OPEN' });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_HELD' });
  await store('cases').deleteMany({});
  await store('refunds').insertOne({ bookingId: booking._id, state: 'TRANSFER_PENDING' });
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_HELD' });
  await store('refunds').drop();
  try { await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' }); }
  finally { await connection.db.createCollection('refunds'); }
});

test('completion ordinal persists before payment; delayed receipt cannot recalculate the fee tier', async () => {
  const receipt = await store('payments').findOne({}); await store('payments').deleteMany({});
  await service.recognizeCompletion(input(0));
  await expect(service.accrue(input(0))).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  await store('payments').insertOne(receipt);
  expect((await service.accrue(input(0))).ordinal).toBe(1);
});
