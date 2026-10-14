import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { servicePriceModule } from '../../src/routes/service-price.routes.js';

let replica;
let connection;
let app;
let prices;
const serviceId = '507f1f77bcf86cd799439010';
const actors = {
  ADMIN: '507f1f77bcf86cd799439001',
  STAFF: '507f1f77bcf86cd799439002',
  CUSTOMER: '507f1f77bcf86cd799439003'
};
const inMinutes = value => new Date(Date.now() + value * 60_000).toISOString();
const headers = (role, csrf = 'valid-token') => ({
  'x-test-role': role, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': csrf
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'pwc_p17_price_test' }).asPromise();
  const config = loadConfig({
    NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_p17_price_test', AUTH_ENABLED: 'true',
    OTP_HMAC_SECRET: 'p17-price-otp-secret-more-than-32-bytes',
    SESSION_TOKEN_SECRET: 'p17-price-session-token-secret-more-than-32-bytes',
    SESSION_CSRF_SECRET: 'p17-price-session-csrf-secret-more-than-32-bytes',
    CONTACT_LOOKUP_SECRET: 'p17-price-contact-lookup-secret-more-than-32-bytes',
    CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
  });
  const sessionService = {
    authenticate: async req => {
      const role = req.get('x-test-role');
      return actors[role] ? { userId: actors[role], roles: [role], state: 'ACTIVE', expiresAt: Date.now() + 60_000 } : null;
    },
    verifyCsrf: async (_auth, token) => token === 'valid-token'
  };
  const module = servicePriceModule({
    config, connection, sessionService, serviceExists: async id => id === serviceId
  });
  prices = module.prices;
  app = createApp({ config, connection, lifecycle: { draining: false }, moduleFactories: [() => module] });
  await Promise.all([connection.model('ServicePriceVersion').init(), connection.model('ServicePriceAudit').init()]);
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('P17 service price configuration on isolated MongoDB', () => {
  test('price writes require Admin and reject negative, fractional, and unknown input', async () => {
    await request(app).get('/api/v1/service-prices/admin/' + serviceId).expect(401);
    await request(app).get('/api/v1/service-prices/admin/' + serviceId).set(headers('CUSTOMER')).expect(403);
    await request(app).get('/api/v1/service-prices/admin/' + serviceId).set(headers('STAFF')).expect(200)
      .expect(({ body }) => expect(body.data.latestVersion).toBe(0));
    await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('STAFF')).send({}).expect(403);

    const invalid = amountVnd => ({
      expectedVersion: 0, amountVnd, unitLabel: 'mỗi lượt', effectiveAt: inMinutes(1), reason: 'Đã duyệt'
    });
    for (const amount of [-1, 12.5, '50000']) {
      await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN')).send(invalid(amount)).expect(422);
    }
    await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN'))
      .send({ ...invalid(50000), effectiveAt: '2026-02-30T00:00:00Z' }).expect(422);
    await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN'))
      .send({ ...invalid(50000), amountUsd: 1 }).expect(422);
  });

  test('new prices activate at their effective time and preserve the previous version', async () => {
    const firstAt = inMinutes(1);
    const first = await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN'))
      .send({ expectedVersion: 0, amountVnd: 50000, unitLabel: 'mỗi lượt', effectiveAt: firstAt, reason: 'Giá đã duyệt' })
      .expect(201);
    expect(first.body.data).toMatchObject({ version: 1, amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt' });
    expect(await prices.getActivePrice(serviceId, new Date())).toBeNull();
    expect(await prices.getActivePrice(serviceId, new Date(new Date(firstAt).getTime() + 1))).toMatchObject({ amountVnd: 50000 });

    const secondAt = inMinutes(2);
    await request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN'))
      .send({ expectedVersion: 1, amountVnd: 80000, unitLabel: 'mỗi lượt', effectiveAt: secondAt, reason: 'Cập nhật giá' })
      .expect(201);
    expect(await prices.getActivePrice(serviceId, new Date(new Date(firstAt).getTime() + 1)))
      .toMatchObject({ version: 1, amountVnd: 50000 });
    expect(await prices.getActivePrice(serviceId, new Date(new Date(secondAt).getTime() - 1)))
      .toMatchObject({ version: 1, amountVnd: 50000 });
    expect(await prices.getActivePrice(serviceId, new Date(new Date(secondAt).getTime() + 1)))
      .toMatchObject({ version: 2, amountVnd: 80000 });
    expect(await connection.model('ServicePriceAudit').countDocuments({ resourceId: serviceId })).toBe(2);
  });

  test('concurrent writes against one version return one conflict instead of overwriting', async () => {
    const body = amountVnd => ({
      expectedVersion: 2, amountVnd, unitLabel: 'mỗi lượt', effectiveAt: inMinutes(4), reason: 'Cập nhật đồng thời'
    });
    const results = await Promise.all([
      request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN')).send(body(90000)),
      request(app).post('/api/v1/service-prices/admin/' + serviceId).set(headers('ADMIN')).send(body(95000))
    ]);
    expect(results.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await connection.model('ServicePriceVersion').countDocuments({ serviceId, version: 3 })).toBe(1);
    expect(await connection.model('ServicePriceAudit').countDocuments({ resourceId: serviceId, version: 3 })).toBe(1);
  });
});
