import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import express from 'express';
import request from 'supertest';
import { connectDatabase } from '../../src/config/database.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createOtpService } from '../../src/services/otp-verification.service.js';
import { createSessionService } from '../../src/services/session.service.js';
import { createAccountSettingsService } from '../../src/services/account-settings.service.js';
import { authModule } from '../../src/routes/auth.routes.js';
import { errorHandler, requestId } from '../../src/middlewares/http.js';

const key = 'synthetic-contact-route-secret-at-least-32-bytes';
let replica, connection, User, models, contactCrypto, contactDelivery, app, actor;

async function createActiveUser({ channel = 'EMAIL', contact = 'person@example.test' } = {}) {
  const canonical = contactCrypto.lookup(channel, contact);
  const user = await User.create({ displayName: 'Synthetic User', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  await models.Contact.create({ userId: user._id, channel, canonicalCiphertext: contactCrypto.encrypt(canonical.canonicalValue),
    lookupKey: canonical.lookupKey, state: 'VERIFIED', verifiedAt: new Date() });
  return user;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'pwc_contact_route_test', connectTimeoutMs: 3000 });
  User = userModel(connection);
  models = identityModels(connection);
  await Promise.all(Object.values(models).map(model => model.syncIndexes()));
  contactCrypto = createContactCrypto({ lookupSecret: `${key}-lookup`, encryptionKey: '0123456789abcdef0123456789abcdef' });
}, 600000);

beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await User.deleteMany({});
  contactDelivery = { send: jest.fn(async () => ({ status: 'ACCEPTED', code: 'SYNTHETIC_ACCEPTED' })) };
  const sessionService = createSessionService({ connection, User, models, tokenSecret: `${key}-token`, csrfSecret: `${key}-csrf` });
  const otpService = createOtpService({ connection, User, models, contactDelivery, sessionService, contactCrypto,
    otpSecret: `${key}-otp`, createCode: () => '004201' });
  const user = await createActiveUser();
  const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
  actor = { userId: user._id.toString(), sessionId: issued.sessionId, roles: ['CUSTOMER'], state: 'ACTIVE' };
  const runtime = authModule({
    otpService, sessionService, accountSettingsService: createAccountSettingsService({ models, contactCrypto }),
    requireAuthenticated: (req, _res, next) => { req.auth = actor; next(); }, requireCsrf: (_req, _res, next) => next()
  });
  app = express();
  app.use(express.json(), requestId);
  app.use(runtime.mount, runtime.router);
  app.use(errorHandler(() => {}));
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('UC-04 POST /api/v1/me/contact-changes (HTTP route, MSG04, MSG05, GBR-05)', () => {
  const nothingStarted = async () => {
    expect(contactDelivery.send).not.toHaveBeenCalled();
    expect(await models.OtpChallenge.countDocuments({})).toBe(0);
  };

  test('the current contact of the signed-in account returns 409 CONTACT_UNCHANGED and creates no challenge', async () => {
    const response = await request(app).post('/api/v1/me/contact-changes').send({ channel: 'EMAIL', contact: ' Person@Example.Test ' }).expect(409);
    expect(response.body.error).toMatchObject({ code: 'CONTACT_UNCHANGED' });
    expect(response.body.data).toBeUndefined();
    await nothingStarted();
  });

  test('a contact of another account returns 409 CONTACT_UNAVAILABLE and creates no challenge', async () => {
    await createActiveUser({ channel: 'PHONE', contact: '+84987654321' });
    const response = await request(app).post('/api/v1/me/contact-changes').send({ channel: 'PHONE', contact: '+84987654321' }).expect(409);
    expect(response.body.error).toMatchObject({ code: 'CONTACT_UNAVAILABLE' });
    await nothingStarted();
  });

  test('a new valid contact still returns 202 with a challenge and sends one code', async () => {
    const response = await request(app).post('/api/v1/me/contact-changes').send({ channel: 'EMAIL', contact: 'new@example.test' }).expect(202);
    expect(response.body.data).toMatchObject({ challengeId: expect.any(String), expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(contactDelivery.send).toHaveBeenCalledTimes(1);
    expect(await models.OtpChallenge.countDocuments({})).toBe(1);
  });
});
