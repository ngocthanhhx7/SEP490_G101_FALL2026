import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createPickupFeeSettings } from '../../src/services/pickup/pickup-fee-settings.service.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';

let replica, connection, settings;
const NOW = Date.parse('2026-11-27T04:00:00.000Z');
const admin = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'ACTIVE', roles: ['ADMIN'] };
const original = Object.freeze({
  expectedVersion: 0, effectiveAt: '2026-11-26T00:00:00.000Z',
  reason: 'Cau hinh phi don da duoc duyet', maxKm: 10,
  tiers: [
    { fromKm: 0, toKm: 5, feeVnd: 20000 },
    { fromKm: 5, toKm: 10, feeVnd: 40000 }
  ]
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'isolated_pickup_policy' }).asPromise();
  const Model = systemSettingVersionModel(connection);
  await Model.createCollection();
  await Model.createIndexes();
  settings = createPickupFeeSettings({ connection, clock: () => NOW });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('Admin revisions pickup fee tiers in the existing systemsettingversions collection', async () => {
  expect(await settings.current()).toBeNull();
  await expect(settings.update({ ...admin, roles: ['SALE_STAFF'] }, original))
    .rejects.toMatchObject({ status: 403 });
  const v1 = await settings.update(admin, original);
  expect(v1).toMatchObject({ version: 1, maxKm: 10, tiers: original.tiers });
  expect(await settings.current()).toMatchObject({ version: 1, maxKm: 10, tiers: original.tiers });
  const v2 = await settings.update(admin, {
    ...original, expectedVersion: 1, effectiveAt: '2026-11-27T00:00:00.000Z',
    maxKm: 12, reason: 'Dieu chinh phi don thang 12',
    tiers: [{ fromKm: 0, toKm: 12, feeVnd: 65000 }]
  });
  expect(v2).toMatchObject({ version: 2, maxKm: 12 });
  await expect(settings.update(admin, original)).rejects.toMatchObject({
    status: 409, code: 'VERSION_CONFLICT'
  });
  expect((await settings.history()).versions.map(row => row.version)).toEqual([2, 1]);
  expect(await connection.collection('systemsettingversions').countDocuments({ key: 'PICKUP_FEES' })).toBe(2);
  expect((await connection.db.listCollections().toArray()).some(row => row.name === 'pickupfees')).toBe(false);
});
