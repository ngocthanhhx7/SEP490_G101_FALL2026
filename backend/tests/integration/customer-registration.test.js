import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { requireCsrf, requireSession } from '../../src/middlewares/session.js';
import { authModule } from '../../src/routes/auth.routes.js';
import { connectDatabase } from '../../src/config/database.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createAccountSettingsService } from '../../src/services/account-settings.service.js';
import { createCustomerRegistrationHandler } from '../../src/services/customer-registration.service.js';
import { createOtpService } from '../../src/services/otp-verification.service.js';
import { createSessionService } from '../../src/services/session.service.js';
import { AppError } from '../../src/utils/app-error.js';

const secret = 'synthetic-customer-registration-test-key';
const code = '004201';
const policyVersions = { terms: 'terms-2026-10-01', privacy: 'privacy-2026-10-01' };
let replica;
let connection;
let User;
let models;
let contactCrypto;
let clockNow;

function fixture({ deliveryResult = { status: 'ACCEPTED', code: 'SYNTHETIC_ACCEPTED' } } = {}) {
  const sent = [];
  const contactDelivery = { send: jest.fn(async command => { sent.push(command); return deliveryResult; }) };
  const sessionService = createSessionService({ connection, User, models,
    tokenSecret: `${secret}-token-secret`, csrfSecret: `${secret}-csrf-secret`, clock: () => clockNow });
  const registrationPolicyService = { validateAndBuildReceipt: jest.fn(async ({ policyVersions: accepted, now }) => {
    if (!accepted || accepted.terms !== policyVersions.terms || accepted.privacy !== policyVersions.privacy) {
      throw new AppError(409, 'POLICY_NOT_AVAILABLE', 'Required policies are not available for consent');
    }
    return Object.freeze([
    { slug: 'terms', versionId: policyVersions.terms, contentHash: 'terms-hash', effectiveAt: new Date('2026-10-01T00:00:00.000Z'), consentedAt: new Date(now), sourceRef: 'test-approved-source' },
    { slug: 'privacy', versionId: policyVersions.privacy, contentHash: 'privacy-hash', effectiveAt: new Date('2026-10-01T00:00:00.000Z'), consentedAt: new Date(now), sourceRef: 'test-approved-source' },
    ]);
  }) };
  const register = createCustomerRegistrationHandler({ connection, User, models, sessionService, contactCrypto, registrationPolicyService, clock: () => clockNow });
  const accountSettingsService = createAccountSettingsService({ connection, models, contactCrypto });
  const otpService = createOtpService({ connection, User, models, contactDelivery, sessionService, contactCrypto,
    otpSecret: `${secret}-otp-secret`, clock: () => clockNow, createCode: () => code,
    verificationHandlers: { REGISTER: register } });
  const config = loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_customer_registration_test' });
  const app = createApp({ config, connection, lifecycle: { draining: false }, moduleFactories: [() => authModule({
    otpService, sessionService, accountSettingsService, requireAuthenticated: requireSession(sessionService),
    requireCsrf: requireCsrf(sessionService), secureCookies: false,
  })] });
  return { app, sessionService, contactDelivery, sent };
}

async function startChallenge(app, { channel = 'EMAIL', contact = 'person@example.test' } = {}) {
  const response = await request(app).post('/api/v1/otp-challenges')
    .send({ channel, contact, purpose: 'REGISTER' }).expect(202);
  return { ...response.body.data, channel, contact };
}

function verificationBody(challenge, overrides = {}) {
  return {
    challengeId: challenge.challengeId,
    channel: challenge.channel,
    contact: challenge.contact,
    purpose: 'REGISTER',
    code,
    displayName: 'Nguyễn Văn A',
    policyVersions,
    ...overrides,
  };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'pwc_customer_registration_test', connectTimeoutMs: 3000 });
  User = userModel(connection);
  models = identityModels(connection);
  await Promise.all(Object.values(models).map(model => model.syncIndexes()));
  await User.syncIndexes();
  contactCrypto = createContactCrypto({ lookupSecret: `${secret}-lookup-secret`, encryptionKey: '0123456789abcdef0123456789abcdef' });
}, 600000);

beforeEach(async () => {
  clockNow = Date.parse('2026-10-14T00:00:00.000Z');
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await User.deleteMany({});
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('P07 Customer registration over P06 OTP with isolated MongoDB', () => {
  test.each([
    ['EMAIL', ' PERSON@Example.Test ', 'person@example.test'],
    ['PHONE', '+84912345678', '+84912345678'],
  ])('verifies one %s contact and creates exactly one active Customer with an HttpOnly session', async (channel, contact, canonical) => {
    const { app, sessionService, sent } = fixture();
    const challenge = await startChallenge(app, { channel, contact });
    expect(sent[0]).toMatchObject({ kind: 'OTP', purpose: 'REGISTER', channel, to: canonical, code });
    const response = await request(app).post('/api/v1/otp-verifications')
      .send(verificationBody(challenge, { displayName: '  Nguyễn   Văn A  ' })).expect(200);

    expect(response.headers['set-cookie'][0]).toMatch(/pwc_session=/);
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(response.body.data).toMatchObject({ verified: true, authenticated: true,
      user: { displayName: 'Nguyễn Văn A', roles: ['CUSTOMER'] } });
    expect(response.body.data.expiresAt).toBe(new Date(clockNow + 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(JSON.stringify(response.body)).not.toContain(code);
    expect(JSON.stringify(response.body)).not.toContain(canonical);
    expect(JSON.stringify(response.body)).not.toMatch(/password/i);
    expect(response.body.data).not.toHaveProperty('token');
    expect(response.body.data).not.toHaveProperty('sessionToken');

    const users = await User.find({}).lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ displayName: 'Nguyễn Văn A', roles: ['CUSTOMER'], state: 'ACTIVE', synthetic: false });
    expect(users[0].policyConsents).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'terms', versionId: policyVersions.terms, contentHash: 'terms-hash' }),
      expect.objectContaining({ slug: 'privacy', versionId: policyVersions.privacy, contentHash: 'privacy-hash' }),
    ]));
    expect(users[0]).not.toHaveProperty('password');
    expect(await models.Contact.countDocuments({ userId: users[0]._id, channel, state: 'VERIFIED' })).toBe(1);
    const contactRecord = await models.Contact.findOne({ userId: users[0]._id }).select('+canonicalCiphertext +lookupKey').lean();
    expect(contactCrypto.decrypt(contactRecord.canonicalCiphertext)).toBe(canonical);

    const sessionToken = response.headers['set-cookie'][0].match(/pwc_session=([^;]+)/)[1];
    await expect(sessionService.authenticate({ headers: { cookie: `pwc_session=${sessionToken}` } }))
      .resolves.toMatchObject({ userId: users[0]._id.toString(), roles: ['CUSTOMER'] });
    expect(await models.AuthSession.countDocuments({ userId: users[0]._id, revokedAt: null })).toBe(1);
  });

  test('wrong or expired OTP never creates a User, Contact or Session', async () => {
    const { app } = fixture();
    const challenge = await startChallenge(app);
    await request(app).post('/api/v1/otp-verifications')
      .send(verificationBody(challenge, { code: '999999' })).expect(400);
    expect(await User.countDocuments({})).toBe(0);
    expect(await models.Contact.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({})).toBe(0);

    const next = await startChallenge(app, { contact: 'second@example.test' });
    clockNow += 5 * 60 * 1000;
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(next)).expect(400);
    expect(await User.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({})).toBe(0);
  });

  test('missing accepted policy versions fails closed after OTP and creates no account', async () => {
    const { app } = fixture();
    const challenge = await startChallenge(app, { contact: 'no-policy@example.test' });
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(challenge, { policyVersions: null })).expect(409);
    expect(await User.countDocuments({})).toBe(0);
    expect(await models.Contact.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({})).toBe(0);
  });

  test('invalid name and unknown password fields are rejected without consuming a valid OTP', async () => {
    const { app } = fixture();
    const challenge = await startChallenge(app);
    await request(app).post('/api/v1/otp-verifications')
      .send(verificationBody(challenge, { displayName: '   ' })).expect(422);
    await request(app).post('/api/v1/otp-verifications')
      .send(verificationBody(challenge, { password: 'must-not-be-accepted' })).expect(422);
    expect(await User.countDocuments({})).toBe(0);
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(challenge)).expect(200);
    expect(await User.countDocuments({ roles: ['CUSTOMER'] })).toBe(1);
  });

  test('provider failure leaves no usable registration challenge or account', async () => {
    const { app, sent } = fixture({ deliveryResult: { status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' } });
    const challenge = await startChallenge(app);
    expect(challenge).toMatchObject({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(await models.OtpChallenge.countDocuments({ challengeId: challenge.challengeId, invalidationReason: 'DELIVERY_FAILED' })).toBe(1);
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(challenge)).expect(400);
    expect(sent).toHaveLength(1);
    expect(await User.countDocuments({})).toBe(0);
    expect(await models.Contact.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({})).toBe(0);
  });

  test('a verified contact cannot create a second account and a consumed code cannot replay', async () => {
    const { app } = fixture();
    const first = await startChallenge(app);
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(first)).expect(200);
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(first)).expect(400);

    clockNow += 60000;
    const second = await startChallenge(app);
    await request(app).post('/api/v1/otp-verifications').send(verificationBody(second)).expect(409);
    expect(await User.countDocuments({})).toBe(1);
    expect(await models.Contact.countDocuments({ state: 'VERIFIED' })).toBe(1);
    expect(await models.AuthSession.countDocuments({ revokedAt: null })).toBe(1);
  });

  test('concurrent submissions consume one challenge and create one account/session', async () => {
    const { app } = fixture();
    const challenge = await startChallenge(app);
    const body = verificationBody(challenge);
    const responses = await Promise.all([
      request(app).post('/api/v1/otp-verifications').send(body),
      request(app).post('/api/v1/otp-verifications').send(body),
    ]);
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    expect(responses.filter(response => response.status === 400)).toHaveLength(1);
    expect(await User.countDocuments({})).toBe(1);
    expect(await models.Contact.countDocuments({ state: 'VERIFIED' })).toBe(1);
    expect(await models.AuthSession.countDocuments({ revokedAt: null })).toBe(1);
  });
});
