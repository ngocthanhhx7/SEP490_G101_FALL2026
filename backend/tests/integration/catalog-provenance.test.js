import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { CATALOG_VERSION_AUDITS, createCatalogChange, catalogProvenanceValidator } from '../../src/models/catalog-change-provenance.model.js';
import { serviceVersionModel } from '../../src/models/service-version.model.js';
import { servicePolicyVersionModel } from '../../src/models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../src/models/service-price-version.model.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';
import { migrateCatalogAudits, finalizeCatalogAuditStorage, restoreCatalogAuditStores, catalogAuditRecord } from '../../src/services/catalog-audit-migration.service.js';

let replica, connection, models;
const oid = () => new mongoose.Types.ObjectId();
const actorId = oid(), serviceId = oid(), time = new Date('2026-11-07T00:00:00Z');
const rawOptions = { promoteValues: false, promoteLongs: false };
const parent = (index, overrides = {}) => ({ _id: oid(), version: new mongoose.mongo.Double(1), changedBy: actorId,
  reason: 'Synthetic change', effectiveAt: time, recordedAt: time,
  ...(index === 0 ? { serviceId, name: 'Synthetic service', description: 'Synthetic description', scope: 'Synthetic scope', species: ['DOG'], state: 'ACTIVE' }
    : index === 1 ? { serviceId, state: 'PUBLISHED', title: 'Synthetic policy', body: 'Synthetic policy body' }
      : index === 2 ? { serviceId, amountVnd: 50000, currency: 'VND', unitLabel: 'lần' }
        : { key: 'SERVICE_CATALOG_VISIBLE', enabled: true }), ...overrides });
async function fixture() {
  const data = [];
  for (const [index, definition] of CATALOG_VERSION_AUDITS.entries()) {
    const version = parent(index), change = { eventId: oid(), action: definition.actions[0], changedFields: ['synthetic'] };
    await connection.db.collection(definition.target).insertOne(version);
    const stored = await connection.db.collection(definition.target).findOne({ _id: version._id }, rawOptions);
    const audit = catalogAuditRecord(definition, stored, change);
    await connection.db.collection(definition.source).insertOne(audit);
    data.push({ definition, version: stored, audit });
  }
  return data;
}
async function validators(required = true) {
  for (const definition of CATALOG_VERSION_AUDITS) await connection.db.command({ collMod: definition.target,
    validator: catalogProvenanceValidator(definition.type, required), validationLevel: 'strict', validationAction: 'error' });
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_catalog_provenance', autoIndex: false, autoCreate: false }).asPromise();
  models = [serviceVersionModel, servicePolicyVersionModel, servicePriceVersionModel, systemSettingVersionModel].map(factory => factory(connection));
}, 600000);
beforeEach(async () => {
  await connection.dropDatabase();
  for (const model of models) { await model.createCollection(); await model.createIndexes(); }
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('read-only preflight and guarded embedding preserve every original audit value/BSON type', async () => {
  const data = await fixture();
  const before = await connection.db.listCollections().toArray();
  const dry = await migrateCatalogAudits({ connection });
  expect(dry).toMatchObject({ sourceCount: 4, versionCount: 4, pending: 4, embedded: 0, baseMismatch: 0, uncoveredVersions: 0 });
  expect(await connection.db.listCollections().toArray()).toEqual(before);
  expect(await connection.db.collection('serviceversions').countDocuments({ changeAudit: { $exists: true } })).toBe(0);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow();
  expect(await migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest })).toMatchObject({ applied: 4, embedded: 4, pending: 0 });
  expect(await migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest })).toMatchObject({ applied: 0 });
  for (const { definition, version, audit } of data) {
    const after = await connection.db.collection(definition.target).findOne({ _id: version._id }, rawOptions);
    const reconstructed = catalogAuditRecord(definition, after);
    expect(reconstructed.version._bsontype).toBe('Double');
    const original = await connection.db.collection(definition.source).findOne({ _id: audit._id }, rawOptions);
    expect(reconstructed).toEqual(original);
    delete after.changeAudit;
    expect(after).toEqual(version);
  }
});

test('mismatched canonical facts and duplicate events for one version block the entire migration', async () => {
  const data = await fixture();
  await connection.db.collection('servicepriceaudits').updateOne({ _id: data[2].audit._id }, { $set: { reason: 'A different original reason' } });
  const mismatch = await migrateCatalogAudits({ connection });
  expect(mismatch.baseMismatch).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: mismatch.digest })).rejects.toThrow();
  await connection.db.collection('servicepriceaudits').updateOne({ _id: data[2].audit._id }, { $set: { reason: data[2].audit.reason } });
  await connection.db.collection('serviceaudits').insertOne({ ...data[0].audit, _id: oid() });
  const duplicate = await migrateCatalogAudits({ connection });
  expect(duplicate.duplicateParent).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: duplicate.digest })).rejects.toThrow();
});

test('missing historical evidence is never fabricated and existing provenance is never overwritten', async () => {
  const data = await fixture();
  await connection.db.collection('servicepolicyversions').insertOne(parent(1, { version: 2, effectiveAt: new Date(time.getTime() + 1000) }));
  let report = await migrateCatalogAudits({ connection });
  expect(report.uncoveredVersions).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: report.digest })).rejects.toThrow();
  await connection.db.collection('servicepolicyversions').deleteOne({ version: 2 });
  await connection.db.collection('serviceversions').updateOne({ _id: data[0].version._id },
    { $set: { changeAudit: createCatalogChange('SERVICE_CREATED', ['different']) } });
  report = await migrateCatalogAudits({ connection });
  expect(report.conflicts).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: report.digest })).rejects.toThrow();
});

test('cleanup requires complete coverage, native validators and old writer drain', async () => {
  await fixture();
  const dry = await migrateCatalogAudits({ connection });
  await expect(finalizeCatalogAuditStorage({ connection, apply: true, expectedDigest: dry.digest, writersDrained: true })).rejects.toThrow();
  await migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest });
  await expect(finalizeCatalogAuditStorage({ connection, apply: true, expectedDigest: dry.digest })).rejects.toThrow();
  await expect(finalizeCatalogAuditStorage({ connection, apply: true, expectedDigest: dry.digest, writersDrained: true })).rejects.toThrow(/validator/);
  await validators();
  expect(await finalizeCatalogAuditStorage({ connection, apply: true, expectedDigest: dry.digest, writersDrained: true })).toMatchObject({ state: 'AUDITS_EMBEDDED_AND_DUPLICATE_STORES_REMOVED' });
  expect((await connection.db.listCollections().toArray()).map(value => value.name).sort()).toEqual(CATALOG_VERSION_AUDITS.map(value => value.target).sort());
  await expect(models[2].collection.insertOne(parent(2, { version: 2, effectiveAt: new Date(time.getTime() + 1000) }))).rejects.toMatchObject({ code: 121 });
  await expect(models[2].collection.insertOne(parent(2, { version: 2, effectiveAt: new Date(time.getTime() + 1000),
    changeAudit: createCatalogChange('POLICY_VERSIONED', ['state']) }))).rejects.toMatchObject({ code: 121 });
});

test('pending historical IDs cannot collide with canonical-only versions and unknown evidence blocks copy', async () => {
  const data = await fixture();
  await models[1].create(parent(1, { version: 2, effectiveAt: new Date(+time + 1000),
    changeAudit: { eventId: data[0].audit._id, action: 'POLICY_VERSIONED', changedFields: ['state'] } }));
  let dry = await migrateCatalogAudits({ connection });
  expect(dry.conflicts).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest })).rejects.toThrow();
  await models[1].deleteOne({ version: 2 });
  await connection.db.collection('servicepriceaudits').updateOne({ _id: data[2].audit._id }, { $set: { unknownEvidence: true } });
  dry = await migrateCatalogAudits({ connection });
  expect(dry.invalidSource).toBe(1);
  await expect(migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest })).rejects.toThrow();
  expect(await models[0].countDocuments({ changeAudit: { $exists: true } })).toBe(0);
});

test('new versions hold provenance atomically, hide it by default and reject model mutation', async () => {
  const value = await models[2].create(parent(2, { changeAudit: createCatalogChange('SERVICE_PRICE_VERSIONED', ['amountVnd']) }));
  expect((await models[2].findById(value._id).lean()).changeAudit).toBeUndefined();
  expect((await models[2].findById(value._id).select('+changeAudit').lean()).changeAudit.action).toBe('SERVICE_PRICE_VERSIONED');
  await models[2].updateOne({ _id: value._id }, { $set: { reason: 'Tampered reason' } }).catch(error => {
    expect(error.name).toBe('StrictModeError');
  });
  expect((await models[2].findById(value._id).lean()).reason).toBe('Synthetic change');
  await expect(connection.transaction(async session => {
    await models[2].create([parent(2, { version: 2, effectiveAt: new Date(time.getTime() + 1000),
      changeAudit: createCatalogChange('SERVICE_PRICE_VERSIONED', ['amountVnd']) })], { session });
    throw new Error('Synthetic transaction abort');
  })).rejects.toThrow('Synthetic transaction abort');
  expect(await models[2].countDocuments()).toBe(1);
});

test('reverse reconstructs original IDs and post-cutover events before old-code validator relaxation', async () => {
  const originals = await fixture();
  const dry = await migrateCatalogAudits({ connection });
  await migrateCatalogAudits({ connection, apply: true, expectedDigest: dry.digest });
  await validators();
  await finalizeCatalogAuditStorage({ connection, apply: true, expectedDigest: dry.digest, writersDrained: true });
  const latest = await models[2].create(parent(2, { version: 2, effectiveAt: new Date(time.getTime() + 1000),
    reason: 'Synthetic post-cutover fact', changeAudit: createCatalogChange('SERVICE_PRICE_VERSIONED', ['amountVnd']) }));
  const reverse = await restoreCatalogAuditStores({ connection });
  expect(reverse.reconstructable).toBe(5);
  await expect(restoreCatalogAuditStores({ connection, apply: true, expectedDigest: '0'.repeat(64), writersDrained: true })).rejects.toThrow();
  expect(await restoreCatalogAuditStores({ connection, apply: true, expectedDigest: reverse.digest, writersDrained: true })).toMatchObject({ restored: 5, sourceCount: 5, embedded: 5 });
  for (const { definition, audit } of originals) expect(await connection.db.collection(definition.source).findOne({ _id: audit._id }, rawOptions)).toEqual(audit);
  const post = await models[2].findById(latest._id).select('+changeAudit').lean();
  expect(await connection.db.collection('servicepriceaudits').findOne({ _id: post.changeAudit.eventId })).toMatchObject({ reason: 'Synthetic post-cutover fact' });
  await validators(false);
  await models[2].collection.insertOne(parent(2, { version: 3, effectiveAt: new Date(time.getTime() + 2000) }));
  expect(await models[2].countDocuments()).toBe(3);
});
