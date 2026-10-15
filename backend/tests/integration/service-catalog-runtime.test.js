import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
let replica, connection, app;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_catalog_runtime' }).asPromise();
  app = createApp({ config: loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'synthetic_catalog_runtime' }), connection, env: {} });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
test('default runtime serves the real catalog with visibility, effective policy and price gates', async () => {
  await request(app).get('/api/v1/services').expect(200).expect(({ body }) => expect(body.data).toEqual({ available: false, services: [] }));
  const actor = new mongoose.Types.ObjectId();
  const effectiveAt = new Date(Date.now() - 60000);
  await connection.models.SystemSettingVersion.create({ key: 'SERVICE_CATALOG_VISIBLE', version: 1, enabled: true,
    effectiveAt, changedBy: actor, reason: 'Synthetic test setting', recordedAt: effectiveAt });
  const service = await connection.models.Service.create({ code: 'synthetic-walk', createdBy: actor, createdAt: effectiveAt });
  await connection.models.ServiceVersion.create({ serviceId: service._id, version: 1, name: 'Synthetic dog walk',
    description: 'Synthetic care description', scope: 'Synthetic scope', species: ['DOG'], state: 'ACTIVE',
    effectiveAt, changedBy: actor, reason: 'Synthetic publish', recordedAt: effectiveAt });
  await request(app).get('/api/v1/services').expect(200).expect(({ body }) => expect(body.data.services).toEqual([]));
  await connection.models.ServicePolicyVersion.create({ serviceId: service._id, version: 1, state: 'PUBLISHED',
    title: 'Synthetic policy', body: 'Synthetic policy content', effectiveAt, changedBy: actor, reason: 'Synthetic policy', recordedAt: effectiveAt });
  await connection.models.ServicePriceVersion.create({ serviceId: service._id, version: 1, amountVnd: 50000,
    currency: 'VND', unitLabel: 'synthetic visit', effectiveAt, changedBy: actor, reason: 'Synthetic price', recordedAt: effectiveAt });
  await request(app).get('/api/v1/services').expect(200).expect(({ body }) => {
    expect(body.data.available).toBe(true); expect(body.data.services).toHaveLength(1);
    expect(body.data.services[0]).toMatchObject({ id: service._id.toString(), name: 'Synthetic dog walk', price: { amountVnd: 50000 } });
  });
  await request(app).get('/api/v1/services/admin').expect(404);
});
test('provisions the three real offerings once with migration provenance and preserves later price edits', async () => {
  const config = { auth: { enabled: false } };
  const result = await provisionInitialCatalog({ config, connection });
  expect(result.state).toBe('APPLIED'); expect(result.created).toHaveLength(3);
  const run = await connection.collection('catalogprovisioningruns').findOne({ key: 'pawworld-initial-three-services-v1' });
  expect(run.actorKind).toBe('SYSTEM_MIGRATION');
  expect(await connection.collection('users').countDocuments()).toBe(0);
  const walk = result.created.find(item => item.code === 'dog-walking');
  await connection.models.ServicePriceVersion.create({ serviceId: walk.id, version: 2, amountVnd: 90000,
    currency: 'VND', unitLabel: '30 phút', effectiveAt: new Date(), changedBy: new mongoose.Types.ObjectId(),
    reason: 'Synthetic admin price edit', recordedAt: new Date() });
  const repeated = await provisionInitialCatalog({ config, connection });
  expect(repeated).toEqual({ state: 'ALREADY_APPLIED', created: [] });
  await request(app).get('/api/v1/services').expect(200).expect(({ body }) => {
    const actual = body.data.services.filter(item => ['home-visit', 'dog-walking', 'vet-escort'].includes(item.code));
    expect(actual).toHaveLength(3);
    expect(actual.find(item => item.code === 'dog-walking').price.amountVnd).toBe(90000);
    expect(actual.find(item => item.code === 'vet-escort').species).toEqual(['DOG', 'CAT']);
  });
});
