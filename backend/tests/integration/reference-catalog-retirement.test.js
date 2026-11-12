import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { applyReferenceCatalog, inspectReferenceCatalog, catalogCanonical } from '../../src/services/reference-catalog-migration.service.js';
import { inspectReferenceCatalogRetirement, retireReferenceCatalog, restoreReferenceCatalog, encodeReferenceCatalogManifest, decodeReferenceCatalogManifest } from '../../src/services/reference-catalog-retirement.service.js';
import { defaultReferenceCatalogSource, referenceCatalogCliSource, referenceCatalogSource } from '../../src/models/reference-catalog-source.js';

let server;
const connections = [];
beforeAll(async () => { server = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } }); }, 600000);
afterAll(async () => { await Promise.all(connections.map(c => c.close())); await server?.stop(); }, 30000);
async function fixture(name) {
  const c = await mongoose.createConnection(server.getUri(), { dbName: name, autoCreate: false, autoIndex: false }).asPromise(); connections.push(c);
  await c.db.collection('aibreeds').createIndex({ code: 1 }, { unique: true });
  await c.db.collection('aitraits').createIndex({ code: 1 }, { unique: true });
  await c.db.collection('aibreeds').insertOne({ _id: new mongoose.Types.ObjectId(), code: 'fixture', name: 'Fixture', species: 'DOG', source: 'synthetic', createdAt: new Date(0) });
  await c.db.collection('aitraits').insertOne({ _id: new mongoose.Types.ObjectId(), code: 'calm', label: 'Calm', species: ['DOG'], explanation: 'Synthetic', active: true });
  await c.db.collection('core').insertOne({ _id: 'core', integer: new mongoose.mongo.BSON.Int32(7) });
  const dry = await inspectReferenceCatalog(c.db);
  await applyReferenceCatalog(c.db, { expectedDigest: dry.summary.sourceDigest, writersFrozen: true });
  return c;
}
test('production runtime and operator defaults choose target, explicit rollback remains available', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    expect(defaultReferenceCatalogSource()).toBe('target');
    expect(referenceCatalogSource({})).toBe('target');
    expect(referenceCatalogCliSource([])).toBe('target');
    expect(referenceCatalogCliSource(['--reference-catalog=legacy'])).toBe('legacy');
    process.env.NODE_ENV = 'test'; expect(defaultReferenceCatalogSource()).toBe('legacy');
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
test('retire two exact catalogs, preserve core and restore/reconcile after target writes', async () => {
  const c = await fixture('catalog_retire_roundtrip'), dry = await inspectReferenceCatalogRetirement(c.db);
  expect(dry).toMatchObject({ collections: 2, documents: 2, indexes: 4 });
  const manifest = decodeReferenceCatalogManifest(encodeReferenceCatalogManifest(dry.manifest));
  const args = { db: c.db, manifest, expectedDigest: dry.digest, writersFrozen: true };
  await expect(retireReferenceCatalog(args)).resolves.toMatchObject({ state: 'RETIRED', completed: ['aibreeds', 'aitraits'] });
  expect(await c.db.listCollections({ name: { $in: ['aibreeds', 'aitraits'] } }).toArray()).toEqual([]);
  const original = await c.db.collection('reference_catalog').findOne({ kind: 'BREED' });
  await c.db.collection('reference_catalog').updateOne({ _id: original._id }, { $set: { name: 'Target updated' }, $unset: { createdAt: '' } });
  await c.db.collection('reference_catalog').insertOne({ _id: new mongoose.Types.ObjectId(), kind: 'TRAIT', code: 'new', label: 'New', species: ['DOG'], explanation: 'New' });
  await expect(restoreReferenceCatalog(args)).resolves.toMatchObject({ state: 'RESTORED_AND_RECONCILED', replacements: 1, inserts: 1 });
  expect((await inspectReferenceCatalog(c.db)).summary).toMatchObject({ blocked: false, missing: 0 });
  const core = await c.db.collection('core').findOne({}, { promoteValues: false });
  expect(catalogCanonical(core)).toContain('$numberInt');
});
test('drift and missing freeze block all drops; independent restore writes are preserved', async () => {
  const c = await fixture('catalog_retire_guards'), dry = await inspectReferenceCatalogRetirement(c.db);
  const args = { db: c.db, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  await expect(retireReferenceCatalog({ ...args, writersFrozen: false })).rejects.toThrow('CATALOG_FREEZE_REQUIRED');
  await c.db.collection('reference_catalog').updateOne({ kind: 'BREED' }, { $set: { name: 'Drift' } });
  await expect(retireReferenceCatalog(args)).rejects.toThrow('CATALOG_COPY_NOT_EXACT');
  expect(await c.db.listCollections({ name: { $in: ['aibreeds', 'aitraits'] } }).toArray()).toHaveLength(2);
  await c.db.collection('aibreeds').updateOne({}, { $set: { name: 'Unrelated operator' } });
  await expect(restoreReferenceCatalog(args)).rejects.toThrow('CATALOG_RESTORE_CONFLICT');
});
