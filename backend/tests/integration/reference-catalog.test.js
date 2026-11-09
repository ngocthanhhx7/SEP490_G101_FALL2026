import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { createPetCareManagement } from '../../src/services/pet-care-management.service.js';
import { createReferenceCatalogFacade } from '../../src/services/reference-catalog.service.js';
import { applyReferenceCatalog, catalogCanonical, inspectReferenceCatalog, inspectReverseReferenceCatalog, reverseReferenceCatalog } from '../../src/services/reference-catalog-migration.service.js';
import { provisionReferenceCatalogStorage } from '../../src/services/reference-catalog-storage.service.js';
import { referenceCatalogCollectionOptions } from '../../src/models/reference-catalog.storage.js';

let server, connection, targetConnection, db;
const oid = () => new mongoose.Types.ObjectId();
const breed = () => ({ _id: oid(), code: 'shared-code', name: 'Synthetic Breed', species: 'DOG', active: true, source: 'synthetic', createdAt: new Date(0), updatedAt: new Date(0) });
const trait = () => ({ _id: oid(), code: 'shared-code', label: 'Synthetic Trait', species: ['DOG', 'CAT'], active: true, explanation: 'Synthetic', createdAt: new Date(0), updatedAt: new Date(0) });
async function seed() {
  await db.collection('aibreeds').insertOne(breed());
  await db.collection('aitraits').insertOne(trait());
  await db.collection('pets').insertOne({ species: 'DOG', breedCode: 'shared-code', traits: ['shared-code'] });
  await db.collection('aipricingpolicies').insertOne({ rules: [{ when: { breedCodes: ['shared-code'], traitCode: 'shared-code', species: 'DOG' } }] });
  await db.collection('aisitterprofiles').insertOne({ allowedTraits: ['shared-code'] });
}
async function migrate() {
  const inspection = await inspectReferenceCatalog(db);
  return applyReferenceCatalog(db, { expectedDigest: inspection.summary.sourceDigest, writersFrozen: true });
}
beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ ip: '127.0.0.1' }] });
  connection = await mongoose.createConnection(server.getUri(), { dbName: 'reference_catalog_owned_tests', maxPoolSize: 2, autoCreate: false, autoIndex: false }).asPromise();
  db = connection.db;
  targetConnection = await mongoose.createConnection(server.getUri(), { dbName: 'reference_catalog_owned_tests', maxPoolSize: 2, autoCreate: false, autoIndex: false }).asPromise();
});
afterAll(async () => { await connection?.close(); await targetConnection?.close(); await server?.stop(); });
beforeEach(async () => { await db.dropDatabase(); await seed(); });

test('dry-run makes no collection and apply preserves exact BSON plus kind', async () => {
  const source = await db.collection('aibreeds').findOne();
  const before = await inspectReferenceCatalog(db);
  expect(before.summary.blocked).toBe(false);
  expect(await db.listCollections({ name: 'reference_catalog' }).hasNext()).toBe(false);
  expect((await migrate()).inserted).toBe(2);
  const target = await db.collection('reference_catalog').findOne({ kind: 'BREED' });
  const { kind, ...payload } = target;
  expect(kind).toBe('BREED');
  expect(catalogCanonical(payload)).toBe(catalogCanonical(source));
  expect(catalogCanonical(await db.collection('aibreeds').findOne())).toBe(catalogCanonical(source));
  expect((await migrate()).inserted).toBe(0);
});

test('existing service DTO, order, count and species validation match on target', async () => {
  await migrate();
  const legacy = petCareModels(connection), target = petCareModels(targetConnection, { referenceCatalog: 'target' });
  const service = models => createPetCareManagement({ repository: { models, connection } });
  expect(await service(target).catalog()).toEqual(await service(legacy).catalog());
  const facade = createReferenceCatalogFacade({ connection: targetConnection, source: 'target' });
  expect(await facade.listBreeds()).toEqual((await service(legacy).catalog()).breeds);
  expect(await facade.listTraits()).toEqual((await service(legacy).catalog()).traits);
  expect(await facade.existsBreed({ code: 'shared-code', species: 'DOG' })).toBeTruthy();
  expect(await facade.existsBreed({ code: 'shared-code', species: 'CAT' })).toBeNull();
  expect(await facade.countTraits({ codes: ['shared-code'], species: 'CAT' })).toBe(1);
  expect(() => facade.listBreeds({ limit: 0 })).toThrow();
  expect(() => facade.listTraits({ limit: 101 })).toThrow();
});

test('target seed upsert repeats safely and scopes uniqueness per kind', async () => {
  await migrate();
  const { PetBreed, PetTrait } = petCareModels(targetConnection, { referenceCatalog: 'target' });
  for (let i = 0; i < 2; i += 1) {
    await PetBreed.updateOne({ code: 'new-shared' }, { $setOnInsert: { code: 'new-shared', name: 'Fixture', species: 'DOG', source: 'fixture', active: true } }, { upsert: true, runValidators: true });
    await PetTrait.updateOne({ code: 'new-shared' }, { $setOnInsert: { code: 'new-shared', label: 'Fixture', species: ['DOG'], explanation: 'fixture', active: true } }, { upsert: true, runValidators: true });
  }
  expect(await PetBreed.countDocuments()).toBe(2);
  expect(await PetTrait.countDocuments()).toBe(2);
  await expect(PetBreed.create({ code: 'new-shared', name: 'Duplicate', species: 'DOG', source: 'fixture' })).rejects.toMatchObject({ code: 11000 });
  expect(await db.collection('aibreeds').countDocuments()).toBe(1);
});

test('late target conflict blocks all inserts before mutation', async () => {
  await db.collection('reference_catalog').insertOne({ ...(await db.collection('aitraits').findOne()), kind: 'TRAIT', label: 'conflict' });
  await expect(migrate()).rejects.toThrow('MIGRATION_BLOCKED');
  expect(await db.collection('reference_catalog').countDocuments()).toBe(1);
});

test('stale digest and malformed BSON/reference block before target creation', async () => {
  const dry = await inspectReferenceCatalog(db);
  await db.collection('aibreeds').updateOne({}, { $set: { source: 'changed' } });
  await expect(applyReferenceCatalog(db, { expectedDigest: dry.summary.sourceDigest, writersFrozen: true })).rejects.toThrow('SOURCE_DIGEST_MISMATCH');
  expect(await db.listCollections({ name: 'reference_catalog' }).hasNext()).toBe(false);
  await db.collection('aibreeds').updateOne({}, { $set: { active: new mongoose.mongo.BSON.Int32(1), unknown: true } });
  await db.collection('pets').updateOne({}, { $set: { traits: ['unknown-trait'] } });
  const invalid = await inspectReferenceCatalog(db);
  expect(invalid.summary.errors).toMatchObject({ ACTIVE_TYPE: 1, UNKNOWN_FIELD: 1, UNKNOWN_REFERENCE: 1 });
});

test('retry after concurrent apply cannot duplicate catalog rows', async () => {
  const { summary } = await inspectReferenceCatalog(db);
  const options = { writersFrozen: true, expectedDigest: summary.sourceDigest };
  const results = await Promise.allSettled([applyReferenceCatalog(db, options), applyReferenceCatalog(db, options)]);
  expect(results.some(result => result.status === 'fulfilled')).toBe(true);
  expect((await applyReferenceCatalog(db, options)).inserted).toBe(0);
  expect(await db.collection('reference_catalog').countDocuments()).toBe(2);
});

test('bounded scans reject above cap and unknown target records', async () => {
  await expect(inspectReferenceCatalog(db, { maxDocs: 1 })).resolves.toBeDefined();
  await db.collection('aibreeds').insertOne({ ...breed(), code: 'another' });
  await expect(inspectReferenceCatalog(db, { maxDocs: 1 })).rejects.toThrow('SCAN_DOCUMENT_LIMIT');
  await db.collection('reference_catalog').insertOne({ ...breed(), code: 'unexpected', kind: 'BREED' });
  expect((await inspectReferenceCatalog(db)).summary.errors.TARGET_EXTRA_RECORD).toBe(1);
});

test('insert failure rolls back every catalog payload in the transaction', async () => {
  const inspection = await inspectReferenceCatalog(db);
  const failingDb = {
    client: db.client, listCollections: db.listCollections.bind(db), createCollection: db.createCollection.bind(db),
    collection: name => {
      const collection = db.collection(name);
      if (name === 'reference_catalog') collection.insertMany = async (rows, options) => {
        await db.collection(name).insertOne(rows[0], options);
        throw new Error('SYNTHETIC_INSERT_FAILURE');
      };
      return collection;
    }
  };
  await expect(applyReferenceCatalog(failingDb, { expectedDigest: inspection.summary.sourceDigest, writersFrozen: true })).rejects.toThrow('SYNTHETIC_INSERT_FAILURE');
  expect(await db.collection('reference_catalog').countDocuments()).toBe(0);
  expect(await db.collection('aibreeds').countDocuments()).toBe(1);
  expect(await db.collection('aitraits').countDocuments()).toBe(1);
});

test('post-cutover target writes remain independent and refuse stale forward replay', async () => {
  await migrate();
  const target = petCareModels(targetConnection, { referenceCatalog: 'target' });
  await target.PetTrait.updateOne({ code: 'shared-code' }, { $set: { label: 'Post-cutover change' } }, { runValidators: true });
  expect((await db.collection('aitraits').findOne()).label).toBe('Synthetic Trait');
  expect((await inspectReferenceCatalog(db)).summary.errors.TARGET_CONFLICT).toBe(1);
  await expect(migrate()).rejects.toThrow('MIGRATION_BLOCKED');
});

test.each([
  ['unknown kind', row => ({ ...row, kind: 'OTHER' })],
  ['unknown field', row => ({ ...row, unknown: true })],
  ['wrong species shape', row => ({ ...row, species: ['DOG'] })],
  ['missing name', row => { const value = { ...row }; delete value.name; return value; }],
  ['wrong BSON active', row => ({ ...row, active: 1 })],
  ['wrong BSON id', row => ({ ...row, _id: 'bad-id' })],
  ['wrong timestamp', row => ({ ...row, createdAt: '2026-01-01' })],
  ['cross-kind fields', row => ({ ...row, label: 'wrong-kind' })],
  ['empty code', row => ({ ...row, code: '' })]
])('strict native validator rejects %s', async (_label, mutate) => {
  await provisionReferenceCatalogStorage(db);
  await expect(db.collection('reference_catalog').insertOne(mutate({ ...breed(), kind: 'BREED' }))).rejects.toMatchObject({ code: 121 });
});

test('native validator rejects scalar/null trait species and invalid updates', async () => {
  await migrate();
  for (const species of ['DOG', null, ['OTHER']]) {
    await expect(db.collection('reference_catalog').insertOne({ ...trait(), species, kind: 'TRAIT', code: 'new-trait' })).rejects.toMatchObject({ code: 121 });
  }
  await expect(db.collection('reference_catalog').updateOne({ kind: 'BREED' }, { $unset: { source: '' } })).rejects.toMatchObject({ code: 121 });
  await db.collection('reference_catalog').insertOne({ _id: oid(), kind: 'TRAIT', code: 'absence', label: 'Fixture', species: [], explanation: 'Fixture' });
  expect(await db.collection('reference_catalog').countDocuments()).toBe(3);
});

test('existing unvalidated target refuses implicit collMod and old index accumulation', async () => {
  await db.createCollection('reference_catalog');
  await expect(provisionReferenceCatalogStorage(db)).rejects.toThrow('REFERENCE_CATALOG_VALIDATOR_NOT_READY');
  expect((await db.listCollections({ name: 'reference_catalog' }).next()).options.validator).toBeUndefined();
});

test('old target index is blocked before creating a fourth index', async () => {
  await db.createCollection('reference_catalog', referenceCatalogCollectionOptions);
  await db.collection('reference_catalog').createIndexes([
    { key: { kind: 1, code: 1 }, name: 'reference_catalog_kind_code', unique: true },
    { key: { kind: 1, active: 1, code: 1 }, name: 'reference_catalog_active_code' }
  ]);
  await expect(provisionReferenceCatalogStorage(db)).rejects.toThrow('REFERENCE_CATALOG_INDEX_CONFLICT');
  expect(await db.collection('reference_catalog').listIndexes().toArray()).toHaveLength(3);
});

test('reverse reconciles changed/new target payloads with exact BSON and absence, then retries', async () => {
  const forward = await inspectReferenceCatalog(db), checkpoint = forward.checkpoint;
  await applyReferenceCatalog(db, { writersFrozen: true, expectedDigest: forward.summary.sourceDigest });
  await db.collection('reference_catalog').updateOne({ kind: 'BREED' }, { $set: { name: 'Target edit', updatedAt: new Date(42) }, $unset: { active: '', createdAt: '' } });
  await db.collection('reference_catalog').insertOne({ _id: oid(), kind: 'TRAIT', code: 'new-entry', label: 'Target new', species: ['DOG'], explanation: 'Fixture', updatedAt: new Date(99) });
  const options = { checkpoint, expectedCheckpointDigest: checkpoint.digest };
  const dry = await inspectReverseReferenceCatalog(db, options);
  expect(dry.summary).toMatchObject({ blocked: false, replacements: 1, inserts: 1 });
  const result = await reverseReferenceCatalog(db, { ...options, writersFrozen: true, expectedDigest: dry.summary.sourceDigest });
  expect(result).toMatchObject({ replacements: 1, inserts: 1, verified: true });
  for (const { kind, ...row } of await db.collection('reference_catalog').find().toArray()) {
    const legacy = await db.collection(kind === 'BREED' ? 'aibreeds' : 'aitraits').findOne({ _id: row._id });
    expect(catalogCanonical(legacy)).toBe(catalogCanonical(row));
  }
  const again = await inspectReverseReferenceCatalog(db, options);
  expect(await reverseReferenceCatalog(db, { ...options, writersFrozen: true, expectedDigest: again.summary.sourceDigest })).toMatchObject({ replacements: 0, inserts: 0 });
});

test('reverse blocks checkpoint tampering, independent legacy changes and target deletions', async () => {
  const forward = await inspectReferenceCatalog(db), checkpoint = forward.checkpoint;
  await applyReferenceCatalog(db, { writersFrozen: true, expectedDigest: forward.summary.sourceDigest });
  const options = { checkpoint, expectedCheckpointDigest: checkpoint.digest };
  await expect(inspectReverseReferenceCatalog(db, { ...options, expectedCheckpointDigest: '0'.repeat(64) })).rejects.toThrow('CHECKPOINT_DIGEST_MISMATCH');
  await db.collection('reference_catalog').updateOne({ kind: 'BREED' }, { $set: { name: 'Target edit' } });
  await db.collection('aibreeds').updateOne({}, { $set: { name: 'Independent legacy edit' } });
  expect((await inspectReverseReferenceCatalog(db, options)).summary.errors.REVERSE_LEGACY_CHANGED).toBe(1);
  const dry = await inspectReverseReferenceCatalog(db, options);
  await expect(reverseReferenceCatalog(db, { ...options, writersFrozen: true, expectedDigest: dry.summary.sourceDigest })).rejects.toThrow('REVERSE_BLOCKED');
  await db.collection('reference_catalog').deleteOne({ kind: 'TRAIT' });
  expect((await inspectReverseReferenceCatalog(db, options)).summary.errors.REVERSE_TARGET_DELETION).toBe(1);
});

test('reverse stale digest and injected write failure preserve original legacy payloads', async () => {
  const forward = await inspectReferenceCatalog(db);
  await applyReferenceCatalog(db, { writersFrozen: true, expectedDigest: forward.summary.sourceDigest });
  const options = { checkpoint: forward.checkpoint, expectedCheckpointDigest: forward.checkpoint.digest };
  const original = await db.collection('aibreeds').findOne();
  await db.collection('reference_catalog').updateOne({ kind: 'BREED' }, { $set: { name: 'Target change' } });
  const dry = await inspectReverseReferenceCatalog(db, options);
  await expect(reverseReferenceCatalog(db, { ...options, writersFrozen: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow('SOURCE_DIGEST_MISMATCH');
  const failingDb = {
    client: db.client,
    collection: name => {
      const collection = db.collection(name);
      if (name === 'aibreeds') collection.replaceOne = async (filter, row, transaction) => {
        await db.collection(name).replaceOne(filter, row, transaction);
        throw new Error('SYNTHETIC_REVERSE_FAILURE');
      };
      return collection;
    }
  };
  await expect(reverseReferenceCatalog(failingDb, { ...options, writersFrozen: true, expectedDigest: dry.summary.sourceDigest })).rejects.toThrow('SYNTHETIC_REVERSE_FAILURE');
  expect(catalogCanonical(await db.collection('aibreeds').findOne())).toBe(catalogCanonical(original));
});

test('catalog API limits and order remain equivalent at 201 breeds and 101 traits', async () => {
  const breeds = Array.from({ length: 200 }, (_, index) => ({ ...breed(), code: 'breed-' + index, name: 'Name ' + String(index).padStart(3, '0') }));
  const traits = Array.from({ length: 100 }, (_, index) => ({ ...trait(), code: 'trait-' + String(index).padStart(3, '0') }));
  await db.collection('aibreeds').insertMany(breeds);
  await db.collection('aitraits').insertMany(traits);
  await migrate();
  const read = models => createPetCareManagement({ repository: { models, connection } }).catalog();
  const legacy = await read(petCareModels(connection)), target = await read(petCareModels(targetConnection, { referenceCatalog: 'target' }));
  expect(target).toEqual(legacy);
  expect(target.breeds).toHaveLength(200);
  expect(target.traits).toHaveLength(100);
});

test('target reader never falls back or unions populated legacy catalogs', async () => {
  await provisionReferenceCatalogStorage(db);
  const target = petCareModels(targetConnection, { referenceCatalog: 'target' });
  expect(await target.PetBreed.countDocuments()).toBe(0);
  expect(await target.PetTrait.countDocuments()).toBe(0);
  const catalog = await createPetCareManagement({ repository: { connection: targetConnection, models: target } }).catalog();
  expect(catalog.breeds).toEqual([]); expect(catalog.traits).toEqual([]);
  expect(await db.collection('aibreeds').countDocuments()).toBe(1);
});
