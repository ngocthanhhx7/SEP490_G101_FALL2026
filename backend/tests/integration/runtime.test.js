import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server-core';
import request from 'supertest';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import { startRuntime } from '../../src/runtime.js';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { seedDevelopmentAdmin } from '../../src/services/admin-seed.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { userAdminAuditModel } from '../../src/models/user-admin-audit.model.js';

let replica, runtime;
const envFor = uri => ({ NODE_ENV: 'test', PORT: '0', MONGO_URI: uri, MONGO_DB: 'pwc_foundation_test', MONGO_CONNECT_TIMEOUT_MS: '3000' });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  runtime = await startRuntime({ env: envFor(replica.getUri()) });
}, 600000);
afterAll(async () => { await runtime?.stop(); await replica?.stop(); }, 30000);

describe('real isolated MongoDB 8.0.34 replica-set smoke', () => {
  test('listens on a real socket and reports healthy/ready with Mongo ping', async () => {
    expect(runtime.server.address().port).toBeGreaterThan(0);
    const build = await runtime.connection.db.admin().command({ buildInfo: 1 });
    expect(build.version).toBe('8.0.34');
    await request(runtime.server).get('/health').expect(200);
    await request(runtime.server).get('/ready').expect(200);
    await request(runtime.server).get('/api/v1/me').expect(404);
    await request(runtime.server).get('/api/v1/users').expect(404);
  });
  test('unit-of-work rolls back database writes on error and commits success', async () => {
    const collection = runtime.connection.db.collection('synthetic_operations');
    await collection.insertOne({ key: 'initial' });
    const uow = createUnitOfWork(runtime.connection);
    await expect(uow.run(async session => {
      await collection.insertOne({ key: 'rolled-back' }, { session });
      throw new Error('synthetic rollback');
    })).rejects.toThrow('synthetic rollback');
    expect(await collection.countDocuments({ key: 'rolled-back' })).toBe(0);
    await uow.run(session => collection.insertOne({ key: 'committed' }, { session }));
    expect(await collection.countDocuments({ key: 'committed' })).toBe(1);
  });
  test('seed is repeatable, locked and credential-free; test/production opt-in denied', async () => {
    const dev = { ...runtime.config, nodeEnv: 'development', database: 'pwc_foundation_dev', allowDevAdminSeed: true };
    const connection = await connectDatabase(dev);
    try {
      const first = await seedDevelopmentAdmin(connection, dev);
      const second = await seedDevelopmentAdmin(connection, dev);
      expect(first.id).toBe(second.id);
      const concurrent = await Promise.all([seedDevelopmentAdmin(connection, dev), seedDevelopmentAdmin(connection, dev)]);
      expect(concurrent.every(user => user.id === first.id)).toBe(true);
      expect(first.state).toBe('LOCKED'); expect(first.synthetic).toBe(true);
      const records = await connection.collection('users').find({ fixtureKey: 'pwc-synthetic-admin-v1' }).toArray();
      expect(records).toHaveLength(1);
      expect(records[0]).not.toHaveProperty('password');
      expect(records[0]).not.toHaveProperty('otp');
      expect(records[0]).not.toHaveProperty('contact');
      await expect(seedDevelopmentAdmin(connection, { ...dev, nodeEnv: 'production' })).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await expect(seedDevelopmentAdmin(connection, { ...dev, allowDevAdminSeed: false })).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await expect(seedDevelopmentAdmin(connection, runtime.config)).rejects.toMatchObject({ code: 'SEED_FORBIDDEN' });
      await connection.collection('users').updateOne({ _id: first._id }, { $set: { state: 'ACTIVE' } });
      await expect(seedDevelopmentAdmin(connection, dev)).rejects.toMatchObject({ code: 'SEED_FIXTURE_CONFLICT' });
    } finally { await connection.close(); }
  });
  test('P34 auth module wires OTP delivery, cookie session, GET /me and CSRF-protected logout', async () => {
    let delivered;
    const secrets = {
      OTP_HMAC_SECRET: 'o'.repeat(32),
      SESSION_TOKEN_SECRET: 't'.repeat(32),
      SESSION_CSRF_SECRET: 'c'.repeat(32),
      CONTACT_LOOKUP_SECRET: 'l'.repeat(32),
      CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
    };
    const authRuntime = await startRuntime({
      env: { ...envFor(replica.getUri()), MONGO_DB: 'pwc_auth_route_test', AUTH_ENABLED: 'true', ...secrets },
      portOverrides: { contactDelivery: { send: async command => {
        delivered = command;
        return { status: 'ACCEPTED', code: 'SYNTHETIC_ACCEPTED' };
      } } }
    });
    try {
      const contact = 'p34-customer@example.test';
      const contactCrypto = createContactCrypto({
        lookupSecret: secrets.CONTACT_LOOKUP_SECRET,
        encryptionKey: secrets.CONTACT_ENCRYPTION_KEY
      });
      const User = userModel(authRuntime.connection);
      const models = identityModels(authRuntime.connection);
      const user = await User.create({
        displayName: 'Synthetic P34 Customer', roles: ['CUSTOMER'], state: 'ACTIVE',
        authEpoch: 0, version: 0, synthetic: false
      });
      const lookup = contactCrypto.lookup('EMAIL', contact);
      await models.Contact.create({
        userId: user._id, channel: 'EMAIL', canonicalCiphertext: contactCrypto.encrypt(lookup.canonicalValue),
        lookupKey: lookup.lookupKey, state: 'VERIFIED', verifiedAt: new Date()
      });

      await request(authRuntime.server).get('/api/v1/me').expect(401);
      const challengeResponse = await request(authRuntime.server).post('/api/v1/otp-challenges')
        .send({ channel: 'EMAIL', contact, purpose: 'LOGIN' }).expect(202);
      expect(delivered).toMatchObject({ channel: 'EMAIL', kind: 'OTP', to: contact });
      expect(challengeResponse.body.data.challengeId).toBeTruthy();
      expect(JSON.stringify(challengeResponse.body)).not.toContain(contact);

      const login = await request(authRuntime.server).post('/api/v1/sessions').send({
        challengeId: challengeResponse.body.data.challengeId, channel: 'EMAIL',
        contact, purpose: 'LOGIN', code: delivered.code
      }).expect(200);
      const cookie = login.headers['set-cookie'][0].split(';', 1)[0];
      const csrfToken = login.body.data.csrfToken;
      expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
      expect(login.body.data.user).toEqual({
        id: user._id.toString(), displayName: 'Synthetic P34 Customer', roles: ['CUSTOMER']
      });

      await request(authRuntime.server).get('/api/v1/me').set('Cookie', cookie).expect(200)
        .expect(({ body }) => {
          expect(body.data.user).toEqual({
            id: user._id.toString(), displayName: 'Synthetic P34 Customer', roles: ['CUSTOMER']
          });
          expect(body.data.contacts).toEqual([expect.objectContaining({
            channel: 'EMAIL', value: 'p********@example.test', state: 'VERIFIED'
          })]);
          expect(JSON.stringify(body)).not.toContain(contact);
        });
      await request(authRuntime.server).delete('/api/v1/sessions/current')
        .set({ Cookie: cookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': 'invalid' })
        .expect(403);
      await request(authRuntime.server).delete('/api/v1/sessions/current')
        .set({ Cookie: cookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': csrfToken })
        .expect(204);
      await request(authRuntime.server).get('/api/v1/me').set('Cookie', cookie).expect(401);

      const registrationContact = 'runtime-registration@example.test';
      const registrationChallenge = await request(authRuntime.server).post('/api/v1/otp-challenges')
        .send({ channel: 'EMAIL', contact: registrationContact, purpose: 'REGISTER' }).expect(202);
      expect(delivered).toMatchObject({ channel: 'EMAIL', purpose: 'REGISTER', to: registrationContact });
      const registration = await request(authRuntime.server).post('/api/v1/otp-verifications')
        .send({ challengeId: registrationChallenge.body.data.challengeId, channel: 'EMAIL',
          contact: registrationContact, purpose: 'REGISTER', code: delivered.code,
          displayName: 'Runtime Registration Customer' }).expect(200);
      expect(registration.body.data).toMatchObject({
        verified: true,
        authenticated: true,
        user: { displayName: 'Runtime Registration Customer', roles: ['CUSTOMER'] }
      });
      const registrationCookie = registration.headers['set-cookie'][0].split(';', 1)[0];
      await request(authRuntime.server).get('/api/v1/me').set('Cookie', registrationCookie).expect(200)
        .expect(({ body }) => expect(body.data.user).toEqual(registration.body.data.user));
    } finally {
      await authRuntime.stop();
    }
  }, 30000);
  test('P10 limits account administration to Admin, masks contacts, paginates and audits atomic lock decisions', async () => {
    let delivered;
    const secrets = {
      OTP_HMAC_SECRET: 'p10-otp-secret-with-more-than-32-bytes',
      SESSION_TOKEN_SECRET: 'p10-session-token-secret-with-more-than-32-bytes',
      SESSION_CSRF_SECRET: 'p10-session-csrf-secret-with-more-than-32-bytes',
      CONTACT_LOOKUP_SECRET: 'p10-contact-lookup-secret-over-32-bytes',
      CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
    };
    const adminRuntime = await startRuntime({
      env: { ...envFor(replica.getUri()), MONGO_DB: 'pwc_user_admin_test', AUTH_ENABLED: 'true', ...secrets },
      portOverrides: { contactDelivery: { send: async command => {
        delivered = command;
        return { status: 'ACCEPTED', code: '004201' };
      } } }
    });
    try {
      const User = userModel(adminRuntime.connection);
      const models = identityModels(adminRuntime.connection);
      const Audit = userAdminAuditModel(adminRuntime.connection);
      const contactCrypto = createContactCrypto({ lookupSecret: secrets.CONTACT_LOOKUP_SECRET,
        encryptionKey: secrets.CONTACT_ENCRYPTION_KEY });
      async function account(displayName, role, email, state = 'ACTIVE') {
        const user = await User.create({ displayName, roles: [role], state, authEpoch: 0, version: 0, synthetic: false });
        const lookup = contactCrypto.lookup('EMAIL', email);
        await models.Contact.create({ userId: user._id, channel: 'EMAIL',
          canonicalCiphertext: contactCrypto.encrypt(lookup.canonicalValue), lookupKey: lookup.lookupKey,
          state: 'VERIFIED', verifiedAt: new Date() });
        return { user, email };
      }
      const admin = await account('P10 Admin', 'ADMIN', 'admin.p10@example.test');
      const staff = await account('P10 Staff', 'STAFF', 'staff.p10@example.test');
      const customer = await account('P10 Customer', 'CUSTOMER', 'customer.p10@example.test');
      const secondCustomer = await account('P10 Second Customer', 'CUSTOMER', 'second.p10@example.test');
      const locked = await account('P10 Locked User', 'CUSTOMER', 'locked.p10@example.test', 'LOCKED');
      const phoneLookup = contactCrypto.lookup('PHONE', '+84912345678');
      await models.Contact.create({ userId: secondCustomer.user._id, channel: 'PHONE',
        canonicalCiphertext: contactCrypto.encrypt(phoneLookup.canonicalValue), lookupKey: phoneLookup.lookupKey,
        state: 'VERIFIED', verifiedAt: new Date() });

      async function login(email) {
        const challenge = await request(adminRuntime.server).post('/api/v1/otp-challenges')
          .send({ channel: 'EMAIL', contact: email, purpose: 'LOGIN' }).expect(202);
        expect(delivered.to).toBe(email);
        return request(adminRuntime.server).post('/api/v1/sessions').send({
          challengeId: challenge.body.data.challengeId, channel: 'EMAIL', contact: email,
          purpose: 'LOGIN', code: delivered.code
        }).expect(200);
      }
      const adminLogin = await login(admin.email);
      const staffLogin = await login(staff.email);
      const customerLogin = await login(customer.email);
      const adminCookie = adminLogin.headers['set-cookie'][0].split(';', 1)[0];
      const adminCsrf = adminLogin.body.data.csrfToken;
      const staffCookie = staffLogin.headers['set-cookie'][0].split(';', 1)[0];
      const staffCsrf = staffLogin.body.data.csrfToken;
      const customerCookie = customerLogin.headers['set-cookie'][0].split(';', 1)[0];

      await request(adminRuntime.server).get('/api/v1/users').expect(401);
      await request(adminRuntime.server).get('/api/v1/users').set('Cookie', staffCookie).expect(403);
      await request(adminRuntime.server).get('/api/v1/users').set('Cookie', customerCookie).expect(403);

      const firstPage = await request(adminRuntime.server).get('/api/v1/users?role=CUSTOMER&limit=1')
        .set('Cookie', adminCookie).expect(200);
      expect(firstPage.body.data.users).toHaveLength(1);
      expect(firstPage.body.data.nextCursor).toEqual(expect.any(String));
      expect(JSON.stringify(firstPage.body)).not.toContain(customer.email);
      expect(firstPage.body.data.users[0].contacts[0].maskedValue).toContain('•••@example.test');
      const secondPage = await request(adminRuntime.server)
        .get(`/api/v1/users?role=CUSTOMER&limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`)
        .set('Cookie', adminCookie).expect(200);
      expect(secondPage.body.data.users).toHaveLength(1);
      expect(secondPage.body.data.users[0].id).not.toBe(firstPage.body.data.users[0].id);
      const lockedFilter = await request(adminRuntime.server).get('/api/v1/users?state=LOCKED')
        .set('Cookie', adminCookie).expect(200);
      expect(lockedFilter.body.data.users.map(user => user.id)).toContain(locked.user._id.toString());
      await request(adminRuntime.server)
        .get(`/api/v1/users?role=STAFF&limit=1&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`)
        .set('Cookie', adminCookie).expect(422);

      const nameSearch = await request(adminRuntime.server).get('/api/v1/users?search=P10%20Customer')
        .set('Cookie', adminCookie).expect(200);
      expect(nameSearch.body.data.users.map(user => user.id)).toContain(customer.user._id.toString());
      expect(JSON.stringify(nameSearch.body)).not.toContain(customer.email);
      const secondDetail = await request(adminRuntime.server).get(`/api/v1/users/${secondCustomer.user._id}`)
        .set('Cookie', adminCookie).expect(200);
      expect(secondDetail.body.data.contacts).toContainEqual({ channel: 'PHONE', maskedValue: '+••••••5678' });
      expect(JSON.stringify(secondDetail.body)).not.toContain('+84912345678');
      const detail = await request(adminRuntime.server).get(`/api/v1/users/${customer.user._id}`)
        .set('Cookie', adminCookie).expect(200);
      expect(detail.body.data).toMatchObject({ id: customer.user._id.toString(), displayName: 'P10 Customer' });
      expect(detail.body.data).not.toHaveProperty('bookings');
      await request(adminRuntime.server).get(`/api/v1/users/${customer.user._id}/bookings`)
        .set('Cookie', adminCookie).expect(404);

      const decisionHeaders = { Cookie: adminCookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': adminCsrf };
      await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set({ Cookie: staffCookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': staffCsrf })
        .send({ action: 'LOCK', expectedVersion: 0, reason: 'Unauthorized staff change' }).expect(403);
      await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set({ Cookie: customerCookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1', 'X-CSRF-Token': customerLogin.body.data.csrfToken })
        .send({ action: 'LOCK', expectedVersion: 0, reason: 'Unauthorized customer change' }).expect(403);
      await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set({ Cookie: adminCookie, Host: '127.0.0.1', Origin: 'http://127.0.0.1' })
        .send({ action: 'LOCK', expectedVersion: 0, reason: 'Fraud review' }).expect(403);
      await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set(decisionHeaders).send({ action: 'LOCK', expectedVersion: 0, reason: 'x' }).expect(422);
      const lock = await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set(decisionHeaders).send({ action: 'LOCK', expectedVersion: 0, reason: 'Fraud review' }).expect(200);
      expect(lock.body.data).toMatchObject({ state: 'LOCKED', version: 1 });
      await request(adminRuntime.server).get('/api/v1/me').set('Cookie', customerCookie).expect(401);

      const lockedChallenge = await request(adminRuntime.server).post('/api/v1/otp-challenges')
        .send({ channel: 'EMAIL', contact: locked.email, purpose: 'LOGIN' }).expect(202);
      const lockedLogin = await request(adminRuntime.server).post('/api/v1/sessions').send({
        challengeId: lockedChallenge.body.data.challengeId, channel: 'EMAIL', contact: locked.email,
        purpose: 'LOGIN', code: delivered.code
      }).expect(200);
      expect(lockedLogin.body.data.authenticated).toBe(false);

      const unlock = await request(adminRuntime.server).post(`/api/v1/users/${customer.user._id}/lock-decisions`)
        .set(decisionHeaders).send({ action: 'UNLOCK', expectedVersion: 1, reason: 'Review complete' }).expect(200);
      expect(unlock.body.data).toMatchObject({ state: 'ACTIVE', version: 2 });
      const auditRecords = await Audit.find({ resourceId: customer.user._id }).sort({ occurredAt: 1 }).lean();
      expect(auditRecords.map(record => record.action)).toEqual(['USER_LOCKED', 'USER_UNLOCKED']);
      expect(auditRecords.map(record => record.reason)).toEqual(['Fraud review', 'Review complete']);
      expect(auditRecords[0].actorId.toString()).toBe(admin.user._id.toString());

      const concurrent = await Promise.all(['First review', 'Second review'].map(reason =>
        request(adminRuntime.server).post(`/api/v1/users/${staff.user._id}/lock-decisions`)
          .set(decisionHeaders).send({ action: 'LOCK', expectedVersion: 0, reason })));
      expect(concurrent.map(response => response.status).sort()).toEqual([200, 409]);
      expect(await Audit.countDocuments({ resourceId: staff.user._id, action: 'USER_LOCKED' })).toBe(1);
    } finally {
      await adminRuntime.stop();
    }
  }, 60000);
  test('standalone database is refused rather than pretending transactions ready', async () => {
    const standalone = await MongoMemoryServer.create({ binary: { version: '8.0.34' } });
    try {
      await expect(connectDatabase(loadConfig(envFor(standalone.getUri())))).rejects.toThrow('required topology');
    } finally { await standalone.stop(); }
  });
  test('startup with invalid configuration or unreachable database exits safely', async () => {
    async function execute(extra) {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['src/server.js'], { cwd: process.cwd(), windowsHide: true,
          env: { ...process.env, NODE_ENV: 'test', MONGO_URI: '', MONGO_DB: '', ...extra } });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.on('error', reject); child.on('close', code => resolve({ code, output }));
      });
    }
    const invalid = await execute({ MONGO_URI: 'invalid://synthetic-secret' });
    expect(invalid.code).toBe(1); expect(invalid.output).toContain('INVALID_CONFIGURATION');
    expect(invalid.output).not.toContain('synthetic-secret');
    const down = await execute({ MONGO_URI: 'mongodb://127.0.0.1:1', MONGO_DB: 'pwc_test', MONGO_CONNECT_TIMEOUT_MS: '100' });
    expect(down.code).toBe(1); expect(down.output).toContain('DB_CONNECTION_UNAVAILABLE');
    expect(down.output).not.toMatch(/stack|MongoServerSelectionError|mongodb:\/\//);
  });
  test('bounded shutdown drains and closes a stuck HTTP request', async () => {
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const events = [];
    const isolated = await startRuntime({ env: { ...envFor(replica.getUri()), SHUTDOWN_TIMEOUT_MS: '100' },
      logger: event => events.push(event), moduleFactories: [() => {
        const router = Router();
        router.get('/blocked', () => { entered(); });
        return { name: 'shutdown-test-only', mount: '/api/v1/testing', router };
      }]
    });
    try {
      const response = request(isolated.server).get('/api/v1/testing/blocked').then(() => 'completed', () => 'aborted');
      await started;
      await isolated.stop();
      expect(await response).toBe('aborted');
      expect(events).toContainEqual({ event: 'shutdown_complete', forced: true });
      expect(isolated.connection.readyState).toBe(0);
    } finally { await isolated.stop(); }
  });
  test('Mongo disconnect makes readiness fail, health lives; shutdown closes both resources idempotently', async () => {
    await replica.stop();
    await request(runtime.server).get('/ready').expect(503);
    await request(runtime.server).get('/health').expect(200);
    await Promise.all([runtime.stop(), runtime.stop()]);
    expect(runtime.server.listening).toBe(false);
    expect(runtime.connection.readyState).toBe(0);
    expect(runtime.lifecycle.draining).toBe(true);
  });
});
