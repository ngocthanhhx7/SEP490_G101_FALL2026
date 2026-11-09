import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { buildStorageContractManifest, inspectStorageContracts, compareStorageIndex } from '../../src/services/storage-contract-inspection.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { provisionReferenceCatalogStorage } from '../../src/services/reference-catalog-storage.service.js';
import { referenceCatalogModels } from '../../src/models/reference-catalog.model.js';
import { catalogProvenanceValidator } from '../../src/models/catalog-change-provenance.model.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { rawOperationalCollectionOptions } from '../../src/models/raw-operational.storage.js';

let replica, connection;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_storage_contracts',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
}, 600000);
beforeEach(async () => { await connection.dropDatabase(); connection.deleteModel(/.+/); });
afterAll(async () => { await connection?.close(); await replica?.stop(); });
const env = { FINANCE_SOURCES_ENABLED: 'true', EMPLOYEE_SCHEDULING_ENABLED: 'true' };
const inspect = manifest => inspectStorageContracts({ db: connection.db, manifest });
function fixtureModel() {
  const schema = new mongoose.Schema({ owner: String, expiresAt: Date, status: String }, { versionKey: false });
  schema.index({ owner: 1, status: -1 }, { unique: true, partialFilterExpression: { status: 'ACTIVE' } });
  schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  schema.index({ status: 1 });
  return connection.model('SyntheticContract', schema, 'syntheticcontracts');
}
async function fixture() {
  const model = fixtureModel(); await model.createCollection(); await model.createIndexes();
  return buildStorageContractManifest({ connection });
}

test('checks ordered keys and behavioral options without trusting index names', () => {
  const expected = { key: { owner: 1, status: -1 }, unique: true, partialFilterExpression: { status: 'ACTIVE' } };
  expect(compareStorageIndex({ ...expected, name: 'other-name' }, expected)).toEqual([]);
  expect(compareStorageIndex({ ...expected, key: { status: -1, owner: 1 } }, expected)).toContain('key');
  for (const field of ['unique', 'sparse', 'hidden', 'expireAfterSeconds', 'partialFilterExpression']) {
    const value = field === 'unique' ? false : field === 'expireAfterSeconds' ? 60 : field === 'partialFilterExpression' ? { status: 'ANY' } : true;
    expect(compareStorageIndex({ ...expected, [field]: value }, expected)).toContain(field);
  }
  expect(compareStorageIndex({ ...expected, collation: { locale: 'en' } }, expected)).toContain('collation');
  expect(compareStorageIndex({ ...expected, name: 'renamed' }, { ...expected, name: 'required-name', requireName: true })).toContain('name');
});

test('distinguishes correctness failures from read-index warnings and leaves data untouched', async () => {
  const manifest = await fixture();
  const c = connection.db.collection('syntheticcontracts');
  await c.insertOne({ owner: 'synthetic-private-marker', status: 'ACTIVE' });
  const before = await c.find().toArray(), commands = [];
  const listener = event => commands.push(event.commandName);
  connection.getClient().on('commandStarted', listener);
  try {
    const report = await inspect(manifest);
    expect(report).toMatchObject({ state: 'READY', critical: [], performance: [], checkedCollections: 1, checkedIndexes: 3 });
    expect(JSON.stringify(report)).not.toContain('synthetic-private-marker');
  } finally { connection.getClient().off('commandStarted', listener); }
  expect(commands.every(name => ['listCollections', 'listIndexes', 'getMore', 'killCursors'].includes(name))).toBe(true);
  expect(await c.find().toArray()).toEqual(before);
  await c.dropIndex('status_1');
  expect(await inspect(manifest)).toMatchObject({ state: 'READY_WITH_WARNINGS', critical: [], performance: [expect.objectContaining({ code: 'INDEX_MISSING' })] });
  await connection.db.command({ collMod: c.collectionName, index: { name: 'expiresAt_1', expireAfterSeconds: 90 } });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'INDEX_OPTIONS_DRIFT', differences: ['expireAfterSeconds'] }));
});

test('hidden unique, partial/sparse drift and unexpected unique/TTL never pass', async () => {
  const manifest = await fixture(), c = connection.db.collection('syntheticcontracts');
  await connection.db.command({ collMod: c.collectionName, index: { name: 'owner_1_status_-1', hidden: true } });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'INDEX_OPTIONS_DRIFT', differences: ['hidden'] }));
  await c.dropIndex('owner_1_status_-1');
  await c.createIndex({ owner: 1, status: -1 }, { unique: true, sparse: true });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ differences: ['sparse', 'partialFilterExpression'] }));
  await c.createIndex({ unexpected: 1 }, { unique: true });
  await c.createIndex({ unexpectedExpiry: 1 }, { expireAfterSeconds: 10 });
  expect((await inspect(manifest)).critical.filter(row => row.code === 'UNMATCHED_INDEX')).toHaveLength(3);
});

test('raw finance and scheduling declarations share provisioning and preserve owner direction equivalence', async () => {
  await provisionFinanceSources(connection);
  await provisionEmployeeScheduling(connection);
  await connection.db.collection('bookings').createIndex({ customerId: -1, _id: 1 });
  const manifest = buildStorageContractManifest({ connection, env });
  expect(await inspect(manifest)).toMatchObject({ state: 'READY', critical: [], performance: [] });
  await connection.db.collection('payments').dropIndex('one_verified_booking_receipt');
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ collection: 'payments', code: 'INDEX_MISSING' }));
  expect(buildStorageContractManifest({ connection }).collections.some(row => row.name === 'payments')).toBe(false);
});

test('reference catalog exact indexes, strict/error validator and collection type are checked', async () => {
  referenceCatalogModels(connection);
  await provisionReferenceCatalogStorage(connection.db);
  const manifest = buildStorageContractManifest({ connection });
  expect(await inspect(manifest)).toMatchObject({ state: 'READY', critical: [], performance: [], unasserted: [] });
  await connection.db.command({ collMod: 'reference_catalog', validationAction: 'warn' });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'VALIDATOR_DRIFT' }));
  await connection.db.collection('reference_catalog').createIndex({ code: 1 });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'UNMATCHED_INDEX' }));
  await connection.db.collection('reference_catalog').drop();
  await connection.db.createCollection('reference_catalog', { viewOn: 'synthetic_source', pipeline: [] });
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'COLLECTION_TYPE' }));
});

test('catalog provenance is explicit and a relaxed validator cannot satisfy required mode', async () => {
  connection.model('SyntheticPrice', new mongoose.Schema({}), 'servicepriceversions');
  await connection.db.createCollection('servicepriceversions', { validator: catalogProvenanceValidator('service-price', false) });
  expect((await inspect(buildStorageContractManifest({ connection }))).unasserted).toContainEqual({ collection: 'servicepriceversions', scope: 'validator' });
  const optional = buildStorageContractManifest({ connection, catalogProvenance: 'optional' });
  expect((await inspect(optional)).critical).toEqual([]);
  const required = buildStorageContractManifest({ connection, catalogProvenance: 'required' });
  expect((await inspect(required)).critical).toContainEqual(expect.objectContaining({ code: 'VALIDATOR_DRIFT' }));
  await connection.db.command({ collMod: 'servicepriceversions', validator: catalogProvenanceValidator('service-price') });
  expect((await inspect(required)).critical).toEqual([]);
});

test('fails closed on missing/unreadable metadata, reports uncontracted stores, never creates absent storage', async () => {
  const manifest = buildStorageContractManifest({ connection: { models: {} }, env });
  expect((await inspect(manifest)).critical.every(row => row.code === 'COLLECTION_MISSING')).toBe(true);
  expect(await connection.db.listCollections().toArray()).toEqual([]);
  await connection.db.createCollection('uncontracted');
  expect((await inspect(manifest)).unasserted).toContainEqual({ collection: 'uncontracted', scope: 'collection' });
  const db = { listCollections() { throw new Error('mongodb://secret:password@private-host'); } };
  const unavailable = await inspectStorageContracts({ db, manifest });
  expect(unavailable).toMatchObject({ state: 'NOT_READY', critical: [{ collection: null, code: 'COLLECTION_METADATA_UNAVAILABLE' }] });
  expect(JSON.stringify(unavailable)).not.toMatch(/secret|password|private-host/);
});

test('compares complete collation fields and flags implicit locale defaults as unverified', async () => {
  const options = { locale: 'en', strength: 2, caseLevel: false, caseFirst: 'off', numericOrdering: false,
    alternate: 'non-ignorable', maxVariable: 'punct', backwards: false, normalization: false };
  await connection.db.createCollection('collated', { collation: options });
  const c = connection.db.collection('collated'); await c.createIndex({ value: 1 }, { unique: true });
  const manifest = { version: 1, collections: [{ name: 'collated', options: { collation: options }, indexes: [{ key: { value: 1 }, unique: true }] }] };
  expect(await inspect(manifest)).toMatchObject({ state: 'READY', critical: [] });
  manifest.collections[0].options.collation = { locale: 'en' };
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'COLLECTION_COLLATION', differences: ['collationDefaultsUnasserted'] }));
  manifest.collections[0].options.collation = { ...options, strength: 3 };
  expect((await inspect(manifest)).critical).toContainEqual(expect.objectContaining({ code: 'INDEX_OPTIONS_DRIFT', differences: ['collation'] }));
});

test('selected EMPLOYEE target runtime is inspected without jobs, providers, provisioning or data commands', async () => {
  const runtimeEnv = { ...env, NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: connection.name,
    AUTH_ENABLED: 'true', OTP_HMAC_SECRET: 'synthetic-otp-secret-for-inspector',
    SESSION_TOKEN_SECRET: 'synthetic-token-secret-for-inspector', SESSION_CSRF_SECRET: 'synthetic-csrf-secret-for-inspector',
    CONTACT_LOOKUP_SECRET: 'synthetic-lookup-secret-for-inspector', CONTACT_ENCRYPTION_KEY: '12345678901234567890123456789012' };
  createApp({ config: loadConfig(runtimeEnv), connection, env: runtimeEnv, referenceCatalog: 'target', lifecycle: { draining: false } });
  await connection.db.createCollection('bookings', rawOperationalCollectionOptions('bookings'));
  await connection.db.collection('bookings').createIndex({ customerId: 1, _id: -1 });
  await provisionDeploymentStorage({ connection, env: runtimeEnv });
  const commands = [], listener = event => commands.push(event.commandName);
  connection.getClient().on('commandStarted', listener);
  let report;
  try { report = await inspect(buildStorageContractManifest({ connection, env: runtimeEnv })); }
  finally { connection.getClient().off('commandStarted', listener); }
  expect(report).toMatchObject({ state: 'READY', critical: [], performance: [] });
  expect(report.checkedIndexes).toBeGreaterThan(100);
  expect(commands.every(name => ['listCollections', 'listIndexes', 'getMore', 'killCursors'].includes(name))).toBe(true);
  expect(Object.values(connection.models).some(model => model.collection.name === 'earningaccrualtasks')).toBe(false);
});
