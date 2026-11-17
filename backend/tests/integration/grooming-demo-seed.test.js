import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
import { provisionServiceDetails } from '../../src/services/service-details-provisioning.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { provisionGroomingDemo } from '../../src/services/grooming/grooming-demo-seed.service.js';
import { createShopShiftSource } from '../../src/services/grooming/shop-shift-source.service.js';
import { serviceModel } from '../../src/models/service.model.js';
import { groomingLocalDate } from '../../src/utils/grooming-slot-time.js';

let replica, connection;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_grooming_demo' }).asPromise();
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('refuses to run before the demo service catalog exists', async () => {
  await expect(provisionGroomingDemo({ connection })).rejects.toThrow('demo service catalog');
});

test('creates two on-shift full-time shop sitters once and opens slots in the shop hours', async () => {
  await provisionInitialCatalog({ connection }); await provisionServiceDetails(connection); await provisionDemoCatalog({ connection });
  const first = await provisionGroomingDemo({ connection });
  expect(first).toMatchObject({ state: 'APPLIED', shopServices: 5, sitters: 2 });
  expect(first.created).toEqual(['operator', 'sitter-1', 'sitter-2']);
  expect(await provisionGroomingDemo({ connection })).toMatchObject({ state: 'ALREADY_APPLIED', created: [] });
  const db = connection.db;
  expect(await db.collection('users').countDocuments({ fixtureKey: /^grooming-demo:/ })).toBe(3);
  expect(await db.collection('users').countDocuments({ fixtureKey: /^grooming-demo:/, synthetic: true })).toBe(0);
  expect(await db.collection('aisitterprofiles').countDocuments({ active: true })).toBe(2);
  expect(await db.collection('employmentcontracts').countDocuments({ employmentType: 'FULL_TIME' })).toBe(2);
  const shop = (await serviceModel(connection).find({ 'presentation.locations': 'FACILITY', 'presentation.category': { $in: ['Vệ sinh', 'Làm đẹp'] } }).select('_id').lean()).map(row => row._id);
  const tomorrow = groomingLocalDate(Date.now() + 86400000);
  const roster = await createShopShiftSource({ connection }).openRoster({ serviceIds: shop,
    from: new Date(`${tomorrow}T00:00:00+07:00`), to: new Date(`${tomorrow}T23:59:00+07:00`) });
  const open = hour => roster.sittersFor(new Date(`${tomorrow}T${hour}:00+07:00`), new Date(`${tomorrow}T${String(Number(hour.slice(0, 2)) + 1).padStart(2, '0')}:00:00+07:00`)).length;
  expect([open('08:00'), open('11:00'), open('12:00'), open('13:00'), open('14:00'), open('16:00'), open('17:00')]).toEqual([2, 2, 0, 0, 2, 2, 0]);
});
