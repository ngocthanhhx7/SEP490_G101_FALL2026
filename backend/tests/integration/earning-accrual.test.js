import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose, { Schema } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { earningAccrualModels } from '../../src/models/earning-accrual.model.js';
import { settlementModels } from '../../src/models/settlement.model.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { createEarningAccrualService } from '../../src/services/settlements/earning-accrual.service.js';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';
import { createSettlementService } from '../../src/services/settlements/settlement.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';

let replica, connection, models, Source, service;
const sitterId = 'synthetic-sitter';
const fixture = (bookingId, overrides = {}) => ({ bookingId, sitterId,
  bookingState: 'COMPLETED', completedAt: '2026-10-26T03:00:00.000Z',
  completionVerified: true, paymentVerified: true, allocationVerified: true,
  assessmentConfirmed: true, currency: 'VND', serviceBasisVnd: 100005, confirmedTaxVnd: 3,
  holdReferences: [], completionReference: `completion:${bookingId}`, paymentReference: `payment:${bookingId}`,
  allocationReference: `allocation:${bookingId}`, assessmentReference: `assessment:${bookingId}`,
  sourceVersion: 'source-v1', ...overrides });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'earning_accrual_regression', autoIndex: false }).asPromise();
  models = { ...earningAccrualModels(connection), ...settlementModels(connection) };
  await provisionSettlementStorage(connection);
  // This isolated source is synthetic. It models a guarded authoritative join;
  // it is not a production operational adapter or an import endpoint.
  Source = connection.model('SyntheticEarningSource', new Schema({ bookingId: String,
    payload: Schema.Types.Mixed, guard: Number }, { versionKey: false }));
  await Source.createCollection();
  const read = async ({ bookingId, session }) =>
    (await Source.findOne({ bookingId }).session(session).lean())?.payload;
  service = createEarningAccrualService({ connection, unitOfWork: createUnitOfWork(connection),
    clock: () => new Date('2026-10-30T00:00:00Z'), sources: {
      readBooking: read, readCompletion: read,
      guardBooking: async ({ bookingId, sourceVersion, session }) =>
        (await Source.updateOne({ bookingId, 'payload.sourceVersion': sourceVersion },
          { $inc: { guard: 1 } }, { session })).matchedCount === 1
    } });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  await Promise.all([...Object.values(models).map(model => model.deleteMany({})), Source.deleteMany({})]);
});
async function seed(bookingId, overrides) {
  await Source.create({ bookingId, payload: fixture(bookingId, overrides), guard: 0 });
}
async function complete(bookingId) { return service.recognizeCompletion({ bookingId, sitterId }); }
async function accrue(bookingId) { return service.accrue({ bookingId, sitterId }); }

test('completion/payment retries create one immutable earning, principal line and outbox event', async () => {
  await seed('booking-1');
  await Promise.all([complete('booking-1'), complete('booking-1')]);
  const [a, b] = await Promise.all([accrue('booking-1'), accrue('booking-1')]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({ ordinal: 1, feeBasisPoints: 1000, commissionVnd: 10001,
    sitterTaxCostVnd: 1, platformTaxCostVnd: 2, accruedVnd: 90003 });
  for (const key of ['BookingEarningSnapshot', 'Earning', 'EarningLedgerEntry', 'EarningAccrualOutbox']) {
    expect(await models[key].countDocuments()).toBe(1);
  }
  await Source.updateOne({ bookingId: 'booking-1' }, { $set: { 'payload.confirmedTaxVnd': 99 } });
  expect(await accrue('booking-1')).toEqual(a);
});

test('completion claims set fee tiers before a late payment and reset at Vietnam Monday', async () => {
  for (let index = 1; index <= 6; index++) {
    await seed(`booking-${index}`, { paymentVerified: index !== 1 });
    await complete(`booking-${index}`);
  }
  expect(await accrue('booking-6')).toMatchObject({ ordinal: 6, feeBasisPoints: 900 });
  await expect(accrue('booking-1')).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  await Source.updateOne({ bookingId: 'booking-1' }, { $set: { 'payload.paymentVerified': true } });
  expect(await accrue('booking-1')).toMatchObject({ ordinal: 1, feeBasisPoints: 1000 });
  await seed('sunday', { completedAt: '2026-10-25T16:59:59.999Z' });
  await seed('monday', { completedAt: '2026-10-25T17:00:00.000Z' });
  expect(await complete('sunday')).toMatchObject({ weekKey: '2026-10-19', ordinal: 1 });
  expect(await complete('monday')).toMatchObject({ weekKey: '2026-10-26', ordinal: 7 });
});

test('concurrent different completions allocate distinct ordinals without duplicate earnings', async () => {
  await Promise.all(Array.from({ length: 6 }, (_, index) => seed(`concurrent-${index}`)));
  const claims = await Promise.all(Array.from({ length: 6 }, (_, index) => complete(`concurrent-${index}`)));
  expect(claims.map(row => row.ordinal).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  await Promise.all(Array.from({ length: 6 }, (_, index) => accrue(`concurrent-${index}`)));
  expect(await models.Earning.countDocuments()).toBe(6);
  expect(await models.BookingEarningSnapshot.countDocuments({ feeBasisPoints: 900 })).toBe(1);
});

test.each([
  { assessmentConfirmed: false }, { confirmedTaxVnd: null }, { paymentVerified: false },
  { allocationVerified: false }, { completionVerified: false }, { bookingState: 'STAFF_CLOSED' },
  { sitterId: 'another-sitter' }, { completionReference: '' }
])('incomplete or out-of-scope sources cannot create funds: %j', async invalid => {
  await seed('pending');
  await complete('pending');
  await Source.updateOne({ bookingId: 'pending' }, { $set: { payload: fixture('pending', invalid) } });
  await expect(accrue('pending')).rejects.toMatchObject({ code: 'EARNING_SOURCE_PENDING' });
  expect(await models.Earning.countDocuments()).toBe(0);
  expect(await models.EarningAccrualOutbox.countDocuments()).toBe(0);
});

test('open complaint/refund blocks accrual; audited source release retains original ordinal', async () => {
  await seed('held', { holdReferences: ['case:1', 'refund:1'] });
  await complete('held');
  await expect(accrue('held')).rejects.toMatchObject({ code: 'EARNING_HELD' });
  await Source.updateOne({ bookingId: 'held' }, { $set: { 'payload.holdReferences': [],
    'payload.sourceVersion': 'audited-release-v2' } });
  expect(await accrue('held')).toMatchObject({ ordinal: 1, sourceVersion: 'audited-release-v2' });
});

test('missing counter unique index fails before any ordinal or money is written', async () => {
  await seed('missing-index');
  await models.WeeklyBookingCounter.collection.dropIndex('sitterId_1_weekKey_1');
  try {
    await expect(complete('missing-index')).rejects.toMatchObject({ code: 'SETTLEMENT_STORAGE_NOT_READY' });
    expect(await models.CompletedBookingOrdinal.countDocuments()).toBe(0);
  } finally { await models.WeeklyBookingCounter.createIndexes(); }
});

test('legacy null-visit constraint is retired only by an explicit migration option', async () => {
  await models.Earning.collection.createIndex({ sitterId: 1, visitId: 1 },
    { name: 'sitterId_1_visitId_1', unique: true, sparse: true });
  await provisionSettlementStorage(connection);
  expect((await models.Earning.collection.listIndexes().toArray())
    .some(index => index.name === 'sitterId_1_visitId_1')).toBe(true);
  await provisionSettlementStorage(connection, { retireLegacyVisitIndex: true });
  expect((await models.Earning.collection.listIndexes().toArray())
    .some(index => index.name === 'sitterId_1_visitId_1')).toBe(false);
  for (const id of ['first', 'second']) { await seed(id); await complete(id); await accrue(id); }
  expect(await models.Earning.countDocuments()).toBe(2);
});

test('persisted earning and ledger feed real concurrent settlement requests', async () => {
  await seed('settle'); await complete('settle');
  const snapshot = await accrue('settle');
  const repository = createMongoSettlementRepository({ connection });
  const settlement = createSettlementService({ repository, unitOfWork: createUnitOfWork(connection),
    policy: { resolve: async () => ({ ready: true, policyVersion: snapshot.policyVersion,
      decisionVersion: snapshot.decisionVersion, decisionIds: [] }) },
    clock: () => new Date('2026-10-30T00:00:00Z') });
  const actor = { userId: sitterId, state: 'ACTIVE', roles: ['PET_SITTER'] };
  const result = await Promise.allSettled(['device-one', 'device-two'].map(idempotencyKey =>
    settlement.submit({ actor, earningIds: [snapshot.id], idempotencyKey })));
  expect(result.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect((await repository.readOwn({ sitterId, requestWeekKey: '2026-10-26' })).balances)
    .toMatchObject({ accrued: 90003, available: 0, reserved: 90003 });
});
