import { beforeAll, beforeEach, afterAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { resetDemoWorkflows } from '../../src/services/demo-workflow-reset.service.js';
import { HANOI_DEMO_KEY } from '../../src/constants/hanoi-demo-population.js';

let replica, connection;
const oid = () => new mongoose.Types.ObjectId(), sitter = oid(), admin = oid(), product = oid(), application = oid();
const raw = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_core_reset', autoCreate: false, autoIndex: false }).asPromise();
}, 600000);
beforeEach(async () => {
  await connection.dropDatabase();
  await raw('users').insertMany([{ _id: admin, roles: ['ADMIN'] },
    { _id: sitter, roles: ['PET_SITTER'], fixtureKey: HANOI_DEMO_KEY + ':sitter-1' },
    { _id: oid(), roles: ['PET_SITTER'], displayName: 'Demo name alone is not a marker' }]);
  await raw('products').insertOne({ _id: product, quantityHeld: 3, stockOnHand: 12, version: 4, price: 30000 });
  await raw('productorders').insertOne({ _id: oid(), status: 'PLACED', lines: [{ productId: product, quantity: 3 }] });
  await raw('sitterapplications').insertOne({ _id: application, provisionedUserId: sitter });
  await raw('employeeavailabilities').insertOne({ _id: String(sitter), areas: ['synthetic'] });
  await raw('demopopulationruns').insertOne({ _id: HANOI_DEMO_KEY, records: [
    { collection: 'users', id: sitter }, { collection: 'sitterapplications', id: application },
    { collection: 'employeeavailabilities', id: String(sitter) }
  ] });
  await raw('services').insertOne({ _id: oid(), code: 'synthetic-core', presentation: { image: 'preserve' } });
  await raw('policies').insertOne({ _id: oid(), amount: new mongoose.mongo.Long('9007199254740991'), at: new Date('2026-01-01') });
  await raw('bookings').insertOne({ _id: oid(), sitterId: sitter });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
const read = () => resetDemoWorkflows({ connection });
const apply = digest => resetDemoWorkflows({ connection, apply: true, expectedDigest: digest, writersFrozen: true });

test('dry run is read-only; apply preserves core BSON and unmarked sitter, releases stock holds, prunes seed manifest', async () => {
  const policy = await raw('policies').findOne({}, { promoteValues: false });
  const plan = await read();
  expect(plan.demoSitters).toBe(1);
  expect(await raw('bookings').countDocuments()).toBe(1);
  const done = await apply(plan.digest);
  expect(done.state).toBe('APPLIED');
  expect(await raw('users').countDocuments()).toBe(2);
  expect(await raw('users').findOne({ _id: admin })).toBeTruthy();
  expect(await raw('products').findOne({ _id: product })).toMatchObject({ quantityHeld: 0, stockOnHand: 12, version: 5, price: 30000 });
  expect(mongoose.mongo.BSON.serialize(await raw('policies').findOne({}, { promoteValues: false })))
    .toEqual(mongoose.mongo.BSON.serialize(policy));
  expect(await raw('demopopulationruns').findOne({ _id: HANOI_DEMO_KEY })).toMatchObject({ demoSittersRetired: true, records: [] });
  const second = await read();
  expect(second.removedDocuments).toBe(0);
  expect(second.productsReleasingReservations).toBe(0);
});

test('changed core content invalidates reviewed digest without deleting workflow rows', async () => {
  const plan = await read();
  await raw('services').updateOne({}, { $set: { code: 'changed' } });
  await expect(apply(plan.digest)).rejects.toMatchObject({ code: 'RESET_DIGEST_CHANGED' });
  expect(await raw('bookings').countDocuments()).toBe(1);
});

test('unknown retained references block cleanup rather than leave dangling documents', async () => {
  await raw('unknown-store').insertOne({ _id: oid(), nested: { employees: [sitter] } });
  await expect(read()).rejects.toMatchObject({ code: 'RESET_RETAINED_REFERENCE_unknown-store' });
  expect(await raw('users').countDocuments()).toBe(3);
});

test('mixed-role demo account and unmanifested dependencies are protected', async () => {
  await raw('users').updateOne({ _id: sitter }, { $push: { roles: 'ADMIN' } });
  await expect(read()).rejects.toMatchObject({ code: 'RESET_PROTECTED_ROLE' });
  await raw('users').updateOne({ _id: sitter }, { $pull: { roles: 'ADMIN' } });
  await raw('employmentcontracts').insertOne({ _id: oid(), employeeId: sitter });
  await expect(read()).rejects.toMatchObject({ code: 'RESET_UNMANIFESTED_SITTER_RECORD' });
});

test('mismatched reservation or missing confirmations never alter products or orders', async () => {
  await expect(resetDemoWorkflows({ connection, apply: true })).rejects.toMatchObject({ code: 'RESET_CONFIRMATION_REQUIRED' });
  await raw('products').updateOne({ _id: product }, { $set: { quantityHeld: 4 } });
  await expect(read()).rejects.toMatchObject({ code: 'RESET_RESERVATION_MISMATCH' });
  expect(await raw('productorders').countDocuments()).toBe(1);
});

test('write failure aborts earlier deletes and leaves all source records intact', async () => {
  const plan = await read(), original = connection.db.collection.bind(connection.db);
  connection.db.collection = (name, ...args) => {
    const collection = original(name, ...args);
    if (name === 'products') collection.replaceOne = async () => { throw new Error('Synthetic write failure'); };
    return collection;
  };
  try { await expect(apply(plan.digest)).rejects.toThrow('Synthetic write failure'); }
  finally { connection.db.collection = original; }
  expect(await raw('bookings').countDocuments()).toBe(1);
  expect(await raw('users').findOne({ _id: sitter })).toBeTruthy();
  expect(await raw('products').findOne({ _id: product })).toMatchObject({ quantityHeld: 3, version: 4 });
});
