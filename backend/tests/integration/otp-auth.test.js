import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { connectDatabase } from '../../src/config/database.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createOtpService } from '../../src/services/otp-verification.service.js';
import { createSessionService, lockUserAndRevokeSessions } from '../../src/services/session.service.js';

const key = 'synthetic-auth-test-secret-at-least-32-bytes';
let replica, connection, User, models, contactCrypto, clockNow;

function fixture({ deliveryResult = { status: 'ACCEPTED', code: 'SYNTHETIC_ACCEPTED' }, logger = () => {} } = {}) {
  const sent = [];
  const contactDelivery = { send: jest.fn(async command => { sent.push(command); return deliveryResult; }) };
  const sessionService = createSessionService({ connection, User, models,
    tokenSecret: `${key}-token`, csrfSecret: `${key}-csrf`, clock: () => clockNow });
  const otpService = createOtpService({ connection, User, models, contactDelivery, sessionService, contactCrypto,
    otpSecret: `${key}-otp`, clock: () => clockNow, createCode: () => '004201', logger });
  return { otpService, sessionService, contactDelivery, sent };
}

async function createActiveUser({ channel = 'EMAIL', contact = 'person@example.test', role = 'CUSTOMER' } = {}) {
  const canonical = contactCrypto.lookup(channel, contact);
  const user = await User.create({ displayName: 'Synthetic User', roles: [role], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  await models.Contact.create({ userId: user._id, channel, canonicalCiphertext: contactCrypto.encrypt(canonical.canonicalValue),
    lookupKey: canonical.lookupKey, state: 'VERIFIED', verifiedAt: new Date(clockNow) });
  return { user, canonical };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1, storageEngine: 'wiredTiger' } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'pwc_auth_test', connectTimeoutMs: 3000 });
  User = userModel(connection);
  models = identityModels(connection);
  await Promise.all(Object.values(models).map(model => model.syncIndexes()));
  contactCrypto = createContactCrypto({ lookupSecret: `${key}-lookup`, encryptionKey: '0123456789abcdef0123456789abcdef' });
}, 600000);

beforeEach(async () => {
  clockNow = Date.now() + 24 * 60 * 60 * 1000;
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await connection.collection('account_contact_audit_events').deleteMany({});
  await User.deleteMany({});
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('P06 OTP policy using an isolated MongoDB replica set', () => {
  test('stores only digests, sends six digits, and expires at five minutes', async () => {
    await createActiveUser();
    const { otpService, sent } = fixture();
    const started = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    expect(started).toMatchObject({ status: 'PENDING', expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(sent[0]).toMatchObject({ code: '004201', purpose: 'LOGIN', channel: 'EMAIL' });
    expect(sent[0].expiresAt).toBe(new Date(clockNow + 300000).toISOString());
    const stored = await models.OtpChallenge.findOne({ challengeId: started.challengeId }).select('+codeDigest +contactLookup').lean();
    expect(stored.codeDigest).not.toBe('004201');
    expect(JSON.stringify(stored)).not.toContain('004201');
    expect(JSON.stringify(stored)).not.toContain('person@example.test');

    clockNow += 300000;
    await expect(otpService.verify({ ...started, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_INVALID_OR_EXPIRED' });
  });

  test('enforces resend cooldown and invalidates the previous challenge', async () => {
    await createActiveUser();
    const { otpService } = fixture();
    const first = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    await expect(otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' }))
      .rejects.toMatchObject({ status: 429, code: 'OTP_RATE_LIMITED' });
    clockNow += 60000;
    const second = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    await expect(otpService.verify({ ...first, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(otpService.verify({ ...second, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .resolves.toMatchObject({ status: 'VERIFIED', authenticated: true });
  });

  test('limits a contact to five sent codes per rolling hour', async () => {
    const { otpService } = fixture();
    const first = await otpService.begin({ channel: 'PHONE', contact: '+84912345678', purpose: 'REGISTER' });
    for (let index = 0; index < 4; index += 1) {
      clockNow += 60000;
      await otpService.begin({ channel: 'PHONE', contact: '+84912345678', purpose: 'REGISTER' });
    }
    clockNow += 60000;
    await expect(otpService.begin({ channel: 'PHONE', contact: '+84912345678', purpose: 'REGISTER' }))
      .rejects.toMatchObject({ status: 429, code: 'OTP_RATE_LIMITED' });
    expect(first.challengeId).toBeTruthy();
  });

  test('serializes concurrent first sends for the same contact', async () => {
    const { otpService } = fixture();
    const attempts = await Promise.allSettled([
      otpService.begin({ channel: 'PHONE', contact: '+84912345678', purpose: 'REGISTER' }),
      otpService.begin({ channel: 'PHONE', contact: '+84912345678', purpose: 'REGISTER' })
    ]);
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    expect(attempts.find(attempt => attempt.status === 'rejected').reason).toMatchObject({ status: 429, code: 'OTP_RATE_LIMITED' });
    expect(await models.OtpChallenge.countDocuments({ usedAt: null })).toBe(1);
  });

  test('locks a contact after five wrong codes and recovers after fifteen minutes', async () => {
    await createActiveUser();
    const { otpService } = fixture();
    const challenge = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    for (let index = 0; index < 5; index += 1) {
      await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '999999' }))
        .rejects.toMatchObject({ status: 400, code: 'OTP_INVALID_OR_EXPIRED' });
    }
    const throttle = await models.OtpThrottle.findOne({}).lean();
    expect(throttle.failedCount).toBe(5);
    expect(throttle.lockedUntil.getTime()).toBe(clockNow + 15 * 60 * 1000);
    await expect(otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' }))
      .rejects.toMatchObject({ status: 429, code: 'OTP_RATE_LIMITED' });
    clockNow += 15 * 60 * 1000;
    const recovered = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    await expect(otpService.verify({ ...recovered, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .resolves.toMatchObject({ authenticated: true });
  });

  test('binds challenges to purpose and initiating contact-change session, and prevents replay', async () => {
    const { user } = await createActiveUser();
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const owner = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'CONTACT_CHANGE', actor: owner });
    await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201', actor: owner }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'CONTACT_CHANGE', code: '004201', actor: { ...owner, sessionId: 'session-b' } }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'CONTACT_CHANGE', code: '004201', actor: owner }))
      .resolves.toMatchObject({ status: 'VERIFIED', authenticated: false });

    clockNow += 60000;
    const login = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    await otpService.verify({ ...login, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' });
    await expect(otpService.verify({ ...login, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    expect(await models.AuthSession.countDocuments({})).toBe(2);
  });

  test('replaces a verified contact only after its new contact is verified', async () => {
    const { user } = await createActiveUser({ channel: 'PHONE', contact: '+84912345678' });
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });
    const oldContact = contactCrypto.lookup('PHONE', '+84912345678');
    expect(await models.Contact.countDocuments({ userId: user._id, channel: 'PHONE', state: 'VERIFIED' })).toBe(1);
    await expect(otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '999999', actor }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_INVALID_OR_EXPIRED' });
    expect(await models.Contact.countDocuments({ userId: user._id, channel: 'PHONE', state: 'VERIFIED' })).toBe(1);
    await otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor });
    const contacts = await models.Contact.find({ userId: user._id, channel: 'PHONE' }).select('+canonicalCiphertext +lookupKey').lean();
    expect(contacts.find(contact => contact.state === 'REPLACED').lookupKey).toBe(oldContact.lookupKey);
    const current = contacts.find(contact => contact.state === 'VERIFIED');
    expect(contactCrypto.decrypt(current.canonicalCiphertext)).toBe('+84987654321');
    const auditEvents = await connection.collection('account_contact_audit_events').find({}).toArray();
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      eventId: challenge.challengeId,
      logicalOperationId: challenge.challengeId,
      correlationId: challenge.challengeId,
      schemaVersion: 1,
      type: 'CONTACT_REPLACED',
      aggregateType: 'CONTACT',
      actorRef: { userId: user._id },
      payload: { channel: 'PHONE' }
    });
    expect(JSON.stringify(auditEvents[0])).not.toMatch(/\+84912345678|\+84987654321|004201|contactLookup|canonicalCiphertext/);
  });

  test('records an audit event when linking the second contact channel', async () => {
    const { user } = await createActiveUser({ channel: 'EMAIL', contact: 'person@example.test' });
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });

    await otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor });

    expect(await models.Contact.countDocuments({ userId: user._id, state: 'VERIFIED' })).toBe(2);
    const event = await connection.collection('account_contact_audit_events').findOne({ eventId: challenge.challengeId });
    expect(event).toMatchObject({ type: 'CONTACT_LINKED', payload: { channel: 'PHONE' } });
  });

  test('links a contact only once when its OTP is verified concurrently', async () => {
    const { user } = await createActiveUser({ channel: 'EMAIL', contact: 'person@example.test' });
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });
    const verify = () => otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor });

    const attempts = await Promise.allSettled([verify(), verify()]);

    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    expect(await models.Contact.countDocuments({ userId: user._id, state: 'VERIFIED' })).toBe(2);
    expect(await connection.collection('account_contact_audit_events').countDocuments({})).toBe(1);
  });

  test('rejects another account contact without merging or replacing either account', async () => {
    const { user: firstUser } = await createActiveUser({ channel: 'EMAIL', contact: 'first@example.test' });
    const { otpService, sessionService, contactDelivery } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(firstUser, session));
    const actor = { userId: firstUser._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });
    const { user: secondUser } = await createActiveUser({ channel: 'PHONE', contact: '+84987654321' });
    await expect(otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor }))
      .rejects.toMatchObject({ status: 409, code: 'CONTACT_UNAVAILABLE' });
    expect(contactDelivery.send).toHaveBeenCalledTimes(1);

    await expect(otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor }))
      .rejects.toMatchObject({ status: 409, code: 'CONTACT_UNAVAILABLE' });

    expect(await models.Contact.countDocuments({ userId: firstUser._id, state: 'VERIFIED' })).toBe(1);
    expect(await models.Contact.countDocuments({ userId: secondUser._id, state: 'VERIFIED' })).toBe(1);
    expect(await User.countDocuments({})).toBe(2);
    expect(await connection.collection('account_contact_audit_events').countDocuments({})).toBe(0);
    expect(await models.OtpChallenge.countDocuments({ challengeId: challenge.challengeId, usedAt: { $ne: null } })).toBe(1);
  });

  test('expired contact verification leaves the current login method unchanged', async () => {
    const { user } = await createActiveUser({ channel: 'EMAIL', contact: 'person@example.test' });
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });
    clockNow += 5 * 60 * 1000;

    await expect(otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor }))
      .rejects.toMatchObject({ status: 400, code: 'OTP_INVALID_OR_EXPIRED' });
    expect(await models.Contact.countDocuments({ userId: user._id, state: 'VERIFIED' })).toBe(1);
    expect(await connection.collection('account_contact_audit_events').countDocuments({})).toBe(0);
  });

  test('provider failure rejects contact enrollment and leaves existing login contact unchanged', async () => {
    const { user } = await createActiveUser({ channel: 'EMAIL', contact: 'person@example.test' });
    const { otpService, sessionService } = fixture({ deliveryResult: { status: 'FAILED', code: 'PROVIDER_ERROR' } });
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };

    await expect(otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor }))
      .rejects.toMatchObject({ status: 503, code: 'PROVIDER_UNAVAILABLE' });
    expect(await models.Contact.countDocuments({ userId: user._id, state: 'VERIFIED' })).toBe(1);
    expect(await connection.collection('account_contact_audit_events').countDocuments({})).toBe(0);
    expect(await models.OtpChallenge.countDocuments({ purpose: 'CONTACT_CHANGE', usedAt: null })).toBe(0);
  });

  test('does not apply a contact change after its initiating session is revoked', async () => {
    const { user } = await createActiveUser({ channel: 'PHONE', contact: '+84912345678' });
    const { otpService, sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    const actor = { userId: user._id.toString(), sessionId: issued.sessionId };
    const challenge = await otpService.begin({ channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', actor });
    await models.AuthSession.updateOne({ sessionId: issued.sessionId }, { $set: { revokedAt: new Date(clockNow) } });
    await expect(otpService.verify({ ...challenge, channel: 'PHONE', contact: '+84987654321', purpose: 'CONTACT_CHANGE', code: '004201', actor }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(await models.Contact.countDocuments({ userId: user._id, channel: 'PHONE', state: 'VERIFIED' })).toBe(1);
    expect(await models.AuthSession.countDocuments({})).toBe(1);
  });

  test('allows only one session when two requests verify the same challenge concurrently', async () => {
    await createActiveUser();
    const { otpService } = fixture();
    const challenge = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    const attempts = await Promise.allSettled([
      otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }),
      otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' })
    ]);
    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    expect(await models.AuthSession.countDocuments({ revokedAt: null })).toBe(1);
  });

  test('issues role-based server sessions and revokes them on logout or account lock', async () => {
    const { user } = await createActiveUser({ role: 'STAFF' });
    const { otpService, sessionService } = fixture();
    const login = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    const verified = await otpService.verify({ ...login, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' });
    expect(verified.session.expiresAt).toBe(clockNow + 12 * 60 * 60 * 1000);
    const req = { headers: { cookie: `${sessionService.cookieName}=${verified.session.token}` } };
    await expect(sessionService.authenticate(req)).resolves.toMatchObject({ roles: ['STAFF'], userId: user._id.toString() });
    await expect(sessionService.verifyCsrf(await sessionService.authenticate(req), verified.session.csrfToken)).resolves.toBe(true);
    await expect(sessionService.verifyCsrf(await sessionService.authenticate(req), 'wrong-token')).resolves.toBe(false);
    expect(await sessionService.revoke(req)).toBe(true);
    await expect(sessionService.authenticate(req)).resolves.toBeNull();

    clockNow += 60000;
    const next = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    const nextLogin = await otpService.verify({ ...next, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' });
    const authorize = jest.fn(async () => true);
    const audit = jest.fn(async () => {});
    await expect(lockUserAndRevokeSessions({ connection, userModel: User, models,
      userId: user._id.toString(), expectedVersion: 0,
      actor: { userId: 'admin-1', state: 'ACTIVE', roles: ['ADMIN'] }, reason: 'Synthetic test lock',
      authorize: async () => false, audit, clock: () => clockNow }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await User.findById(user._id).select('state').lean()).toMatchObject({ state: 'ACTIVE' });
    const locked = await lockUserAndRevokeSessions({ connection, userModel: User, models,
      userId: user._id.toString(), expectedVersion: 0,
      actor: { userId: 'admin-1', state: 'ACTIVE', roles: ['ADMIN'] }, reason: 'Synthetic test lock',
      authorize, audit, clock: () => clockNow });
    expect(locked.state).toBe('LOCKED');
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ action: 'DECIDE', resourceType: 'user' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOCKED' }), expect.objectContaining({ session: expect.anything() }));
    await expect(sessionService.authenticate({ headers: { cookie: `${sessionService.cookieName}=${nextLogin.session.token}` } })).resolves.toBeNull();
    expect(await models.AuthSession.countDocuments({ revokedAt: null })).toBe(0);
  });

  test('uses thirty days for customer sessions and does not create sessions for unverified accounts', async () => {
    const { user, canonical } = await createActiveUser({ role: 'CUSTOMER' });
    const { sessionService } = fixture();
    const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session));
    expect(issued.expiresAt).toBe(clockNow + 30 * 24 * 60 * 60 * 1000);
    await models.Contact.deleteOne({ userId: user._id });
    const { otpService } = fixture();
    const challenge = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .resolves.toMatchObject({ authenticated: false });
    expect(await models.AuthSession.countDocuments({})).toBe(1);
    expect(canonical.lookupKey).toBeTruthy();
  });

  test('does not expose OTPs in logs or leave a usable challenge after provider failure', async () => {
    const logger = jest.fn();
    const { otpService } = fixture({ deliveryResult: { status: 'FAILED', code: 'PROVIDER_ERROR' }, logger });
    const challenge = await otpService.begin({ channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('004201');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('person@example.test');
    expect(JSON.stringify(logger.mock.calls)).toContain('OTP_DELIVERY');
    await expect(otpService.verify({ ...challenge, channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '004201' }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
  });
});

test.each([['CUSTOMER',true,30*24],['PET_SITTER',true,30*24],['CUSTOMER',false,12],['ADMIN',true,12]])('remembered session lifetime and cookie options for %s (%s)', async (role, rememberDevice, hours) => {
  const {user}=await createActiveUser({role});
  const {sessionService}=fixture();
  const issued=await connection.transaction(session=>sessionService.issueInTransaction(user,session,{rememberDevice}));
  expect(issued.expiresAt-clockNow).toBe(hours*60*60*1000);
  const response={cookie:jest.fn()}; sessionService.setCookie(response,issued,{secure:true,persistent:rememberDevice});
  const options=response.cookie.mock.calls[0][2];
  expect(options).toMatchObject({httpOnly:true,secure:true,sameSite:'lax'});
  if(rememberDevice) expect(options.maxAge).toBe(hours*60*60*1000); else expect(options).not.toHaveProperty('maxAge');
  const req={headers:{cookie:`pwc_session=${issued.token}`}};
  const auth=await sessionService.authenticate(req);
  const csrf=await sessionService.resumeCsrf(req,auth);
  expect(await sessionService.resumeCsrf(req,auth)).toBe(csrf);
  expect(await sessionService.verifyCsrf(auth,csrf)).toBe(true);
  await sessionService.revoke(req);
  expect(await sessionService.authenticate(req)).toBe(null);
  await expect(sessionService.resumeCsrf(req,auth)).rejects.toMatchObject({status:401});
});

test('CSRF resume migrates legacy sessions once and rejects expiry and mismatched cookies', async () => {
  const { user } = await createActiveUser();
  const { sessionService } = fixture();
  const issued = await connection.transaction(session => sessionService.issueInTransaction(user, session, { rememberDevice: false }));
  const req = { headers: { cookie: `pwc_session=${issued.token}` } };
  const auth = await sessionService.authenticate(req);
  await models.AuthSession.updateOne({ sessionId: issued.sessionId }, { $set: { csrfDigest: 'a'.repeat(64) } });
  const update = jest.spyOn(models.AuthSession, 'updateOne');
  try {
    const token = await sessionService.resumeCsrf(req, auth);
    expect(await sessionService.verifyCsrf(auth, token)).toBe(true);
    await sessionService.resumeCsrf(req, auth);
    expect(update).toHaveBeenCalledTimes(1);
    await expect(sessionService.resumeCsrf({ headers: { cookie: `pwc_session=${'b'.repeat(43)}` } }, auth))
      .rejects.toMatchObject({ status: 401 });
    clockNow = issued.expiresAt;
    expect(await sessionService.authenticate(req)).toBeNull();
    await expect(sessionService.resumeCsrf(req, auth)).rejects.toMatchObject({ status: 401 });
  } finally { update.mockRestore(); }
});
