import { createSessionService } from '../../src/services/session.service.js';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { requireCsrf, requireSession } from '../../src/middlewares/session.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { connectDatabase } from '../../src/config/database.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { customerProfileModule } from '../../src/routes/customer-profile.routes.js';

const SECRETS = {
  lookup: 'synthetic-customer-profile-lookup-secret-32-bytes',
  encryption: '0123456789abcdef0123456789abcdef'
};
const sessions = new Map([
  ['customer-a', { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', sessionId: 'session-a', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 3_600_000 }],
  ['customer-b', { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', sessionId: 'session-b', state: 'ACTIVE', roles: ['CUSTOMER'], expiresAt: Date.now() + 3_600_000 }],
  ['staff', { userId: 'cccccccccccccccccccccccc', sessionId: 'session-staff', state: 'ACTIVE', roles: ['STAFF'], expiresAt: Date.now() + 3_600_000 }]
]);
let replica, connection, User, models, contactCrypto, app;

function customerRequest(name = 'customer-a') {
  return {
    'X-Synthetic-User': name,
    Host: '127.0.0.1',
    Origin: 'http://127.0.0.1',
    'X-CSRF-Token': 'synthetic-csrf'
  };
}

async function addVerifiedEmail(userId, value) {
  const canonical = contactCrypto.lookup('EMAIL', value);
  await models.Contact.create({ userId, channel: 'EMAIL',
    canonicalCiphertext: contactCrypto.encrypt(canonical.canonicalValue), lookupKey: canonical.lookupKey,
    state: 'VERIFIED', verifiedAt: new Date('2026-10-14T00:00:00.000Z') });
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' },
    replSet: { count: 1, storageEngine: 'wiredTiger' } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'pwc_customer_profile_test', connectTimeoutMs: 3000 });
  User = userModel(connection);
  models = identityModels(connection);
  await Promise.all(Object.values(models).map(model => model.syncIndexes()));
  contactCrypto = createContactCrypto({ lookupSecret: SECRETS.lookup, encryptionKey: SECRETS.encryption });
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_customer_profile_test' });
  app = createApp({ config, connection, lifecycle: { draining: false },
    portOverrides: { session: {
      authenticate: async req => sessions.get(req.get('X-Synthetic-User')) ?? null,
      verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
    } },
    moduleFactories: [({ ports }) => customerProfileModule({ connection, contactCrypto,
      requireAuthenticated: requireSession(ports.session), requireCsrf: requireCsrf(ports.session) })]
  });
}, 600000);

beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await User.deleteMany({});
  await User.create([
    { _id: sessions.get('customer-a').userId, displayName: 'Linh Customer', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
    { _id: sessions.get('customer-b').userId, displayName: 'Minh Customer', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
    { _id: sessions.get('staff').userId, displayName: 'Staff User', roles: ['STAFF'], state: 'ACTIVE', authEpoch: 0, version: 0 }
  ]);
  await addVerifiedEmail(sessions.get('customer-a').userId, 'linh@example.test');
  await addVerifiedEmail(sessions.get('customer-b').userId, 'minh@example.test');
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('P14 customer profile service against isolated MongoDB', () => {
  test('returns only the authenticated customer projection and masks verified contacts', async () => {
    const response = await request(app).get('/api/v1/me/profile').set(customerRequest()).expect(200);
    expect(response.body.data).toMatchObject({
      id: sessions.get('customer-a').userId,
      displayName: 'Linh Customer',
      version: 0,
      contacts: [{ channel: 'EMAIL', maskedValue: 'l•••@example.test' }]
    });
    expect(JSON.stringify(response.body)).not.toContain('linh@example.test');
    expect(response.body.data).not.toHaveProperty('roles');
    expect(response.body.data).not.toHaveProperty('authEpoch');
  });

  test('requires an active customer session and CSRF for writes', async () => {
    await request(app).get('/api/v1/me/profile').expect(401);
    await request(app).get('/api/v1/me/profile').set(customerRequest('staff')).expect(403);
    await request(app).patch('/api/v1/me/profile')
      .set({ 'X-Synthetic-User': 'customer-a', Host: '127.0.0.1', Origin: 'http://127.0.0.1' })
      .send({ displayName: 'Changed Name', expectedVersion: 0 }).expect(403);
  });

  test('normalizes and updates only the session owner with optimistic versioning', async () => {
    const response = await request(app).patch('/api/v1/me/profile').set(customerRequest())
      .send({ displayName: '  Lê   Văn\tAn  ', expectedVersion: 0 }).expect(200);
    expect(response.body.data).toMatchObject({ displayName: 'Lê Văn An', version: 1 });
    expect(await User.findById(sessions.get('customer-a').userId).select('displayName version').lean())
      .toMatchObject({ displayName: 'Lê Văn An', version: 1 });
    expect(await User.findById(sessions.get('customer-b').userId).select('displayName version').lean())
      .toMatchObject({ displayName: 'Minh Customer', version: 0 });
  });

  test('rejects missing fields, unsupported fields, invalid names and stale versions', async () => {
    await request(app).patch('/api/v1/me/profile').set(customerRequest())
      .send({ displayName: '   ', expectedVersion: 0 }).expect(422);
    await request(app).patch('/api/v1/me/profile').set(customerRequest())
      .send({ displayName: 'Allowed Name', roles: ['ADMIN'], expectedVersion: 0 }).expect(422);
    await request(app).patch('/api/v1/me/profile').set(customerRequest())
      .send({ displayName: 'Allowed Name' }).expect(422);
    await request(app).patch('/api/v1/me/profile').set(customerRequest())
      .send({ displayName: 'New Name', expectedVersion: 1 }).expect(409);
    expect(await User.findById(sessions.get('customer-a').userId).select('displayName roles version').lean())
      .toMatchObject({ displayName: 'Linh Customer', roles: ['CUSTOMER'], version: 0 });
  });

  test('serializes concurrent edits and exposes a version conflict instead of overwriting', async () => {
    const results = await Promise.all([
      request(app).patch('/api/v1/me/profile').set(customerRequest()).send({ displayName: 'First Name', expectedVersion: 0 }),
      request(app).patch('/api/v1/me/profile').set(customerRequest()).send({ displayName: 'Second Name', expectedVersion: 0 })
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(await User.findById(sessions.get('customer-a').userId).select('version').lean()).toMatchObject({ version: 1 });
  });

  test('fails closed on unreadable contact ciphertext without returning stored values', async () => {
    await models.Contact.updateOne({ userId: sessions.get('customer-a').userId }, { $set: { canonicalCiphertext: 'invalid' } });
    const response = await request(app).get('/api/v1/me/profile').set(customerRequest()).expect(503);
    expect(response.body.error.code).toBe('PROFILE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('invalid');
  });
});


test('actual runtime uses signed session cookie, ownership and CSRF without injected module or synthetic headers', async () => {
  const tokenSecret = 'synthetic-profile-runtime-token-secret-32';
  const csrfSecret = 'synthetic-profile-runtime-csrf-secret-32';
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_customer_profile_test',
    AUTH_ENABLED: 'true', SESSION_TOKEN_SECRET: tokenSecret, SESSION_CSRF_SECRET: csrfSecret,
    OTP_HMAC_SECRET: 'synthetic-profile-runtime-otp-secret-32', CONTACT_LOOKUP_SECRET: SECRETS.lookup,
    CONTACT_ENCRYPTION_KEY: SECRETS.encryption });
  const runtime = createApp({ config, connection, lifecycle: { draining: false }, env: {} });
  const sessionService = createSessionService({ connection, tokenSecret, csrfSecret });
  async function issue(userId) {
    const user = await User.findById(userId);
    let issued;
    await connection.transaction(async session => { issued = await sessionService.issueInTransaction(user, session); });
    return issued;
  }
  const customer = await issue(sessions.get('customer-a').userId);
  const cookie = `pwc_session=${customer.token}`;
  await request(runtime).get('/api/v1/me/profile').set(customerRequest()).expect(401);
  const view = await request(runtime).get('/api/v1/me/profile').set('Cookie', cookie).expect(200);
  expect(view.body.data.id).toBe(sessions.get('customer-a').userId);
  expect(view.headers['cache-control']).toBe('private, no-store');
  expect(JSON.stringify(view.body)).not.toContain('linh@example.test');
  await request(runtime).patch('/api/v1/me/profile').set('Cookie', cookie)
    .send({ displayName: 'Runtime Name', expectedVersion: 0 }).expect(403);
  const save = input => request(runtime).patch('/api/v1/me/profile').set('Cookie', cookie)
    .set('X-CSRF-Token', customer.csrfToken).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1').send(input);
  await save({ displayName: 'Runtime Name', expectedVersion: 0, userId: sessions.get('customer-b').userId }).expect(422);
  await save({ displayName: 'Runtime Name', expectedVersion: 0 }).expect(200);
  await save({ displayName: 'Stale Update', expectedVersion: 0 }).expect(409);
  expect((await User.findById(sessions.get('customer-b').userId)).displayName).toBe('Minh Customer');
  const staff = await issue(sessions.get('staff').userId);
  await request(runtime).get('/api/v1/me/profile').set('Cookie', `pwc_session=${staff.token}`).expect(403);
  await User.updateOne({ _id: sessions.get('customer-a').userId }, { $set: { state: 'LOCKED' }, $inc: { authEpoch: 1 } });
  await request(runtime).get('/api/v1/me/profile').set('Cookie', cookie).expect(401);
});
