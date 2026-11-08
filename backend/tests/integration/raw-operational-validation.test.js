import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { RAW_OPERATIONAL_CONTRACT, rawOperationalCollections, rawOperationalCollectionOptions } from '../../src/models/raw-operational.storage.js';
import { assertRawOperationalValidation, inspectRawOperationalValidation, installRawOperationalValidation, restoreRawOperationalValidation } from '../../src/services/raw-operational-validation.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { payrollModels } from '../../src/models/payroll.model.js';

let replica, connection;
const oid = () => new mongoose.Types.ObjectId(), at = new Date('2026-11-08T00:00:00Z');
const col = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' },
    instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }], replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_raw_validation',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
}, 600000);
beforeEach(async () => { await connection.dropDatabase(); });
afterAll(async () => { await connection?.close(); await replica?.stop(); });
async function fixtures(validated = true) {
  for (const name of rawOperationalCollections) {
    await connection.db.createCollection(name, validated ? rawOperationalCollectionOptions(name) : {});
    await col(name).createIndex({ syntheticLookup: 1 });
  }
}
function payment(extra = {}) { return { provider: 'PAYOS', state: 'VERIFIED', storageContractVersion: 1,
  bookingId: oid(), intentId: oid(), providerEventId: 'synthetic-event', providerTransactionReference: 'synthetic-bank',
  receivedAt: at, verifiedAt: at, receiptMoney: { amountVnd: 10000, currency: 'VND' }, version: 0, ...extra }; }
function tax(extra = {}) { return { state: 'CONFIRMED', storageContractVersion: 1, bookingId: oid(), confirmedBy: oid(),
  confirmedAt: at, evidenceReference: 'assessment:synthetic', totalTaxVnd: 0, version: 0, ...extra }; }

test('legacy/postpay/reconciliation/boarding and complaint field variations remain accepted without invented enums', async () => {
  await fixtures();
  await col('bookings').insertMany([{ paymentMode: 'POSTPAY', state: 'DISPATCH_PENDING', version: 0 },
    { state: 'HISTORICAL', version: null }, { state: 'COMPLETED', checkoutSnapshot: { historical: true } }]);
  await col('visits').insertMany([{ sitterId: null, customerVisitId: 'original-slot', version: 0 },
    { sitterId: 'legacy-sitter', state: 'SUPERSEDED', careAcknowledgement: { version: 'a'.repeat(64) } }]);
  await col('payments').insertMany([{ provider: 'PAYOS', state: 'VERIFIED' },
    payment({ state: 'RECONCILIATION_REQUIRED', bookingId: null, intentId: null, verifiedAt: null, receiptMoney: { amountVnd: -100, currency: 'USD' } })]);
  await col('paymentintents').insertOne({ state: 'PAID', linkState: 'CREATING', paymentLinkId: { historicalProvider: true }, version: 0 });
  await col('taxassessments').insertMany([{ state: 'CONFIRMED' }, tax()]);
  await col('cases').insertMany([{ _id: 'synthetic-uuid', createdAt: at.toISOString(), financialHold: { state: 'HELD' },
    evidenceRefs: [{ mediaId: 'synthetic', caption: null }], version: 0 }, { financialHold: null, version: null }]);
  expect(rawOperationalCollectionOptions('refunds')).toBeUndefined();
});

test('counter guards accept safe BSON integers/null/missing and reject malformed non-null numeric states', async () => {
  await fixtures();
  const { Int32, Long, Double, Decimal128 } = mongoose.mongo.BSON;
  for (const version of [0, 1, null, Number.MAX_SAFE_INTEGER, new Int32(3), Long.fromNumber(3), new Double(3)]) {
    await col('bookings').insertOne({ version });
  }
  for (const version of [-1, 1.5, '1', {}, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1,
    Decimal128.fromString('1'), Long.fromString('9007199254740992')]) {
    await expect(col('bookings').insertOne({ version })).rejects.toMatchObject({ code: 121 });
  }
  await expect(col('visits').insertOne({ version: 1, reviewGuardVersion: -1 })).rejects.toMatchObject({ code: 121 });
  await expect(col('cases').insertOne({ objectionCount: 0.5 })).rejects.toMatchObject({ code: 121 });
});

test('marked verified payOS receipts enforce only existing authoritative source fields', async () => {
  await fixtures(); await col('payments').insertOne(payment());
  for (const extra of [{ bookingId: null }, { intentId: 'wrong-type' }, { providerEventId: '' },
    { providerTransactionReference: '' }, { receivedAt: at.toISOString() }, { verifiedAt: null },
    { receiptMoney: { amountVnd: 0, currency: 'VND' } }, { receiptMoney: { amountVnd: 1.5, currency: 'VND' } },
    { receiptMoney: { amountVnd: 1, currency: 'USD' } }, { version: null }, { storageContractVersion: 2 }]) {
    await expect(col('payments').insertOne(payment(extra))).rejects.toMatchObject({ code: 121 });
  }
  const absent = payment(); delete absent.receiptMoney;
  await expect(col('payments').insertOne(absent)).rejects.toMatchObject({ code: 121 });
  const missingVersion = payment(); delete missingVersion.version;
  await expect(col('payments').insertOne(missingVersion)).rejects.toMatchObject({ code: 121 });
});

test('marked confirmed tax retains integer VND/evidence contract and preserves historical unmarked records', async () => {
  await fixtures(); await col('taxassessments').insertOne(tax());
  for (const extra of [{ bookingId: null }, { confirmedBy: 'wrong' }, { confirmedAt: 'wrong' },
    { evidenceReference: 'spaces invalid' }, { totalTaxVnd: -1 }, { totalTaxVnd: 0.1 }, { totalTaxVnd: Number.MAX_SAFE_INTEGER + 1 }, { version: null }]) {
    await expect(col('taxassessments').insertOne(tax(extra))).rejects.toMatchObject({ code: 121 });
  }
  await col('taxassessments').insertOne({ state: 'CONFIRMED', evidenceReference: 'historical imported value' });
});

test('preflight is read-only; stale digest, invalid rows, foreign validators and missing confirmation block DDL', async () => {
  await fixtures(false); await col('bookings').insertOne({ version: 'malformed' });
  await expect(assertRawOperationalValidation(connection.db)).rejects.toThrow('RAW_VALIDATOR_NOT_READY');
  const writes = [], listener = e => { if (['insert', 'update', 'delete', 'collMod', 'createIndexes', 'create'].includes(e.commandName)) writes.push(e.commandName); };
  connection.getClient().on('commandStarted', listener);
  const before = await inspectRawOperationalValidation(connection.db);
  connection.getClient().off('commandStarted', listener);
  expect(writes).toEqual([]); expect(before.readyForApply).toBe(false);
  expect(before.collections.find(row => row.name === 'bookings').invalid).toBe(1);
  await expect(installRawOperationalValidation({ db: connection.db })).rejects.toThrow('CONFIRMATION');
  const input = { db: connection.db, database: connection.name, contract: RAW_OPERATIONAL_CONTRACT, digest: before.digest, checkpoint: async () => {} };
  await expect(installRawOperationalValidation(input)).rejects.toThrow('PREFLIGHT');
  await col('bookings').deleteMany({}); const fresh = await inspectRawOperationalValidation(connection.db);
  await col('bookings').insertOne({ version: 0 });
  await expect(installRawOperationalValidation({ ...input, digest: fresh.digest })).rejects.toThrow('PREFLIGHT');
  await connection.db.command({ collMod: 'cases', validator: { syntheticForeign: { $exists: true } } });
  expect((await inspectRawOperationalValidation(connection.db)).readyForApply).toBe(false);
});

test('apply/reapply/reverse journals preserve current data and indexes, including new valid writes after apply', async () => {
  await fixtures(false); await col('bookings').insertOne({ version: 0, paymentMode: 'POSTPAY' });
  const before = await inspectRawOperationalValidation(connection.db), journals = [];
  const input = { db: connection.db, database: connection.name, contract: RAW_OPERATIONAL_CONTRACT,
    digest: before.digest, checkpoint: async value => { journals.push(JSON.parse(JSON.stringify(value))); } };
  expect(await installRawOperationalValidation(input)).toMatchObject({ state: 'APPLIED', documentsChanged: false, indexesChanged: false });
  await expect(assertRawOperationalValidation(connection.db)).resolves.toBeUndefined();
  expect(journals[0].state).toBe('PREPARED'); expect(journals.at(-1).completed).toEqual([...rawOperationalCollections]);
  const fresh = await inspectRawOperationalValidation(connection.db);
  expect((await installRawOperationalValidation({ ...input, digest: fresh.digest })).changed).toEqual([]);
  await col('payments').insertOne(payment()); // Reverse must retain post-cutover facts.
  const current = await inspectRawOperationalValidation(connection.db);
  expect(await restoreRawOperationalValidation({ ...input, digest: current.digest, journal: journals.find(row => row.state === 'APPLIED') }))
    .toMatchObject({ state: 'RESTORED', documentsChanged: false, indexesChanged: false });
  expect(await col('payments').countDocuments()).toBe(1);
  expect((await inspectRawOperationalValidation(connection.db)).collections.every(row => Object.keys(row.options.validator).length === 0)).toBe(true);
});

test('partial DDL acknowledgement is checkpointed and reverse reconciles only known contracts', async () => {
  await fixtures(false); const before = await inspectRawOperationalValidation(connection.db);
  let journal;
  const input = { db: connection.db, database: connection.name, contract: RAW_OPERATIONAL_CONTRACT, digest: before.digest,
    checkpoint: async row => { journal = JSON.parse(JSON.stringify(row)); if (row.completed.length === 1 && row.state === 'APPLYING') throw new Error('synthetic-journal-failure'); } };
  await expect(installRawOperationalValidation(input)).rejects.toThrow('synthetic-journal-failure');
  expect(journal.state).toBe('PARTIAL'); expect(journal.completed).toEqual(['bookings']);
  const current = await inspectRawOperationalValidation(connection.db);
  expect(await restoreRawOperationalValidation({ ...input, checkpoint: async () => {}, digest: current.digest, journal })).toMatchObject({ state: 'RESTORED' });
});

test('lost collMod acknowledgement retains in-progress metadata for safe reverse reconciliation', async () => {
  await fixtures(false); const before = await inspectRawOperationalValidation(connection.db); let journal, failed = false;
  const db = { databaseName: connection.name, listCollections: (...args) => connection.db.listCollections(...args),
    collection: (...args) => connection.db.collection(...args), command: async (...args) => {
      const result = await connection.db.command(...args);
      if (args[0].collMod && !failed) { failed = true; throw new Error('synthetic-lost-ddl-ack'); }
      return result;
    } };
  const input = { database: connection.name, contract: RAW_OPERATIONAL_CONTRACT, digest: before.digest,
    checkpoint: async row => { journal = JSON.parse(JSON.stringify(row)); } };
  await expect(installRawOperationalValidation({ ...input, db })).rejects.toThrow('synthetic-lost-ddl-ack');
  expect(journal).toMatchObject({ state: 'PARTIAL', completed: [], inProgress: 'bookings' });
  const current = await inspectRawOperationalValidation(connection.db);
  expect(await restoreRawOperationalValidation({ ...input, db: connection.db, digest: current.digest, journal }))
    .toMatchObject({ state: 'RESTORED', restored: ['bookings'] });
});

test('validation failure rolls back a guarded multi-collection transaction', async () => {
  await fixtures(); const key = oid(); await col('bookings').insertOne({ _id: key, version: 0 });
  const uow = createUnitOfWork(connection);
  await expect(uow.run(async session => {
    await col('bookings').updateOne({ _id: key, version: 0 }, { $inc: { version: 1 } }, { session });
    await col('payments').insertOne(payment({ receiptMoney: { amountVnd: 0, currency: 'VND' } }), { session });
  })).rejects.toMatchObject({ code: 121 });
  expect((await col('bookings').findOne({ _id: key })).version).toBe(0); expect(await col('payments').countDocuments()).toBe(0);
});

test('unknown commit is retried by the replica-set transaction boundary without replaying domain writes', async () => {
  await fixtures(); const key = oid(); await col('bookings').insertOne({ _id: key, version: 0 });
  const uow = createUnitOfWork(connection); let calls = 0;
  await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['commitTransaction'], errorCode: 91, errorLabels: ['UnknownTransactionCommitResult'] } });
  try {
    await uow.run(async session => { calls++; await col('bookings').updateOne({ _id: key, version: 0 }, { $inc: { version: 1 } }, { session });
      await col('payments').insertOne(payment({ providerEventId: 'unknown-commit-synthetic' }), { session }); });
  } finally { await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' }); }
  expect(calls).toBe(1); expect((await col('bookings').findOne({ _id: key })).version).toBe(1);
  expect(await col('payments').countDocuments({ providerEventId: 'unknown-commit-synthetic' })).toBe(1);
});

test('transient write conflicts retry the whole transaction with one committed counter/receipt', async () => {
  await fixtures(); const key = oid(); await col('bookings').insertOne({ _id: key, version: 0 });
  const uow = createUnitOfWork(connection); let calls = 0;
  await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: { times: 1 },
    data: { failCommands: ['update'], errorCode: 112, errorLabels: ['TransientTransactionError'] } });
  try {
    await uow.run(async session => { calls++; await col('bookings').updateOne({ _id: key, version: 0 }, { $inc: { version: 1 } }, { session });
      await col('payments').insertOne(payment({ providerEventId: 'transient-synthetic' }), { session }); });
  } finally { await connection.db.admin().command({ configureFailPoint: 'failCommand', mode: 'off' }); }
  expect(calls).toBeGreaterThan(1); expect((await col('bookings').findOne({ _id: key })).version).toBe(1);
  expect(await col('payments').countDocuments({ providerEventId: 'transient-synthetic' })).toBe(1);
});

test('competing guarded writers commit only one CAS result under native constraints', async () => {
  await fixtures(); const key = oid(); await col('bookings').insertOne({ _id: key, version: 0 });
  const uow = createUnitOfWork(connection);
  const write = index => uow.run(async session => {
    const current = await col('bookings').findOne({ _id: key }, { session });
    if (current.version !== 0) throw Object.assign(new Error('VERSION_CONFLICT'), { code: 'VERSION_CONFLICT' });
    const changed = await col('bookings').updateOne({ _id: key, version: 0 }, { $inc: { version: 1 } }, { session });
    if (!changed.matchedCount) throw new Error('Guard lost');
    await col('payments').insertOne(payment({ providerEventId: `competing-synthetic-${index}` }), { session });
  });
  const results = await Promise.allSettled([write(0), write(1)]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(row => row.status === 'rejected').reason.code).toBe('VERSION_CONFLICT');
  expect((await col('bookings').findOne({ _id: key })).version).toBe(1); expect(await col('payments').countDocuments()).toBe(1);
});

test('external valid writes during multi-DDL block postflight acceptance and are preserved by reverse', async () => {
  await fixtures(false); const before = await inspectRawOperationalValidation(connection.db);
  let journal, inserted = false;
  const input = { db: connection.db, database: connection.name, contract: RAW_OPERATIONAL_CONTRACT, digest: before.digest,
    checkpoint: async row => {
      journal = JSON.parse(JSON.stringify(row));
      if (row.completed.length === 6 && row.state === 'APPLYING' && !inserted) {
        inserted = true; await col('payments').insertOne(payment({ providerEventId: 'external-valid-synthetic' }));
      }
    } };
  await expect(installRawOperationalValidation(input)).rejects.toThrow('POSTFLIGHT'); expect(journal.state).toBe('PARTIAL');
  const current = await inspectRawOperationalValidation(connection.db);
  expect(await restoreRawOperationalValidation({ ...input, digest: current.digest, checkpoint: async () => {}, journal })).toMatchObject({ state: 'RESTORED' });
  expect(await col('payments').countDocuments({ providerEventId: 'external-valid-synthetic' })).toBe(1);
});

test('actual EMPLOYEE webhook/reconciliation/tax writers preserve their versioned and legacy-compatible contracts', async () => {
  await provisionFinanceSources(connection);
  const finance = createBookingFinanceSourceService({ connection, clock: () => at, compensationModel: 'EMPLOYEE' });
  const hook = createPayosPaymentWebhookService({ provider: { verifyWebhook: async body => body.data },
    repository: createMongoPaymentWebhookRepository({ connection, finance }), clock: () => at });
  payrollModels(connection);
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  const booking = { _id: oid(), customerId: oid(), state: 'AWAITING_PAYMENT', paymentMode: 'PREPAY', version: 0 };
  await col('bookings').insertOne(booking);
  await col('paymentintents').insertOne({ _id: oid(), bookingId: booking._id, provider: 'PAYOS', providerReference: '12345',
    amountVnd: 50000, currency: 'VND', state: 'PENDING', version: 0, expiresAt: new Date(+at + 600000) });
  const message = (reference, extra = {}) => ({ data: { orderCode: 12345, reference, amount: 50000, currency: 'VND', code: '00', ...extra } });
  const body = message('synthetic-valid-bank');
  expect((await hook.handleWebhook(body)).status).toBe('PAYMENT_VERIFIED');
  expect((await hook.handleWebhook(body)).status).toBe('DUPLICATE');
  expect(await col('payments').countDocuments({ state: 'VERIFIED' })).toBe(1);
  expect(await col('payments').findOne({ state: 'VERIFIED' })).toMatchObject({ storageContractVersion: 1, version: 0 });
  for (const [name, extra] of [['fractional', { amount: 0.5 }], ['null', { amount: null }], ['negative', { amount: -5 }],
    ['foreign-currency', { currency: 'USD' }], ['missing-intent', { orderCode: 77777 }]]) {
    expect((await hook.handleWebhook(message(`synthetic-${name}`, extra))).status).toBe('RECONCILIATION_REQUIRED');
  }
  expect((await col('payments').findOne({ providerTransactionReference: 'synthetic-fractional' })).receiptMoney.amountVnd).toBeNull();
  expect((await col('payments').findOne({ providerTransactionReference: 'synthetic-negative' })).receiptMoney.amountVnd).toBe(-5);
  const postpay = { _id: oid(), customerId: oid(), state: 'ASSIGNED', paymentMode: 'POSTPAY', version: 0 };
  await col('bookings').insertOne(postpay);
  const input = { actor: { userId: String(oid()), roles: ['ADMIN'], state: 'ACTIVE' }, bookingId: String(postpay._id),
    expectedVersion: 0, idempotencyKey: 'native-tax-replay', totalTaxVnd: 0, evidenceReference: 'synthetic/tax:confirmed' };
  const result = await finance.confirmAssessment(input);
  expect(await finance.confirmAssessment(input)).toEqual(result);
  expect(await col('taxassessments').findOne({ bookingId: postpay._id })).toMatchObject({ storageContractVersion: 1, version: 0, totalTaxVnd: 0 });
});
