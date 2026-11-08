import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { legacyCompensationCollections } from '../../src/config/storage-profile.js';
import { inspectLegacyStorage, retireLegacyStorage } from '../../src/services/legacy-storage-retirement.service.js';

let server;
const connections = [];
beforeAll(async () => { server = await MongoMemoryServer.create({ binary: { version: '8.0.34' } }); }, 600000);
afterAll(async () => { await Promise.all(connections.map(c => c.close())); await server?.stop(); }, 30000);
async function fixture(name) {
  const connection = await mongoose.createConnection(server.getUri(), { dbName: name, autoCreate: false, autoIndex: false }).asPromise();
  connections.push(connection);
  for (const collection of legacyCompensationCollections) {
    await connection.db.createCollection(collection);
    await connection.db.collection(collection).createIndex({ z: 1, a: -1 }, { unique: true, partialFilterExpression: { z: { $type: 'string' } } });
  }
  await connection.db.collection('retained_core').insertOne({ _id: 'sentinel', version: 42 });
  return connection;
}
test('dry-run, drop and restore preserve compound key order and every core record', async () => {
  const connection = await fixture('retire_roundtrip'), dry = await inspectLegacyStorage(connection);
  expect(dry.collections).toBe(16); expect(dry.indexes).toBe(32);
  expect((await connection.db.listCollections().toArray())).toHaveLength(17);
  const args = { connection, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  expect((await retireLegacyStorage(args)).completed).toHaveLength(16);
  expect((await connection.db.listCollections().toArray()).map(x => x.name)).toEqual(['retained_core']);
  expect((await retireLegacyStorage({ ...args, restore: true })).completed).toHaveLength(16);
  expect((await inspectLegacyStorage(connection)).digest).toBe(dry.digest);
  expect((await retireLegacyStorage({ ...args, restore: true })).completed).toEqual([]);
  expect(await connection.db.collection('retained_core').findOne()).toEqual({ _id: 'sentinel', version: 42 });
});
test('freeze, manifest and fresh metadata guards reject before any drop', async () => {
  const connection = await fixture('retire_guards'), dry = await inspectLegacyStorage(connection);
  const args = { connection, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  await expect(retireLegacyStorage({ ...args, writersFrozen: false })).rejects.toMatchObject({ code: 'RETIRE_FREEZE_REQUIRED' });
  await expect(retireLegacyStorage({ ...args, expectedDigest: '0'.repeat(64) })).rejects.toMatchObject({ code: 'RETIRE_DIGEST_MISMATCH' });
  await connection.db.collection('earnings').createIndex({ changed: 1 });
  await expect(retireLegacyStorage(args)).rejects.toMatchObject({ code: 'RETIRE_SOURCE_CHANGED' });
  expect(await connection.db.listCollections().toArray()).toHaveLength(17);
});
test('even one legacy record blocks inspection and restore never overwrites it', async () => {
  const connection = await fixture('retire_nonempty'), dry = await inspectLegacyStorage(connection);
  await connection.db.collection('earnings').insertOne({ z: 'history' });
  await expect(inspectLegacyStorage(connection)).rejects.toMatchObject({ code: 'RETIRE_NONEMPTY' });
  await expect(retireLegacyStorage({ connection, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true, restore: true }))
    .rejects.toMatchObject({ code: 'RETIRE_NONEMPTY' });
  expect(await connection.db.collection('earnings').countDocuments()).toBe(1);
});
test('partial drop requires explicit restore and does not recreate or delete unexpected stores', async () => {
  const connection = await fixture('retire_partial'), dry = await inspectLegacyStorage(connection);
  await connection.db.collection('earnings').drop();
  const args = { connection, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  await expect(retireLegacyStorage(args)).rejects.toMatchObject({ code: 'RETIRE_SOURCE_MISSING' });
  expect((await retireLegacyStorage({ ...args, restore: true })).completed).toEqual(['earnings']);
  expect((await inspectLegacyStorage(connection)).digest).toBe(dry.digest);
});
