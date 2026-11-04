import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';

const secrets = {
  otp: 'synthetic-login-flow-otp-secret-32-bytes',
  token: 'synthetic-login-flow-token-secret-32-bytes',
  csrf: 'synthetic-login-flow-csrf-secret-32-bytes',
  lookup: 'synthetic-login-flow-lookup-secret-32-bytes',
  encryption: '0123456789abcdef0123456789abcdef'
};

let replica;
let connection;
let User;
let models;
let contactCrypto;
let app;
let sent;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' },
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  });
  connection = await connectDatabase({
    mongoUri: replica.getUri(), database: 'pwc_login_flow_test', connectTimeoutMs: 3000
  });
  User = userModel(connection);
  models = identityModels(connection);
  await Promise.all([...Object.values(models), User].map(model => model.syncIndexes()));
  contactCrypto = createContactCrypto({ lookupSecret: secrets.lookup, encryptionKey: secrets.encryption });

  const config = loadConfig({
    NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_login_flow_test',
    AUTH_ENABLED: 'true', OTP_HMAC_SECRET: secrets.otp, SESSION_TOKEN_SECRET: secrets.token,
    SESSION_CSRF_SECRET: secrets.csrf, CONTACT_LOOKUP_SECRET: secrets.lookup,
    CONTACT_ENCRYPTION_KEY: secrets.encryption
  });
  app = createApp({
    config,
    connection,
    lifecycle: { draining: false },
    env: {},
    portOverrides: {
      contactDelivery: { send: jest.fn(async command => { sent.push(command); return { status: 'ACCEPTED' }; }) }
    }
  });
}, 600000);

beforeEach(async () => {
  sent = [];
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await User.deleteMany({});

  const user = await User.create({ displayName: 'Login Customer', roles: ['CUSTOMER'], state: 'ACTIVE' });
  const contact = contactCrypto.lookup('EMAIL', 'person@example.test');
  await models.Contact.create({
    userId: user._id,
    channel: 'EMAIL',
    canonicalCiphertext: contactCrypto.encrypt(contact.canonicalValue),
    lookupKey: contact.lookupKey,
    state: 'VERIFIED',
    verifiedAt: new Date()
  });
});

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('email OTP login flow', () => {
  test('requests an OTP, rejects a wrong code, then creates a session with the right code', async () => {
    const challenge = await request(app).post('/api/v1/otp-challenges')
      .send({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' })
      .expect(202);

    expect(challenge.body.data).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(sent).toHaveLength(1);
    expect(challenge.body.data).not.toHaveProperty('contact');
    expect(challenge.body.data).not.toHaveProperty('code');

    await request(app).post('/api/v1/sessions').send({
      challengeId: challenge.body.data.challengeId,
      channel: 'EMAIL',
      contact: 'person@example.test',
      purpose: 'LOGIN',
      code: '999999'
    }).expect(400);

    const login = await request(app).post('/api/v1/sessions').send({
      challengeId: challenge.body.data.challengeId,
      channel: 'EMAIL',
      contact: 'person@example.test',
      purpose: 'LOGIN',
      code: sent[0].code,
      rememberDevice: false
    }).expect(200);

    expect(login.body.data).toMatchObject({
      authenticated: true,
      user: { displayName: 'Login Customer', roles: ['CUSTOMER'] }
    });
    expect(login.headers['set-cookie'][0]).toMatch(/pwc_session=.*HttpOnly/i);
    expect(await models.AuthSession.countDocuments({ revokedAt: null })).toBe(1);
    expect(JSON.stringify(login.body)).not.toContain(sent[0].code);
  });
});
