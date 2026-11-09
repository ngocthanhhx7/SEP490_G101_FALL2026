import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { serviceModel } from '../../src/models/service.model.js';
import { servicePresentationModel } from '../../src/models/service-presentation.model.js';
import { migrateServicePresentations } from '../../src/services/service-presentation-migration.service.js';
import { readServicePresentation, provisionServicePresentation } from '../../src/services/service-presentation.service.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';

let replica, connection, Service, Legacy;
const details = () => ({ category: 'Synthetic', locations: ['HOME'], durationMinutes: 60,
  preparation: ['Synthetic preparation'], exclusions: [], faq: [], provisioningRunId: new mongoose.Types.ObjectId(), updatedAt: new Date() });
async function fixture() {
  const service = await Service.create({ code: 'synthetic-service', createdBy: new mongoose.Types.ObjectId(), createdAt: new Date() });
  const legacy = await Legacy.create({ serviceId: service._id, ...details() });
  return { service, legacy };
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_presentation_migration' }).asPromise();
  Service = serviceModel(connection); Legacy = servicePresentationModel(connection);
  await Service.createIndexes(); await Legacy.createIndexes();
}, 600000);
beforeEach(async () => { await Service.deleteMany({}); await Legacy.deleteMany({}); });
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('dry-run is read-only, additive copy is resumable and legacy rollback remains byte-compatible', async () => {
  const { service } = await fixture();
  const before = await Legacy.find().lean();
  const dry = await migrateServicePresentations({ connection });
  expect(dry).toMatchObject({ state: 'DRY_RUN', source: 1, copy: 1, applied: 0, conflicts: 0, orphans: 0, invalid: 0 });
  expect((await Service.findById(service._id).lean()).presentation).toBeUndefined();
  expect(await readServicePresentation(connection, service._id)).toBeNull();
  await expect(migrateServicePresentations({ connection, apply: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow();
  expect((await Service.findById(service._id).lean()).presentation).toBeUndefined();
  expect(await migrateServicePresentations({ connection, apply: true, expectedDigest: dry.digest })).toMatchObject({ applied: 1 });
  expect(await migrateServicePresentations({ connection, apply: true, expectedDigest: dry.digest })).toMatchObject({ applied: 0, identical: 1 });
  expect(await Legacy.find().lean()).toEqual(before);
  // Reverting to the previous release needs no DB reversal while legacy is kept.
  expect((await Legacy.findOne({ serviceId: service._id }).lean()).durationMinutes).toBe(60);
  await Legacy.deleteMany({});
  expect((await readServicePresentation(connection, service._id)).durationMinutes).toBe(60);
});

test('conflicting embedded metadata, orphan and oversized arrays block the whole copy', async () => {
  const { service } = await fixture();
  await Service.updateOne({ _id: service._id }, { $set: { presentation: details() } });
  await Legacy.collection.insertOne({ serviceId: new mongoose.Types.ObjectId(), ...details() });
  const dry = await migrateServicePresentations({ connection });
  expect(dry).toMatchObject({ conflicts: 1, orphans: 1 });
  await expect(migrateServicePresentations({ connection, apply: true, expectedDigest: dry.digest })).rejects.toThrow();
  await Service.updateOne({ _id: service._id }, { $unset: { presentation: '' } });
  await Legacy.updateOne({ serviceId: service._id }, { $set: { preparation: Array(51).fill('Synthetic') } });
  expect(await migrateServicePresentations({ connection })).toMatchObject({ invalid: 1 });
});

test('provisioning preserves the canonical copy and never writes the frozen legacy store', async () => {
  const { service, legacy } = await fixture();
  await Legacy.updateOne({ _id: legacy._id }, { $unset: { category: '' } });
  const dry = await migrateServicePresentations({ connection });
  await migrateServicePresentations({ connection, apply: true, expectedDigest: dry.digest });
  await connection.transaction(session => provisionServicePresentation({ connection, serviceId: service._id,
    details: { ...details(), category: 'Filled' }, session, fillOwnerId: legacy.provisioningRunId,
    fillMissing: ['category'] }));
  expect((await Service.findById(service._id).lean()).presentation.category).toBe('Filled');
  expect((await Legacy.findById(legacy._id).lean()).category).toBeUndefined();
  await connection.transaction(session => provisionServicePresentation({ connection, serviceId: service._id,
    details: { ...details(), category: 'Replacement forbidden' }, session }));
  expect((await readServicePresentation(connection, service._id)).category).toBe('Filled');
});

test('hourly view quota expires only 24 hours after its one-hour enforcement window', async () => {
  const { SitterApplicationDownloadQuota: Quota, SitterApplicationAudit: Audit } = sitterApplicationModels(connection);
  await Quota.createIndexes();
  const indexes = await Quota.collection.listIndexes().toArray();
  expect(indexes.find(index => index.key.windowStart === 1 && !index.key.actorId).expireAfterSeconds).toBe(90000);
  expect(indexes.find(index => index.key.actorId === 1).unique).toBe(true);
  expect(Audit.schema.indexes().some(([, options]) => options.expireAfterSeconds !== undefined)).toBe(false);
});
