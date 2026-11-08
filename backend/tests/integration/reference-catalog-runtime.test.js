import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { platformDataModels } from '../../src/models/platform-data.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { selectReferenceCatalogSource } from '../../src/models/reference-catalog-source.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { assertRuntimeStorageProfile } from '../../src/config/storage-profile.js';
import { startRuntime } from '../../src/runtime.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { createAiRepository } from '../../src/services/sitter-matching/matching.repository.js';
import { createPricingService } from '../../src/services/pricing/pricing.service.js';
import { inspectBookingReadStorage, provisionBookingReadStorage } from '../../src/services/booking-read-storage.service.js';
import { catalogCanonical } from '../../src/services/reference-catalog-migration.service.js';

let replica;
const connections = [];
const envBase = {
  NODE_ENV: 'test', AUTH_ENABLED: 'true', AI_ENABLED: 'true',
  SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
};
async function open(name) {
  const env = { ...envBase, MONGO_URI: replica.getUri(), MONGO_DB: name };
  const config = loadConfig(env);
  const connection = await connectDatabase(config);
  connection.getClient().monitorCommands = true;
  connections.push(connection);
  return { connection, env, config };
}
beforeAll(async () => { replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 }, instanceOpts: [{ ip: '127.0.0.1' }] }); });
afterAll(async () => { await Promise.all(connections.map(connection => connection.close())); await replica?.stop(); });

test('whole app target registry and deployment provisioning never register/create legacy catalog', async () => {
  const { connection, env, config } = await open('catalog_owned_app');
  Object.assign(env, { EMPLOYEE_SCHEDULING_ENABLED: 'true', FINANCE_SOURCES_ENABLED: 'true', BOOKING_CHECKOUT_ENABLED: 'true', PRODUCT_SALES_ENABLED: 'true' });
  const app = createApp({ connection, config, env, lifecycle: { draining: false }, referenceCatalog: 'target' });
  const models = platformDataModels(connection);
  expect(createPricingRepository(connection).models.PetTrait).toBe(models.PetTrait);
  expect(createAiRepository(connection).models.PetBreed).toBe(models.PetBreed);
  expect(models.PetBreed.collection.name).toBe('reference_catalog');
  await connection.db.createCollection('bookings');
  const booking = await inspectBookingReadStorage(connection);
  await provisionBookingReadStorage({ connection, apply: true, expectedDigest: booking.digest });
  await provisionDeploymentStorage({ connection, env });
  await assertRuntimeStorageProfile(connection, 'EMPLOYEE');
  await request(app).get('/api/v1/pet-care/catalog').expect(401);
  const forbidden = ['aibreeds', 'aitraits'];
  expect(Object.values(connection.models).filter(model => forbidden.includes(model.collection.name))).toHaveLength(0);
  expect((await connection.db.listCollections().toArray()).filter(row => forbidden.includes(row.name))).toHaveLength(0);
  expect(await connection.db.collection('reference_catalog').listIndexes().toArray()).toHaveLength(3);
  const commands = [], listener = event => commands.push(event.commandName);
  connection.getClient().on('commandStarted', listener);
  createApp({ connection, config, env, lifecycle: { draining: false } });
  connection.getClient().off('commandStarted', listener);
  expect(commands.filter(name => ['create', 'createIndexes', 'insert', 'update', 'delete'].includes(name))).toEqual([]);
  expect(() => petCareModels(connection, { referenceCatalog: 'legacy' })).toThrow('REFERENCE_CATALOG_SOURCE_LOCKED');
  // Even manually leaked models are refused before the provision loop.
  connection.model('SyntheticLegacyLeak', new mongoose.Schema({}), 'aitraits');
  await expect(provisionDeploymentStorage({ connection, env: {} })).rejects.toThrow('REFERENCE_CATALOG_LEGACY_REGISTRY');
  expect((await connection.db.listCollections({ name: 'aitraits' }).toArray())).toHaveLength(0);
});

test('real seed CLI target and demo provision replay never create legacy catalog', async () => {
  const { connection, env } = await open('catalog_owned_seed');
  selectReferenceCatalogSource(connection, 'target');
  for (let i = 0; i < 2; i += 1) {
    const result = await promisify(execFile)(process.execPath,
      ['scripts/seeds/sitter-matching.js', '--apply', '--reference-catalog=target'],
      { cwd: process.cwd(), env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 });
    expect(JSON.parse(result.stdout).breedCount).toBe(24);
  }
  const first = await provisionDemoCatalog({ connection });
  const second = await provisionDemoCatalog({ connection });
  expect(first.state).toBe('APPLIED');
  expect(second.state).toBe('ALREADY_APPLIED');
  expect(await petCareModels(connection).PetBreed.countDocuments()).toBe(24);
  const names = (await connection.db.listCollections().toArray()).map(row => row.name);
  expect(names).not.toContain('aibreeds'); expect(names).not.toContain('aitraits');
  expect(await connection.db.collection('reference_catalog').listIndexes().toArray()).toHaveLength(3);
});

test('legacy and target HTTP shadow preserve DTO/auth/status/error/eligibility and pricing labels', async () => {
  const outcomes = [];
  for (const source of ['legacy', 'target']) {
    const { connection, config, env } = await open('catalog_owned_shadow_' + source);
    const app = createApp({ connection, config, env, referenceCatalog: source, lifecycle: { draining: false }, clock: () => 1800000000000 });
    await provisionDeploymentStorage({ connection, env: {} });
    const models = petCareModels(connection);
    await models.PetBreed.create({ code: 'fixture-breed', name: 'Fixture', species: 'DOG', source: 'synthetic', active: true });
    await models.PetTrait.create({ code: 'fixture-trait', label: 'Fixture label', species: ['DOG'], explanation: 'Synthetic', active: true });
    const user = await userModel(connection).create({ _id: new mongoose.Types.ObjectId('000000000000000000000001'), displayName: 'Synthetic', roles: ['CUSTOMER'], state: 'ACTIVE' });
    const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret, clock: () => 1800000000000 });
    const session = await connection.transaction(transaction => sessions.issueInTransaction(user, transaction));
    const headers = { Host: '127.0.0.1', Origin: 'http://127.0.0.1', Cookie: 'pwc_session=' + session.token, 'X-CSRF-Token': session.csrfToken };
    const error = response => ({ status: response.status, code: response.body.error?.code, message: response.body.error?.message });
    const guest = error(await request(app).get('/api/v1/pet-care/catalog'));
    const staffUser = await userModel(connection).create({ displayName: 'Synthetic staff', roles: ['STAFF'], state: 'ACTIVE' });
    const staffSession = await connection.transaction(transaction => sessions.issueInTransaction(staffUser, transaction));
    const forbidden = error(await request(app).get('/api/v1/pet-care/pets').set({ Cookie: 'pwc_session=' + staffSession.token }));
    expect(forbidden.status).toBe(403);
    const catalog = (await request(app).get('/api/v1/pet-care/catalog').set(headers).expect(200)).body.data;
    const body = { name: 'Fixture', species: 'DOG', breedCode: 'fixture-breed', weightKg: 4, traits: ['fixture-trait'], careNeedsConfirmed: true };
    const deniedCsrf = error(await request(app).post('/api/v1/pet-care/pets').set({ Cookie: headers.Cookie }).send(body));
    const wrongSpecies = error(await request(app).post('/api/v1/pet-care/pets').set({ ...headers, 'Idempotency-Key': 'synthetic-species-001' }).send({ ...body, species: 'CAT' }));
    const unknownTrait = error(await request(app).post('/api/v1/pet-care/pets').set({ ...headers, 'Idempotency-Key': 'synthetic-unknown-001' }).send({ ...body, traits: ['unknown'] }));
    const created = await request(app).post('/api/v1/pet-care/pets').set({ ...headers, 'Idempotency-Key': 'synthetic-create-001' }).send(body).expect(201);
    const replay = await request(app).post('/api/v1/pet-care/pets').set({ ...headers, 'Idempotency-Key': 'synthetic-create-001' }).send(body).expect(201);
    expect(replay.body.data).toEqual(created.body.data);
    const mismatch = error(await request(app).post('/api/v1/pet-care/pets').set({ ...headers, 'Idempotency-Key': 'synthetic-create-001' }).send({ ...body, name: 'Changed' }));
    const pricing = createPricingService({ repository: {
      models, context: async () => ({ pets: [{ ...body, _id: user._id }], policy: { rules: [] } })
    } });
    let pricingError;
    try { await pricing.quote(String(user._id), { serviceId: String(user._id), petIds: [String(user._id)], durationMinutes: 60 }); }
    catch (caught) { pricingError = { code: caught.code, details: caught.details }; }
    expect(pricingError?.code).toBe('PRICING_REVIEW_REQUIRED');
    expect(JSON.stringify(pricingError)).toContain('Fixture label');
    const quote = await createPricingService({ repository: {
      models: platformDataModels(connection),
      context: async () => ({
        pets: [{ ...body, traits: [], _id: user._id, version: 0 }],
        price: { amountVnd: 100000, version: 1 }, version: { version: 1 },
        policy: { version: 1, unitMinutes: 60, billingMode: 'PER_VISIT', rules: [],
          maxPets: 4, groupStrategy: 'REJECT', orderStepVnd: 5000000, orderStepBps: 200, maxOrderTierBps: 2000, extraPetBps: 0, maxSurchargeBps: 20000 }
      })
    }, clock: () => 1800000000000 }).quote(String(user._id), { serviceId: String(user._id), petIds: [String(user._id)], durationMinutes: 60 });
    expect(Number.isSafeInteger(quote.totalVnd)).toBe(true);
    expect(quote.totalVnd).toBe(100000);
    const { quoteId, ...quoteDto } = quote;
    expect(quoteId).toBeTruthy();
    outcomes.push({ guest, forbidden, catalog, deniedCsrf, wrongSpecies, unknownTrait, mismatch, pricingError, quoteDto, petShape: { ...body, version: created.body.data.version } });
    expect(JSON.stringify(catalog)).not.toContain('"kind"');
  }
  expect(outcomes[1]).toEqual(outcomes[0]);
});

test('startRuntime explicit target uses provisioned target and stops only owned server', async () => {
  const { connection, config, env } = await open('catalog_owned_runtime');
  createApp({ connection, config, env, referenceCatalog: 'target', lifecycle: { draining: false } });
  await provisionDeploymentStorage({ connection, env: {} });
  const runtime = await startRuntime({ env: { ...env, PORT: '0' }, referenceCatalog: 'target' });
  try {
    expect(petCareModels(runtime.connection).PetBreed.collection.name).toBe('reference_catalog');
    await request(runtime.server).get('/api/v1/pet-care/catalog').expect(401);
    expect((await runtime.connection.db.listCollections({ name: 'aibreeds' }).toArray())).toHaveLength(0);
  } finally { await runtime.stop(); }
});

test('migration CLI uses loadConfig MONGO_URI/MONGO_DB for dry-run, copy and reverse', async () => {
  const { connection, env } = await open('catalog_owned_cli');
  await connection.db.collection('aibreeds').insertOne({ _id: new mongoose.Types.ObjectId(), code: 'fixture', name: 'Fixture', species: 'DOG', source: 'synthetic', createdAt: new Date(0) });
  const directory = await mkdtemp(path.join(tmpdir(), 'pwc-owned-catalog-'));
  const checkpointPath = path.join(directory, 'checkpoint.json');
  const run = async args => {
    const result = await promisify(execFile)(process.execPath,
      ['scripts/migrations/reference-catalog.js', ...args],
      { cwd: process.cwd(), env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout);
  };
  try {
    const dry = await run(['--writers-frozen', '--write-checkpoint=' + checkpointPath]);
    expect(dry).toMatchObject({ mode: 'DRY_RUN', blocked: false, missing: 1 });
    expect(await connection.db.listCollections({ name: 'reference_catalog' }).hasNext()).toBe(false);
    expect((await run(['--apply', '--writers-frozen', '--expected-digest=' + dry.sourceDigest])).inserted).toBe(1);
    await connection.db.collection('reference_catalog').updateOne({}, { $set: { name: 'Changed target', updatedAt: new Date(123) }, $unset: { createdAt: '' } });
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
    const reverseArgs = ['--reverse', '--checkpoint=' + checkpointPath, '--expected-checkpoint-digest=' + checkpoint.digest];
    const reverseDry = await run(reverseArgs);
    expect(reverseDry).toMatchObject({ blocked: false, replacements: 1 });
    const reverse = await run([...reverseArgs, '--apply', '--writers-frozen', '--expected-digest=' + reverseDry.sourceDigest]);
    expect(reverse).toMatchObject({ replacements: 1, inserts: 0, verified: true });
    const { kind, ...target } = await connection.db.collection('reference_catalog').findOne();
    expect(kind).toBe('BREED');
    expect(catalogCanonical(await connection.db.collection('aibreeds').findOne())).toBe(catalogCanonical(target));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
