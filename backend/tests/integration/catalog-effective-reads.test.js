import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { serviceModel } from '../../src/models/service.model.js';
import { serviceVersionModel } from '../../src/models/service-version.model.js';
import { servicePolicyVersionModel } from '../../src/models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../../src/models/service-price-version.model.js';
import { systemSettingVersionModel } from '../../src/models/system-setting-version.model.js';
import { createServiceCatalogService } from '../../src/services/service-catalog.service.js';
import { createServicePriceService } from '../../src/services/service-price.service.js';
import { createSystemSettingsService } from '../../src/services/system-settings.service.js';

let replica, connection, models, service, prices, settings, catalog;
const origin = Date.parse('2026-11-08T00:00:00Z'), at = seconds => new Date(origin + seconds * 1000);
const actor = new mongoose.Types.ObjectId();
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_effective_reads' }).asPromise();
  const [Service, Version, Policy, Price, Setting] = [serviceModel, serviceVersionModel, servicePolicyVersionModel,
    servicePriceVersionModel, systemSettingVersionModel].map(factory => factory(connection));
  models = { Service, Version, Policy, Price, Setting };
  await Promise.all(Object.values(models).map(Model => Model.init()));
  service = await Service.create({ code: 'synthetic-effective', createdBy: actor, createdAt: at(0) });
  const common = { changedBy: actor, reason: 'Synthetic effective-time history', recordedAt: at(0) };
  // Version3 is entered after version2 but takes effect earlier. Highest version
  // and latest effective version intentionally disagree at several boundaries.
  for (const [version, seconds] of [[1, 1], [2, 3], [3, 2]]) {
    const base = { ...common, version, effectiveAt: at(seconds) };
    await Version.create({ ...base, serviceId: service._id, name: 'Synthetic service', description: 'Synthetic description',
      scope: 'Synthetic scope', species: ['DOG'], state: 'ACTIVE' });
    await Policy.create({ ...base, serviceId: service._id, state: version === 2 ? 'WITHDRAWN' : 'PUBLISHED',
      ...(version === 2 ? {} : { title: 'Synthetic policy', body: 'Synthetic policy body' }) });
    await Price.create({ ...base, serviceId: service._id, amountVnd: seconds * 10000, unitLabel: 'lượt', currency: 'VND' });
    await Setting.create({ ...base, key: 'SERVICE_CATALOG_VISIBLE', enabled: version !== 2 });
  }
  prices = createServicePriceService({ connection, PriceVersion: Price, serviceExists: async () => true });
  settings = createSystemSettingsService({ connection, SettingVersion: Setting });
  catalog = createServiceCatalogService({ connection, Service, ServiceVersion: Version, PolicyVersion: Policy,
    priceProvider: prices, catalogSettings: { isEnabledAt: async () => true } });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('point reads use effective time across future, backdated and exact-boundary versions', async () => {
  expect(await prices.getActivePrice(String(service._id), at(0))).toBeNull();
  expect(await settings.currentAt(at(0))).toMatchObject({ enabled: false, version: 0 });
  await expect(catalog.bookableSnapshot(String(service._id), at(0))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  for (const [seconds, version, amountVnd] of [[1, 1, 10000], [2, 3, 20000], [3, 2, 30000], [4, 2, 30000]]) {
    expect(await prices.getActivePrice(String(service._id), at(seconds))).toMatchObject({ version, amountVnd });
    expect(await settings.currentAt(at(seconds))).toMatchObject({ version, enabled: version !== 2 });
    if (version !== 2) {
      const snapshot = await catalog.bookableSnapshot(String(service._id), at(seconds));
      expect(snapshot.service.version).toBe(version);
      expect(snapshot.policy.version).toBe(version);
      expect(snapshot.price.amountVnd).toBe(amountVnd);
    }
  }
  expect((await prices.list(String(service._id))).map(row => row.version)).toEqual([2, 3, 1]);
});

test('effective withdrawal stays unavailable instead of resurrecting an older published policy', async () => {
  await expect(catalog.bookableSnapshot(String(service._id), at(3))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  await expect(catalog.bookableSnapshot(String(service._id), at(100))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
});

test('database uniqueness enforces the no-tie invariant for all four version types', async () => {
  for (const Model of [models.Version, models.Policy, models.Price, models.Setting]) {
    const first = await Model.findOne({ version: 1 }).lean();
    delete first._id;
    await expect(Model.create({ ...first, version: 4 })).rejects.toMatchObject({ code: 11000 });
    expect(await Model.countDocuments()).toBe(3);
  }
});

test('bounded traversal preserves orphan 404 only when latest service/policy would be publicly eligible', async () => {
  const orphanId = new mongoose.Types.ObjectId(), common = { changedBy: actor, reason: 'Synthetic orphan regression', recordedAt: at(0), serviceId: orphanId };
  await models.Version.create({ ...common, version: 1, effectiveAt: at(1), name: 'Orphan', description: 'Fixture', scope: 'Fixture', species: ['DOG'], state: 'ACTIVE' });
  await models.Policy.create({ ...common, version: 1, effectiveAt: at(1), state: 'PUBLISHED', title: 'Fixture policy', body: 'Fixture policy body' });
  await expect(catalog.publicList({ at: at(2) })).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  await models.Policy.create({ ...common, version: 2, effectiveAt: at(3), state: 'WITHDRAWN' });
  await expect(catalog.publicList({ at: at(3) })).resolves.toMatchObject({ available: true });
  await models.Version.deleteMany({ serviceId: orphanId }); await models.Policy.deleteMany({ serviceId: orphanId });
});
