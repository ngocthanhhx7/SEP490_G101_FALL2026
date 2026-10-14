import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { systemSettingsModule } from '../../src/routes/system-settings.routes.js';

let replica;
let connection;
let app;
let settings;
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
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'pwc_p17_settings_test' }).asPromise();
  const config = loadConfig({
    NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_p17_settings_test', AUTH_ENABLED: 'true',
    OTP_HMAC_SECRET: 'p17-settings-otp-secret-more-than-32-bytes',
    SESSION_TOKEN_SECRET: 'p17-settings-session-token-secret-more-than-32-bytes',
    SESSION_CSRF_SECRET: 'p17-settings-session-csrf-secret-more-than-32-bytes',
    CONTACT_LOOKUP_SECRET: 'p17-settings-contact-lookup-secret-more-than-32-bytes',
    CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
  });
  const sessionService = {
    authenticate: async req => {
      const role = req.get('x-test-role');
      return actors[role] ? { userId: actors[role], roles: [role], state: 'ACTIVE', expiresAt: Date.now() + 60_000 } : null;
    },
    verifyCsrf: async (_auth, token) => token === 'valid-token'
  };
  const module = systemSettingsModule({ config, connection, sessionService });
  settings = module.settings;
  app = createApp({ config, connection, lifecycle: { draining: false }, moduleFactories: [() => module] });
  await Promise.all([connection.model('SystemSettingVersion').init(), connection.model('SystemSettingAudit').init()]);
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('P17 system settings on isolated MongoDB', () => {
  test('catalog visibility is fail-closed by default and read-only for Staff', async () => {
    await request(app).get('/api/v1/system-settings/service-catalog').expect(401);
    await request(app).get('/api/v1/system-settings/service-catalog').set(headers('CUSTOMER')).expect(403);
    const staffView = await request(app).get('/api/v1/system-settings/service-catalog').set(headers('STAFF')).expect(200);
    expect(staffView.body.data).toMatchObject({
      currency: { code: 'VND', unitVnd: 1, input: 'NON_NEGATIVE_INTEGER', rounding: 'REJECT_FRACTIONAL_NO_ROUNDING' },
      catalogVisibility: { version: 0, enabled: false }, latestVersion: 0, history: []
    });
    await request(app).post('/api/v1/system-settings/service-catalog/visibility')
      .set(headers('STAFF')).send({}).expect(403);
    await request(app).post('/api/v1/system-settings/service-catalog/visibility')
      .set(headers('ADMIN', 'wrong-token')).send({}).expect(403);
  });

  test('Admin changes apply only at their effective time and retain actor audit history', async () => {
    const enableAt = inMinutes(1);
    await request(app).post('/api/v1/system-settings/service-catalog/visibility').set(headers('ADMIN')).send({
      expectedVersion: 0, enabled: true, effectiveAt: enableAt, reason: 'Bật danh mục đã duyệt'
    }).expect(201);
    expect(await settings.isEnabledAt(new Date())).toBe(false);
    expect(await settings.isEnabledAt(new Date(new Date(enableAt).getTime() + 1))).toBe(true);

    const disableAt = inMinutes(2);
    await request(app).post('/api/v1/system-settings/service-catalog/visibility').set(headers('ADMIN')).send({
      expectedVersion: 1, enabled: false, effectiveAt: disableAt, reason: 'Tạm dừng danh mục'
    }).expect(201);
    expect(await settings.isEnabledAt(new Date(new Date(disableAt).getTime() - 1))).toBe(true);
    expect(await settings.isEnabledAt(new Date(new Date(disableAt).getTime() + 1))).toBe(false);
    expect(await connection.model('SystemSettingAudit').countDocuments({ actorId: actors.ADMIN })).toBe(2);
  });

  test('same-version concurrent setting changes produce a conflict and one audit entry', async () => {
    const submit = enabled => request(app).post('/api/v1/system-settings/service-catalog/visibility')
      .set(headers('ADMIN')).send({
        expectedVersion: 2, enabled, effectiveAt: inMinutes(4), reason: 'Cập nhật đồng thời'
      });
    const results = await Promise.all([submit(true), submit(false)]);
    expect(results.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await connection.model('SystemSettingVersion').countDocuments({ key: 'SERVICE_CATALOG_VISIBLE', version: 3 })).toBe(1);
    expect(await connection.model('SystemSettingAudit').countDocuments({ version: 3 })).toBe(1);
  });
});
