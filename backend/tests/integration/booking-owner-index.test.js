import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { inspectBookingReadStorage, provisionBookingReadStorage, assertBookingReadStorage,
  BOOKING_OWNER_INDEX } from '../../src/services/booking-read-storage.service.js';
import { createCustomerBookingsService } from '../../src/services/customer-bookings.service.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';

let replica, connection;
const owner = new mongoose.Types.ObjectId(), foreign = new mongoose.Types.ObjectId();
const actor = id => ({ userId: String(id), state: 'ACTIVE', roles: ['CUSTOMER'] });
const clock = () => Date.parse('2026-11-08T00:00:00Z');
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_booking_owner_index',
    autoCreate: false, autoIndex: false }).asPromise();
}, 600000);
beforeEach(async () => { await connection.dropDatabase(); });
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
async function fixture() {
  const c = connection.db.collection('bookings');
  await c.createIndex({ carePlanState: 1, createdAt: 1, _id: 1 });
  await c.insertMany(Array.from({ length: 4000 }, (_, i) => ({ _id: new mongoose.Types.ObjectId(),
    customerId: i % 10 === 0 ? owner : foreign, state: 'AWAITING_PAYMENT', paymentDeadlineAt: new Date(clock() - 1),
    carePlanState: 'APPROVED', createdAt: new Date(clock()),
    checkoutSnapshot: { customerVisits: [{ snapshots: { serviceName: 'Synthetic care', privateAccessNotes: 'Synthetic private field' } }] } })));
  return c;
}
test('dry-run never creates storage and apply requires matching data and index metadata', async () => {
  expect(await inspectBookingReadStorage(connection)).toMatchObject({ collectionExists: false });
  await expect(provisionBookingReadStorage({ connection, apply: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow();
  expect(await connection.db.listCollections().toArray()).toEqual([]);
  const c = await fixture(), before = await inspectBookingReadStorage(connection);
  expect(before).toMatchObject({ documents: 4000, invalidOwners: 0, invalidIdentifiers: 0, equivalentIndex: null });
  expect((await c.listIndexes().toArray()).length).toBe(2);
  await expect(provisionBookingReadStorage({ connection, apply: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow();
  await c.createIndex({ state: 1 });
  await expect(provisionBookingReadStorage({ connection, apply: true, expectedDigest: before.digest })).rejects.toThrow();
  const current = await inspectBookingReadStorage(connection);
  expect(await provisionBookingReadStorage({ connection, apply: true, expectedDigest: current.digest })).toMatchObject({
    state: 'INDEX_READY', created: true, ownerKeyDigest: before.ownerKeyDigest, ownerKeysChangedDuringBuild: false });
  expect(await provisionBookingReadStorage({ connection, apply: true,
    expectedDigest: (await inspectBookingReadStorage(connection)).digest })).toMatchObject({ state: 'ALREADY_READY', created: false });
  expect(await c.countDocuments()).toBe(4000);
});

test('indexed pages preserve ownership, cursor context, expired-payment DTO and bounded scan', async () => {
  const c = await fixture(), service = createCustomerBookingsService({ connection, clock,
    cursorSecret: 'synthetic-booking-cursor-secret-at-least32', enabled: true });
  const first = await service.list(actor(owner), { limit: 20 });
  expect(first.items).toHaveLength(20);
  expect(first.items.every(row => row.state === 'PAYMENT_EXPIRED')).toBe(true);
  expect(JSON.stringify(first)).not.toContain('privateAccessNotes');
  const second = await service.list(actor(owner), { limit: 20, cursor: first.nextCursor });
  await expect(service.list(actor(foreign), { limit: 20, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(service.list(actor(owner), { limit: 10, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const pre = await inspectBookingReadStorage(connection);
  await provisionBookingReadStorage({ connection, apply: true, expectedDigest: pre.digest });
  expect(await service.list(actor(owner), { limit: 20 })).toEqual(first);
  expect(await service.list(actor(owner), { limit: 20, cursor: first.nextCursor })).toEqual(second);
  expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(40);
  const stats = await c.find({ customerId: owner }, { maxTimeMS: 5000 }).sort({ _id: -1 }).limit(21).explain('executionStats');
  expect(stats.executionStats.nReturned).toBe(21);
  expect(stats.executionStats.totalDocsExamined).toBe(21);
  expect(stats.executionStats.totalKeysExamined).toBe(21);
  const empty = await c.find({ customerId: new mongoose.Types.ObjectId() }, { maxTimeMS: 5000 }).sort({ _id: -1 }).limit(21).explain('executionStats');
  expect(empty.executionStats.totalDocsExamined).toBe(0);
  expect((await inspectBookingReadStorage(connection)).ownerKeyDigest).toBe(pre.ownerKeyDigest);
});

test('legacy missing/null owners remain untouched; malformed owner types block provision', async () => {
  const c = connection.db.collection('bookings');
  await c.insertMany([{ _id: new mongoose.Types.ObjectId(), state: 'SYNTHETIC_HISTORY' },
    { _id: new mongoose.Types.ObjectId(), customerId: null, state: 'SYNTHETIC_RECONCILIATION' }]);
  const before = await c.find().toArray(), dry = await inspectBookingReadStorage(connection);
  expect(dry.owners).toEqual({ missing: 1, null: 1 });
  await provisionBookingReadStorage({ connection, apply: true, expectedDigest: dry.digest });
  expect(await c.find().toArray()).toEqual(before);
  await c.insertOne({ customerId: [owner, foreign] });
  const invalid = await inspectBookingReadStorage(connection);
  expect(invalid.invalidOwners).toBe(1);
  await expect(provisionBookingReadStorage({ connection, apply: true, expectedDigest: invalid.digest })).rejects.toThrow();
});

test('foreign index conflicts are preserved and equivalent names do not create duplicates', async () => {
  const c = connection.db.collection('bookings');
  await c.createIndex({ customerId: 1 }, { name: BOOKING_OWNER_INDEX.name });
  const dry = await inspectBookingReadStorage(connection);
  expect(dry.conflicts).toBe(1);
  await expect(provisionBookingReadStorage({ connection, apply: true, expectedDigest: dry.digest })).rejects.toThrow();
  expect((await c.listIndexes().toArray()).length).toBe(2);
  await connection.dropDatabase();
  await connection.db.collection('bookings').createIndex({ customerId: -1, _id: 1 }, { name: 'synthetic_existing_equivalent' });
  const ready = await inspectBookingReadStorage(connection);
  expect(await provisionBookingReadStorage({ connection, apply: true, expectedDigest: ready.digest })).toMatchObject({
    state: 'ALREADY_READY', equivalentIndex: 'synthetic_existing_equivalent', created: false });
  expect((await connection.db.collection('bookings').listIndexes().toArray()).length).toBe(2);
});

test('deployment asserts provisioned storage without silently building the booking index', async () => {
  const c = await fixture();
  await expect(provisionDeploymentStorage({ connection, env: { BOOKING_CHECKOUT_ENABLED: 'true' } }))
    .rejects.toMatchObject({ code: 'BOOKING_READ_STORAGE_NOT_READY' });
  expect((await c.listIndexes().toArray()).length).toBe(2);
  const dry = await inspectBookingReadStorage(connection);
  await provisionBookingReadStorage({ connection, apply: true, expectedDigest: dry.digest });
  await expect(assertBookingReadStorage(connection)).resolves.toBeUndefined();
  expect(await provisionDeploymentStorage({ connection, env: { BOOKING_CHECKOUT_ENABLED: 'true' } })).toMatchObject({ state: 'INDEXES_READY' });
});

test('partial and hidden owner indexes cannot stand in for complete booking history', async () => {
  const c = connection.db.collection('bookings');
  await c.createIndex(BOOKING_OWNER_INDEX.key, { partialFilterExpression: { state: 'ACTIVE' }, name: 'synthetic_partial' });
  expect((await inspectBookingReadStorage(connection)).conflicts).toBe(1);
  await expect(assertBookingReadStorage(connection)).rejects.toMatchObject({ code: 'BOOKING_READ_STORAGE_NOT_READY' });
  await connection.dropDatabase();
  await connection.db.collection('bookings').createIndex(BOOKING_OWNER_INDEX.key, { hidden: true });
  await expect(assertBookingReadStorage(connection)).rejects.toMatchObject({ code: 'BOOKING_READ_STORAGE_NOT_READY' });
});
