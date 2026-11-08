import { beforeAll, afterAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { legacyCompensationCollections, assertRuntimeStorageProfile } from '../../src/config/storage-profile.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { provisionBookingReadStorage, inspectBookingReadStorage } from '../../src/services/booking-read-storage.service.js';
import { settlementRequestRuntimeModule } from '../../src/routes/settlement-runtime.js';
import { adminSettlementRuntimeModule } from '../../src/routes/admin-settlement-runtime.js';
import { dashboardReadRuntimeModule } from '../../src/routes/dashboard-runtime.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';

let replica;
const connections = [];
const secret = 'synthetic-compensation-profile-secret-32';
const envFor = profile => ({ NODE_ENV: 'test', AUTH_ENABLED: 'true', MONGO_URI: replica.getUri(), MONGO_DB: 'synthetic_profile',
  OTP_HMAC_SECRET: secret, SESSION_TOKEN_SECRET: secret, SESSION_CSRF_SECRET: secret, CONTACT_LOOKUP_SECRET: secret,
  CONTACT_ENCRYPTION_KEY: '12345678901234567890123456789012', FINANCE_SOURCES_ENABLED: 'true', EMPLOYEE_SCHEDULING_ENABLED: 'true', COMPENSATION_PROFILE: profile });
beforeAll(async () => { replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } }); }, 600000);
afterAll(async () => { await Promise.all(connections.map(c => c.close())); await replica?.stop(); }, 30000);
async function connect(name) {
  const c = await mongoose.createConnection(replica.getUri(), { dbName: name, autoIndex: false, autoCreate: false, monitorCommands: true }).asPromise();
  connections.push(c); return c;
}

test.each(['EMPLOYEE', 'LEGACY_PARTNER'])('whole app provisions exactly its compensation profile: %s', async profile => {
  const connection = await connect('whole_' + profile), env = envFor(profile), commands = [];
  const listener = e => commands.push(e.commandName);
  connection.getClient().on('commandStarted', listener);
  const app = createApp({ config: loadConfig(env), connection, env, lifecycle: { draining: false } });
  expect(app.locals.compensationProfile).toBe(profile);
  expect(commands.filter(name => ['create', 'createIndexes', 'insert', 'update', 'delete'].includes(name))).toEqual([]);
  connection.getClient().off('commandStarted', listener);
  const registered = Object.values(connection.models).map(m => m.collection.name).filter(name => legacyCompensationCollections.includes(name));
  expect(registered).toHaveLength(profile === 'EMPLOYEE' ? 0 : 16);
  expect(Boolean(connection.models.EarningAccrualTask)).toBe(profile === 'LEGACY_PARTNER');
  await expect(assertRuntimeStorageProfile(connection, profile)).rejects.toMatchObject({ code: 'STORAGE_PROFILE_NOT_READY' });
  // The owner cursor index is explicitly approved/provisioned separately from deployment.
  await connection.db.createCollection('bookings');
  const booking = await inspectBookingReadStorage(connection);
  await provisionBookingReadStorage({ connection, apply: true, expectedDigest: booking.digest });
  await provisionDeploymentStorage({ connection, env });
  await expect(assertRuntimeStorageProfile(connection, profile)).resolves.toBeUndefined();
  const physical = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
  expect(physical.filter(name => legacyCompensationCollections.includes(name))).toHaveLength(profile === 'EMPLOYEE' ? 0 : 16);
  expect(physical.includes('earningaccrualtasks')).toBe(profile === 'LEGACY_PARTNER');
  for (const name of ['cases', 'refunds', 'visits']) {
    const indexes = await connection.collection(name).listIndexes().toArray();
    expect(indexes.find(index => index.name === 'booking_source_lookup')).toMatchObject({ key: { bookingId: 1 } });
  }
});

test('employee retired endpoints preserve authentication/role/CSRF before 410 and query no legacy store', async () => {
  const connection = await connect('retired_routes'), env = envFor('EMPLOYEE');
  const sessionService = { authenticate: async req => req.get('x-role') ? {
    userId: '507f1f77bcf86cd799439011', roles: [req.get('x-role')], state: 'ACTIVE', expiresAt: Date.now() + 60000
  } : null, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const options = { config: loadConfig(env), connection, env, sessionService };
  const app = express(); app.use(express.json(), requestId);
  for (const factory of [settlementRequestRuntimeModule, adminSettlementRuntimeModule, dashboardReadRuntimeModule]) {
    const module = factory(options); app.use(module.mount, module.router);
  }
  app.use(errorHandler(() => {}));
  const commands = [], listener = e => commands.push(e.commandName);
  connection.getClient().on('commandStarted', listener);
  await request(app).get('/api/v1/settlement-requests').expect(401);
  await request(app).get('/api/v1/settlement-requests').set('x-role', 'CUSTOMER').expect(403);
  await request(app).get('/api/v1/settlement-requests').set('x-role', 'PET_SITTER').expect(410);
  await request(app).post('/api/v1/settlement-requests').set('x-role', 'PET_SITTER').send({ earningIds: [] }).expect(403);
  await request(app).post('/api/v1/settlement-requests').set('x-role', 'PET_SITTER').set('x-csrf-token', 'synthetic-csrf')
    .set('Host', 'localhost').set('Origin', 'http://localhost').send({ earningIds: [] }).expect(410);
  await request(app).get('/api/v1/admin/settlements').set('x-role', 'ADMIN').expect(410);
  await request(app).get('/api/v1/me/earnings').set('x-role', 'PET_SITTER').expect(410);
  await request(app).get('/api/v1/payroll').set('x-role', 'ADMIN').expect(410);
  connection.getClient().off('commandStarted', listener);
  expect(commands.filter(name => ['find', 'aggregate', 'insert', 'update', 'delete', 'create', 'createIndexes'].includes(name))).toEqual([]);
});

test('employee provisioner refuses leaked legacy registrations and explicit legacy provision requires partner profile', async () => {
  const connection = await connect('profile_leak');
  await expect(provisionSettlementStorage(connection, { compensationProfile: 'EMPLOYEE' })).rejects.toThrow('LEGACY_PARTNER');
  expect(Object.keys(connection.models)).toHaveLength(0);
  await provisionSettlementStorage(connection);
  await expect(provisionDeploymentStorage({ connection, env: { COMPENSATION_PROFILE: 'EMPLOYEE' } })).rejects.toThrow('must not register legacy');
});
