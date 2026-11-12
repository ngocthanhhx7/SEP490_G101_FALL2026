import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { inspectEmptyAccrualQueue, retireEmptyAccrualQueue, EMPTY_ACCRUAL_QUEUE_SCOPE } from '../../src/services/empty-accrual-queue-retirement.service.js';
import { financeSourceModels } from '../../src/models/finance-source.model.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';

let replica, connection;
const queue = 'earningaccrualtasks', env = { COMPENSATION_PROFILE: 'EMPLOYEE' };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_queue_retirement',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
}, 600000);
beforeEach(async () => { await connection.dropDatabase(); connection.deleteModel(/.+/); });
afterAll(async () => { await connection?.close(); await replica?.stop(); });
async function fixture() {
  await connection.db.createCollection(queue); await connection.db.collection(queue).createIndex({ state: 1, nextAttemptAt: 1 });
  await connection.db.collection('synthetic_core').insertOne({ _id: 'core', privateValue: 'synthetic-retained' });
  const before = await inspectEmptyAccrualQueue(connection, { env });
  return { connection, env, manifest: before.manifest, expectedDigest: before.digest, database: connection.name,
    confirmation: EMPTY_ACCRUAL_QUEUE_SCOPE, writersFrozen: true, checkpoint: async () => {} };
}

test('dry-run is fixed-scope and read-only; apply/reverse preserve every current core record and exact queue index metadata', async () => {
  const input = await fixture(), commands = [], listener = e => commands.push(e.commandName);
  connection.getClient().on('commandStarted', listener);
  try { expect(await inspectEmptyAccrualQueue(connection, { env })).toMatchObject({ state: 'DRY_RUN', documents: 0, indexes: 2 }); }
  finally { connection.getClient().off('commandStarted', listener); }
  expect(commands.every(name => ['listCollections', 'listIndexes', 'find', 'getMore', 'killCursors'].includes(name))).toBe(true);
  expect(await retireEmptyAccrualQueue(input)).toMatchObject({ state: 'RETIRED', documentsRemoved: 0 });
  expect((await inspectEmptyAccrualQueue(connection, { env })).state).toBe('ABSENT');
  await connection.db.collection('synthetic_core').insertOne({ _id: 'new', privateValue: 'new-write-after-drop' });
  expect(await retireEmptyAccrualQueue({ ...input, restore: true })).toMatchObject({ state: 'RESTORED' });
  expect((await inspectEmptyAccrualQueue(connection, { env })).manifest).toEqual(input.manifest);
  expect(await connection.db.collection('synthetic_core').countDocuments()).toBe(2);
});

test('missing approval-scope/freeze/database/digest, a foreign namespace and new queue records block destructive DDL', async () => {
  const input = await fixture();
  for (const bad of [{ confirmation: 'old-sixteen-store-approval' }, { writersFrozen: false }, { database: 'other' },
    { expectedDigest: '0'.repeat(64) }, { manifest: { ...input.manifest, name: 'bookings' } }]) {
    await expect(retireEmptyAccrualQueue({ ...input, ...bad })).rejects.toThrow();
  }
  await connection.db.collection(queue).insertOne({ _id: 'synthetic-task', state: 'PENDING' });
  await expect(retireEmptyAccrualQueue(input)).rejects.toThrow('QUEUE_NOT_EMPTY');
  expect(await connection.db.collection(queue).countDocuments()).toBe(1);
});

test('LEGACY_PARTNER and accidentally registered legacy models cannot retire this queue', async () => {
  const input = await fixture();
  await expect(retireEmptyAccrualQueue({ ...input, env: { COMPENSATION_PROFILE: 'LEGACY_PARTNER' } })).rejects.toThrow('EMPLOYEE_PROFILE');
  financeSourceModels(connection, { legacyTasks: true });
  await expect(inspectEmptyAccrualQueue(connection, { env })).rejects.toThrow('must not register');
});

test('foreign options/indexes, wrong compound order and a nonempty restore destination are preserved', async () => {
  const input = await fixture();
  await connection.db.collection(queue).createIndex({ bookingId: 1 });
  await expect(inspectEmptyAccrualQueue(connection, { env })).rejects.toThrow('METADATA_UNSUPPORTED');
  await connection.db.collection(queue).dropIndex('bookingId_1');
  await connection.db.collection(queue).dropIndex('state_1_nextAttemptAt_1');
  await connection.db.collection(queue).createIndex({ nextAttemptAt: 1, state: 1 }, { name: 'state_1_nextAttemptAt_1' });
  await expect(inspectEmptyAccrualQueue(connection, { env })).rejects.toThrow('METADATA_UNSUPPORTED');
  await connection.db.collection(queue).drop();
  await connection.db.createCollection(queue); await connection.db.collection(queue).insertOne({ _id: 'new-task' });
  await expect(retireEmptyAccrualQueue({ ...input, restore: true })).rejects.toThrow('QUEUE_NOT_EMPTY');
  expect(await connection.db.collection(queue).countDocuments()).toBe(1);
});

test('unknown drop acknowledgement keeps a durable scope and reverse reconciles absence without touching core', async () => {
  const input = await fixture(); let journal;
  const db = { listCollections: (...args) => connection.db.listCollections(...args), createCollection: (...args) => connection.db.createCollection(...args),
    collection: name => {
      const collection = connection.db.collection(name);
      return { find: (...args) => collection.find(...args), listIndexes: (...args) => collection.listIndexes(...args),
        drop: async () => { await collection.drop(); throw new Error('synthetic-lost-drop-ack'); } };
    } };
  await expect(retireEmptyAccrualQueue({ ...input, connection: { name: connection.name, models: connection.models, db },
    checkpoint: async value => { journal = JSON.parse(JSON.stringify(value)); } })).rejects.toThrow('synthetic-lost-drop-ack');
  expect(journal).toMatchObject({ state: 'PARTIAL', inProgress: true, scope: EMPTY_ACCRUAL_QUEUE_SCOPE });
  expect(await retireEmptyAccrualQueue({ ...input, restore: true })).toMatchObject({ state: 'RESTORED' });
  expect(await connection.db.collection('synthetic_core').countDocuments()).toBe(1);
});

test('partial empty restore can resume its known missing secondary index, never a foreign validator', async () => {
  const input = await fixture(); await retireEmptyAccrualQueue(input);
  await connection.db.createCollection(queue); // Simulates lost acknowledgement after namespace creation.
  expect(await retireEmptyAccrualQueue({ ...input, restore: true })).toMatchObject({ state: 'RESTORED' });
  await connection.db.command({ collMod: queue, validator: { state: { $exists: true } } });
  await expect(retireEmptyAccrualQueue({ ...input, restore: true })).rejects.toThrow('METADATA_UNSUPPORTED');
});

test('full EMPLOYEE target runtime provisioning does not recreate a retired queue; explicit legacy factory stays available', async () => {
  const input = await fixture();
  const runtimeEnv = { ...env, NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: connection.name,
    AUTH_ENABLED: 'true', FINANCE_SOURCES_ENABLED: 'true', EMPLOYEE_SCHEDULING_ENABLED: 'true',
    OTP_HMAC_SECRET: 'synthetic-queue-otp-secret-for-runtime-test', SESSION_TOKEN_SECRET: 'synthetic-queue-token-secret-for-runtime-test',
    SESSION_CSRF_SECRET: 'synthetic-queue-csrf-secret-for-runtime-test', CONTACT_LOOKUP_SECRET: 'synthetic-queue-lookup-secret-for-runtime-test',
    CONTACT_ENCRYPTION_KEY: '12345678901234567890123456789012' };
  createApp({ config: loadConfig(runtimeEnv), connection, env: runtimeEnv, referenceCatalog: 'target', lifecycle: { draining: false } });
  await provisionFinanceSources(connection); await connection.db.collection('bookings').createIndex({ customerId: 1, _id: -1 });
  await provisionDeploymentStorage({ connection, env: runtimeEnv });
  await retireEmptyAccrualQueue(input);
  await provisionDeploymentStorage({ connection, env: runtimeEnv }); await provisionDeploymentStorage({ connection, env: runtimeEnv });
  expect((await inspectEmptyAccrualQueue(connection, { env })).state).toBe('ABSENT');
  expect(Object.values(connection.models).some(model => model.collection.name === queue)).toBe(false);
  // The legacy factory is compatibility tooling; it is not selected on this runtime connection.
  const legacy = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_queue_legacy', autoCreate: false, autoIndex: false }).asPromise();
  try { await provisionFinanceSources(legacy, { legacyTasks: true });
    expect(await legacy.db.collection(queue).countDocuments()).toBe(0);
    expect((await legacy.db.collection(queue).listIndexes().toArray())).toHaveLength(2);
  } finally { await legacy.close(); }
});
