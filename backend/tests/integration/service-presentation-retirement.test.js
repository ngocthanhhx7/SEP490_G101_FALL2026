import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { serviceModel } from '../../src/models/service.model.js';
import { servicePresentationModel } from '../../src/models/service-presentation.model.js';
import { inspectPresentationRetirement, retirePresentations, restorePresentations } from '../../src/services/service-presentation-retirement.service.js';
import { readServicePresentation, provisionServicePresentation } from '../../src/services/service-presentation.service.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';

let server;
const connections = [];
beforeAll(async () => { server = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } }); }, 600000);
afterAll(async () => { await Promise.all(connections.map(c => c.close())); await server?.stop(); }, 30000);
async function fixture(database) {
  const c = await mongoose.createConnection(server.getUri(), { dbName: database, autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
  connections.push(c);
  const Service = serviceModel(c), Legacy = servicePresentationModel(c);
  await Service.createCollection(); await Service.createIndexes(); await Legacy.createCollection(); await Legacy.createIndexes();
  const presentation = { category: 'Fixture', locations: ['HOME'], preparation: [], exclusions: [], faq: [], provisioningRunId: new mongoose.Types.ObjectId(), updatedAt: new Date(0) };
  const parent = await Service.create({ code: 'fixture', createdAt: new Date(0), createdBy: new mongoose.Types.ObjectId(), presentation });
  const old = await Legacy.create({ serviceId: parent._id, ...presentation });
  return { c, Service, parent, old };
}
test('retire exact copy, read/provision canonical only and restore current parent without changing legacy IDs', async () => {
  const { c, Service, parent, old } = await fixture('presentation_retire');
  const dry = await inspectPresentationRetirement(c);
  const args = { connection: c, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  expect(dry).toMatchObject({ documents: 1, indexes: 2 });
  await expect(retirePresentations(args)).resolves.toMatchObject({ state: 'RETIRED', documents: 1 });
  const reads = [], listener = e => { if (e.command[e.commandName] === 'servicepresentations') reads.push(e.commandName); };
  c.getClient().on('commandStarted', listener);
  try {
    expect((await readServicePresentation(c, parent._id)).category).toBe('Fixture');
    await c.transaction(session => provisionServicePresentation({ connection: c, serviceId: parent._id, details: {}, session }));
  } finally { c.getClient().off('commandStarted', listener); }
  expect(reads).toEqual([]);
  expect(await c.db.listCollections({ name: 'servicepresentations' }).toArray()).toEqual([]);
  await Service.updateOne({ _id: parent._id }, { $set: { 'presentation.category': 'New canonical value' } });
  await expect(restorePresentations(args)).resolves.toMatchObject({ state: 'RESTORED_FROM_CURRENT_PARENTS' });
  expect(await c.db.collection('servicepresentations').findOne({ _id: old._id })).toMatchObject({ serviceId: parent._id, category: 'New canonical value' });
  expect((await inspectPresentationRetirement(c)).documents).toBe(1);
});
test('mismatch/freeze guards reject removal and leaked legacy registry blocks provisioning before DDL', async () => {
  const { c, Service, parent } = await fixture('presentation_guards'), dry = await inspectPresentationRetirement(c);
  const args = { connection: c, manifest: dry.manifest, expectedDigest: dry.digest, writersFrozen: true };
  await expect(retirePresentations({ ...args, writersFrozen: false })).rejects.toThrow('PRESENTATION_FREEZE_REQUIRED');
  await expect(provisionDeploymentStorage({ connection: c })).rejects.toThrow('Retired presentation store');
  await Service.updateOne({ _id: parent._id }, { $set: { 'presentation.category': 'Drift' } });
  await expect(retirePresentations(args)).rejects.toThrow('PRESENTATION_COPY_CONFLICT');
  expect(await c.db.collection('servicepresentations').countDocuments()).toBe(1);
});
