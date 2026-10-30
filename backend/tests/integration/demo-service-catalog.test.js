import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
import { provisionServiceDetails } from '../../src/services/service-details-provisioning.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { createPricingService } from '../../src/services/pricing/pricing.service.js';
let replica, connection, app, pricing, owner, petId;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_demo_catalog' }).asPromise();
  app = createApp({ config: loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'synthetic_demo_catalog' }), connection, env: {} });
  await provisionInitialCatalog({ connection }); await provisionServiceDetails(connection);
  const result = await provisionDemoCatalog({ connection });
  expect(result.catalog.created).toHaveLength(12); expect(result.retired.sort()).toEqual(['home-visit', 'vet-escort']);
  const repository = createPricingRepository(connection);
  for (const model of Object.values(repository.models)) { await model.createCollection(); await model.createIndexes(); }
  pricing = createPricingService({ repository }); owner = new mongoose.Types.ObjectId().toString();
  await repository.models.PetBreed.create({ code: 'dog-mixed', name: 'Synthetic mixed breed', species: 'DOG', active: true, source: 'synthetic fixture' });
  const pet = await repository.models.Pet.create({ ownerId: owner, name: 'Synthetic dog', species: 'DOG', breedCode: 'dog-mixed', weightKg: 4, traits: [], careNeedsConfirmed: true });
  petId = String(pet._id);
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('serves thirteen real services with metadata and immutable legacy histories', async () => {
  const response = await request(app).get('/api/v1/services').expect(200);
  expect(response.body.data.services).toHaveLength(13);
  for (const service of response.body.data.services) {
    expect(service.details.category).toBeTruthy(); expect(service.details.locations.length).toBeGreaterThan(0);
  }
  const care = response.body.data.services.find(s => s.code === 'home-care');
  expect(care).toMatchObject({ price: { amountVnd: 120000, unitLabel: 'lần' }, details: { category: 'Chăm sóc', locations: ['HOME'], durationMinutes: 60 } });
  expect(await connection.models.ServiceVersion.countDocuments({ state: 'INACTIVE' })).toBe(2);
  expect(await connection.collection('users').countDocuments()).toBe(0);
  expect((await provisionDemoCatalog({ connection })).state).toBe('ALREADY_APPLIED');
});
test('basket discounts six visits once at six percent with source versions and owner checks', async () => {
  const catalog = (await request(app).get('/api/v1/services')).body.data.services;
  const input = code => ({ serviceId: catalog.find(s => s.code === code).id, petIds: [petId], durationMinutes: 60, visitCount: 3 });
  const result = await pricing.basket(owner, { items: [input('pet-bathing'), input('home-care')] });
  expect(result).toMatchObject({ baseVnd: 660000, comboBps: 600, discountVnd: 39600, totalVnd: 620400, paymentMode: 'PREPAY' });
  expect(result.items[0]).toMatchObject({ policyVersion: 1, serviceVersion: 1, priceVersion: 1 });
  expect((await pricing.readDecision(owner, result.quoteId)).totalVnd).toBe(620400);
  await expect(pricing.basket(String(new mongoose.Types.ObjectId()), { items: [input('pet-bathing')] })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(pricing.readDecision(String(new mongoose.Types.ObjectId()), result.quoteId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});
test('rerun keeps later Admin price edits', async () => {
  const service = await connection.models.Service.findOne({ code: 'pet-bathing' });
  const now = new Date();
  await connection.models.ServicePriceVersion.create({ serviceId: service._id, version: 2, amountVnd: 110000, unitLabel: 'lần', currency: 'VND',
    changedBy: new mongoose.Types.ObjectId(), reason: 'Synthetic Admin price edit', effectiveAt: now, recordedAt: now });
  await provisionDemoCatalog({ connection });
  const catalog = (await request(app).get('/api/v1/services')).body.data.services;
  expect(catalog.find(s => s.code === 'pet-bathing').price.amountVnd).toBe(110000);
});
