import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { serviceCatalogModule } from '../../src/routes/service-catalog.routes.js';

let replica;
let connection;
let app;
let catalog;
let serviceId;
let visible = false;
const actors = {
  ADMIN: '507f1f77bcf86cd799439001',
  STAFF: '507f1f77bcf86cd799439002',
  CUSTOMER: '507f1f77bcf86cd799439003'
};
const priceVersions = new Map();
const at = minutes => new Date(Date.now() + minutes * 60_000).toISOString();

function headers(role, csrf = 'valid-token') {
  return {
    'x-test-role': role, Host: '127.0.0.1', Origin: 'http://127.0.0.1',
    'X-CSRF-Token': csrf
  };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'pwc_p17_service_test' }).asPromise();
  const config = loadConfig({
    NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_p17_service_test', AUTH_ENABLED: 'true',
    OTP_HMAC_SECRET: 'p17-service-otp-secret-more-than-32-bytes',
    SESSION_TOKEN_SECRET: 'p17-service-session-token-secret-more-than-32-bytes',
    SESSION_CSRF_SECRET: 'p17-service-session-csrf-secret-more-than-32-bytes',
    CONTACT_LOOKUP_SECRET: 'p17-service-contact-lookup-secret-more-than-32-bytes',
    CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
  });
  const sessionService = {
    authenticate: async req => {
      const role = req.get('x-test-role');
      if (!actors[role]) return null;
      return { userId: actors[role], roles: [role], state: 'ACTIVE', expiresAt: Date.now() + 60_000 };
    },
    verifyCsrf: async (_auth, token) => token === 'valid-token'
  };
  const priceProvider = {
    getActivePrice: async (id, effectiveAt) => {
      const versions = priceVersions.get(id) ?? [];
      return versions.filter(price => new Date(price.effectiveAt) <= effectiveAt)
        .sort((left, right) => new Date(right.effectiveAt) - new Date(left.effectiveAt))[0] ?? null;
    }
  };
  const module = serviceCatalogModule({
    config, connection, sessionService, priceProvider,
    catalogSettings: { isEnabledAt: async () => visible }
  });
  catalog = module.catalog;
  app = createApp({
    config, connection, lifecycle: { draining: false },
    moduleFactories: [() => module]
  });
  await Promise.all([
    connection.model('Service').init(), connection.model('ServiceVersion').init(),
    connection.model('ServicePolicyVersion').init(), connection.model('ServiceAudit').init()
  ]);
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('P17 service catalog module on isolated MongoDB', () => {
  test('server role gates let Staff read and reserve service and policy changes for Admin', async () => {
    await request(app).get('/api/v1/services/admin').expect(401);
    await request(app).get('/api/v1/services/admin').set(headers('CUSTOMER')).expect(403);
    await request(app).get('/api/v1/services/admin').set(headers('STAFF')).expect(200)
      .expect(({ body }) => expect(body.data).toEqual([]));
    await request(app).post('/api/v1/services/admin').set(headers('STAFF')).send({}).expect(403);
    await request(app).post('/api/v1/services/admin').set(headers('ADMIN', 'wrong-token')).send({}).expect(403);
    await request(app).post('/api/v1/services/admin').set(headers('ADMIN')).send({
      code: 'dog-walk', name: 'Dắt chó đi dạo', description: 'Chăm sóc ngoài trời',
      scope: 'Dắt chó theo lịch đã xác nhận.', species: ['DOG'], state: 'ACTIVE',
      effectiveAt: '2026-02-30T00:00:00Z', reason: 'Tạo dịch vụ đã duyệt'
    }).expect(422);

    const result = await request(app).post('/api/v1/services/admin').set(headers('ADMIN')).send({
      code: 'dog-walk', name: 'Dắt chó đi dạo', description: 'Chăm sóc ngoài trời',
      scope: 'Dắt chó theo lịch đã xác nhận.', species: ['DOG'], state: 'ACTIVE',
      effectiveAt: at(-2), reason: 'Tạo dịch vụ đã duyệt'
    }).expect(201);
    serviceId = result.body.data.id;
    expect(serviceId).toMatch(/^[0-9a-f]{24}$/i);

    await request(app).post('/api/v1/services/admin/' + serviceId + '/policies')
      .set(headers('STAFF')).send({}).expect(403);
    await request(app).post('/api/v1/services/admin/' + serviceId + '/policies')
      .set(headers('ADMIN')).send({
        expectedVersion: 0, state: 'PUBLISHED', title: 'Chính sách đã duyệt',
        body: 'Nội dung được Admin phê duyệt.', effectiveAt: at(-1), reason: 'Xuất bản chính sách'
      }).expect(201);

    const staffList = await request(app).get('/api/v1/services/admin').set(headers('STAFF')).expect(200);
    expect(staffList.body.data[0]).toMatchObject({
      id: serviceId, name: 'Dắt chó đi dạo', latestPolicyVersion: 1,
      policy: { state: 'PUBLISHED', body: 'Nội dung được Admin phê duyệt.' }
    });
  });

  test('public catalog requires visibility, published policy and a current VND price', async () => {
    const hidden = await request(app).get('/api/v1/services').expect(200);
    expect(hidden.body.data).toEqual({ available: false, services: [] });

    visible = true;
    priceVersions.set(serviceId, [{
      version: 1, amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt', effectiveAt: at(-1)
    }]);
    const result = await request(app).get('/api/v1/services').expect(200);
    expect(result.body.data).toMatchObject({
      available: true,
      services: [{
        id: serviceId, price: { amountVnd: 50000, currency: 'VND', unitLabel: 'mỗi lượt' },
        policy: { version: 1, title: 'Chính sách đã duyệt' }
      }]
    });

    const original = await catalog.bookableSnapshot(serviceId);
    await catalog.setPolicy({ serviceId, actor: { userId: actors.ADMIN }, body: {
      expectedVersion: 1, state: 'PUBLISHED', title: 'Chính sách phiên bản hai',
      body: 'Nội dung áp dụng sau thời điểm đã hẹn.', effectiveAt: at(2), reason: 'Cập nhật tương lai'
    } });
    priceVersions.get(serviceId).push({
      version: 2, amountVnd: 80000, currency: 'VND', unitLabel: 'mỗi lượt', effectiveAt: at(2)
    });
    const future = await catalog.bookableSnapshot(serviceId, new Date(at(3)));
    expect(original.price.amountVnd).toBe(50000);
    expect(original.policy.version).toBe(1);
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original.service.species)).toBe(true);
    expect(future.price.amountVnd).toBe(80000);
    expect(future.policy.version).toBe(2);

    visible = false;
    await expect(catalog.bookableSnapshot(serviceId)).rejects.toMatchObject({ status: 409, code: 'SERVICE_UNAVAILABLE' });
  });

  test('concurrent Admin edits with the same expected version do not overwrite silently', async () => {
    const update = name => request(app).put('/api/v1/services/admin/' + serviceId)
      .set(headers('ADMIN')).send({
        expectedVersion: 1, name, description: 'Chăm sóc ngoài trời',
        scope: 'Dắt chó theo lịch đã xác nhận.', species: ['DOG'], state: 'ACTIVE',
        effectiveAt: at(5), reason: 'Cập nhật cạnh tranh'
      });
    const results = await Promise.all([update('Dắt chó lượt một'), update('Dắt chó lượt hai')]);
    expect(results.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await connection.model('ServiceVersion').countDocuments({ serviceId, version: 2 })).toBe(1);
    expect(await connection.model('ServiceAudit').countDocuments({
      resourceId: serviceId, version: 2, action: 'SERVICE_VERSIONED'
    })).toBe(1);
  });
});
