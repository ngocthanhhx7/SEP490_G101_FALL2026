import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createSessionService } from '../../src/services/session.service.js';
import { sitterApplicationModule } from '../../src/routes/sitter-application.routes.js';

const SECRETS = {
  OTP_HMAC_SECRET: 'synthetic-otp-hmac-secret-for-sitter-app-tests',
  SESSION_TOKEN_SECRET: 'synthetic-session-token-secret-for-sitter-tests',
  SESSION_CSRF_SECRET: 'synthetic-session-csrf-secret-for-sitter-tests',
  CONTACT_LOOKUP_SECRET: 'synthetic-contact-lookup-secret-for-sitter-tests',
  CONTACT_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef'
};
const ADMIN_ID = '111111111111111111111111';
const CUSTOMER_ID = '222222222222222222222222';
const IDENTITY_REF = 'document-ref-identity-001';
let replica;
let connection;
let User;
let Contact;
let models;
let contactCrypto;
let clockNow;
let mediaPort;
let config;

function applicationBody(overrides = {}) {
  return {
    displayName: 'Nguyễn Văn A', contactChannel: 'EMAIL', contactValue: 'sitter@example.test',
    dateOfBirth: '1990-04-12', identityNumber: '012345678901',
    experience: 'Có ba năm chăm sóc chó mèo tại nhà.',
    requestedServices: ['Cho mèo ăn', 'Dắt chó đi dạo'], workAreas: ['Quận 1', 'Quận 3'],
    documents: [{ documentId: 'identity-document', documentType: 'IDENTITY', storageRef: IDENTITY_REF }],
    ...overrides
  };
}

function app({ privateMedia = mediaPort, clock = () => clockNow, contactDelivery } = {}) {
  return createApp({ config, connection, lifecycle: { draining: false }, portOverrides: { privateMedia, ...(contactDelivery ? { contactDelivery } : {}) }, clock,
    moduleFactories: [context => sitterApplicationModule({ ...context, clock })] });
}

async function login(role = 'ADMIN') {
  const user = await User.create({ _id: role === 'ADMIN' ? ADMIN_ID : CUSTOMER_ID,
    displayName: `${role} Test`, roles: [role], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  const sessionService = createSessionService({ connection, User, models,
    tokenSecret: SECRETS.SESSION_TOKEN_SECRET, csrfSecret: SECRETS.SESSION_CSRF_SECRET, clock: () => clockNow });
  let issued;
  await connection.transaction(async session => { issued = await sessionService.issueInTransaction(user, session); });
  return { cookie: `pwc_session=${issued.token}`, csrf: issued.csrfToken };
}

function submit(appInstance, body, key = 'submit-key-0001') {
  return request(appInstance).post('/api/v1/applications').set('Origin', 'http://127.0.0.1')
    .set('Host', '127.0.0.1')
    .set('Idempotency-Key', key).send(body);
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' },
    replSet: { count: 1, storageEngine: 'wiredTiger' } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'pwc_sitter_applications_test', connectTimeoutMs: 3000 });
  User = userModel(connection);
  models = identityModels(connection);
  Contact = models.Contact;
  const applicationModels = sitterApplicationModels(connection);
  await Promise.all([...Object.values(models), ...Object.values(applicationModels)].map(model => model.syncIndexes()));
  await User.syncIndexes();
  contactCrypto = createContactCrypto({ lookupSecret: SECRETS.CONTACT_LOOKUP_SECRET,
    encryptionKey: SECRETS.CONTACT_ENCRYPTION_KEY });
  config = loadConfig({ NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: 'pwc_sitter_applications_test',
    AUTH_ENABLED: 'true', ...SECRETS });
}, 600000);

beforeEach(async () => {
  clockNow = Date.parse('2026-10-14T03:00:00.000Z');
  await Promise.all([...Object.values(models), ...Object.values(sitterApplicationModels(connection))].map(model => model.deleteMany({})));
  await User.deleteMany({});
  mediaPort = {
    verifyApplicantDocuments: async ({ documents }) => documents,
    createReadCapability: async ({ storageRef }) => ({ url: `https://private.example.test/${storageRef}`, expiresAt: new Date(clockNow + 60_000).toISOString() })
  };
});

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

describe('P16 public sitter application submission', () => {
  test('accepts a Guest application without creating a User, Contact or session; encrypts contact and omits raw ID/date of birth', async () => {
    const response = await submit(app(), applicationBody()).expect(201);
    expect(response.body.data).toMatchObject({ state: 'PENDING', replayed: false });
    expect(response.body.data).not.toHaveProperty('contact');
    expect(await User.countDocuments({})).toBe(0);
    expect(await Contact.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({})).toBe(0);

    const stored = await sitterApplicationModels(connection).SitterApplication.findById(response.body.data.id)
      .select('+contactCiphertext +contactLookupKey +identityLookupKey +activePendingIdentityKey').lean();
    expect(stored.contactCiphertext).not.toContain('sitter@example.test');
    expect(contactCrypto.decrypt(stored.contactCiphertext)).toBe('sitter@example.test');
    expect(stored.identityLookupKey).not.toContain('012345678901');
    expect(stored).not.toHaveProperty('identityNumber');
    expect(stored).not.toHaveProperty('dateOfBirth');
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({ action: 'APPLICATION_SUBMITTED' })).toBe(1);
  });

  test('rejects underage and malformed submissions without persisting identity values', async () => {
    await submit(app(), applicationBody({ dateOfBirth: '2012-10-15' })).expect(422);
    await submit(app(), applicationBody({ workAreas: [] }), 'submit-key-0002').expect(422);
    await submit(app(), { ...applicationBody(), accountRole: 'ADMIN' }, 'submit-key-0003').expect(422);
    expect(await sitterApplicationModels(connection).SitterApplication.countDocuments({})).toBe(0);
    expect(await User.countDocuments({})).toBe(0);
  });

  test('requires provider verification for private document references', async () => {
    await submit(app({ privateMedia: { createReadCapability: mediaPort.createReadCapability } }), applicationBody()).expect(503);
    expect(await sitterApplicationModels(connection).SitterApplication.countDocuments({})).toBe(0);
  });

  test('same idempotency key replays without duplicate records; changed payload conflicts', async () => {
    const application = app();
    const first = await submit(application, applicationBody(), 'submit-key-replay-1').expect(201);
    const replay = await submit(application, applicationBody(), 'submit-key-replay-1').expect(200);
    expect(replay.body.data).toMatchObject({ id: first.body.data.id, replayed: true });
    await submit(application, applicationBody({ displayName: 'Nguyễn Văn B' }), 'submit-key-replay-1').expect(409);
    expect(await sitterApplicationModels(connection).SitterApplication.countDocuments({})).toBe(1);
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({ action: 'APPLICATION_SUBMITTED' })).toBe(1);
  });

  test('blocks duplicate pending contact and identity without disclosing which value matched', async () => {
    const application = app();
    await submit(application, applicationBody()).expect(201);
    const sameContact = await submit(application, applicationBody({ identityNumber: '987654321098' }), 'submit-key-0002').expect(409);
    expect(sameContact.body.error.code).toBe('APPLICATION_ALREADY_PENDING');
    const sameIdentity = await submit(application, applicationBody({ contactValue: 'second@example.test' }), 'submit-key-0003').expect(409);
    expect(sameIdentity.body.error.code).toBe('APPLICATION_ALREADY_PENDING');
    expect(JSON.stringify(sameContact.body)).not.toMatch(/sitter@example|012345678901|987654321098/i);
    expect(await User.countDocuments({})).toBe(0);
  });

  test('serializes concurrent duplicate submissions with the unique pending-key indexes', async () => {
    const application = app();
    const bodies = [applicationBody(), applicationBody({ contactValue: 'second@example.test' })];
    const responses = await Promise.all(bodies.map((body, index) => submit(application, body, `race-key-000${index + 1}`)));
    expect(responses.filter(response => response.status === 201)).toHaveLength(1);
    expect(responses.filter(response => response.status === 409)).toHaveLength(1);
    expect(await sitterApplicationModels(connection).SitterApplication.countDocuments({ state: 'PENDING' })).toBe(1);
  });

  test('enforces the rejection waiting period and permits a new submission at the exact eligible instant', async () => {
    const application = app();
    const submitted = await submit(application, applicationBody()).expect(201);
    const admin = await login('ADMIN');
    await request(application).post(`/api/v1/applications/${submitted.body.data.id}/decisions`)
      .set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1')
      .set('Idempotency-Key', 'decision-reject-0001')
      .send({ action: 'REJECT', reason: 'Cần bổ sung hồ sơ kinh nghiệm.', expectedVersion: 0 }).expect(200);
    const eligibleAt = clockNow + 30 * 24 * 60 * 60 * 1000;
    await submit(application, applicationBody(), 'submit-key-after-reject').expect(409);
    clockNow = eligibleAt;
    const newApplication = await submit(application, applicationBody(), 'submit-key-after-wait').expect(201);
    expect(newApplication.body.data.id).not.toBe(submitted.body.data.id);
  });
});

describe('P16 Admin application review and private documents', () => {
  test('denies Customer and unauthenticated reads; Admin receives no raw identity number', async () => {
    const events = [];
    const application = app({ logger: event => events.push(event) });
    const submitted = await submit(application, applicationBody()).expect(201);
    await request(application).get('/api/v1/applications').expect(401);
    const customer = await login('CUSTOMER');
    await request(application).get('/api/v1/applications').set('Cookie', customer.cookie).expect(403);

    const admin = await login('ADMIN');
    const list = await request(application).get('/api/v1/applications?state=PENDING')
      .set('Cookie', admin.cookie).expect(200);
    expect(list.body.data.applications[0]).toMatchObject({ displayName: 'Nguyễn Văn A', state: 'PENDING' });
    expect(list.body.data.applications[0].contact.maskedValue).toBe('s•••@example.test');
    expect(JSON.stringify(list.body)).not.toContain('012345678901');

    const detail = await request(application).get(`/api/v1/applications/${submitted.body.data.id}`)
      .set('Cookie', admin.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.contact.value).toBe('sitter@example.test');
    expect(JSON.stringify(detail.body)).not.toContain('012345678901');
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({
      resourceId: submitted.body.data.id, action: 'APPLICATION_VIEWED'
    })).toBe(1);
  });

  test('approves atomically, creates one Sitter User without an unverified Contact/session, and replays one decision audit', async () => {
    const application = app();
    const submitted = await submit(application, applicationBody()).expect(201);
    const admin = await login('ADMIN');
    const path = `/api/v1/applications/${submitted.body.data.id}/decisions`;
    const sendDecision = body => request(application).post(path).set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1')
      .set('Idempotency-Key', 'decision-approve-001').send(body);
    const decision = { action: 'APPROVE', reason: 'Phỏng vấn và hồ sơ đạt yêu cầu.', expectedVersion: 0 };
    const first = await sendDecision(decision).expect(200);
    expect(first.body.data).toMatchObject({ state: 'APPROVED', replayed: false, onboarding: 'CONTACT_VERIFICATION_PENDING' });
    const sitter = await User.findOne({ roles: ['PET_SITTER'], state: 'ACTIVE' });
    expect(sitter).not.toBeNull();
    expect(await sitterApplicationModels(connection).SitterStatus.findOne({ userId: sitter._id }).lean())
      .toMatchObject({ status: 'ACTIVE', version: 0 });
    expect(await Contact.countDocuments({})).toBe(0);
    expect(await models.AuthSession.countDocuments({ userId: sitter._id })).toBe(0);
    const replay = await sendDecision(decision).expect(200);
    expect(replay.body.data).toMatchObject({ id: first.body.data.id, state: 'APPROVED', replayed: true });
    expect(await User.countDocuments({ roles: ['PET_SITTER'] })).toBe(1);
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({ action: 'APPLICATION_DECIDED' })).toBe(1);
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({
      resourceId: submitted.body.data.id, action: 'APPLICATION_DECIDED', reasonDigest: { $exists: true }
    })).toBe(1);
  });

  test('suspends and reinstates an approved Sitter without locking the account or revoking its session', async () => {
    const application = app();
    const submitted = await submit(application, applicationBody()).expect(201);
    const admin = await login('ADMIN');
    await request(application).post(`/api/v1/applications/${submitted.body.data.id}/decisions`)
      .set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1')
      .set('Idempotency-Key', 'decision-approve-status')
      .send({ action: 'APPROVE', reason: 'Hồ sơ đạt yêu cầu.', expectedVersion: 0 }).expect(200);

    const sitter = await User.findOne({ roles: ['PET_SITTER'] });
    const sessionService = createSessionService({ connection, User, models,
      tokenSecret: SECRETS.SESSION_TOKEN_SECRET, csrfSecret: SECRETS.SESSION_CSRF_SECRET, clock: () => clockNow });
    let issued;
    await connection.transaction(async session => { issued = await sessionService.issueInTransaction(sitter, session); });
    const statusPath = `/api/v1/applications/${submitted.body.data.id}/sitter-status`;
    const changeStatus = (key, body) => request(application).post(statusPath)
      .set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1')
      .set('Idempotency-Key', key).send(body);

    const suspension = { action: 'SUSPEND', reason: 'Đang rà soát hồ sơ cập nhật.', expectedVersion: 0 };
    const suspended = await changeStatus('sitter-suspend-0001', suspension).expect(200);
    expect(suspended.body.data).toMatchObject({ status: 'SUSPENDED', version: 1, replayed: false });
    const replay = await changeStatus('sitter-suspend-0001', suspension).expect(200);
    expect(replay.body.data).toMatchObject({ status: 'SUSPENDED', version: 1, replayed: true });
    expect(await User.findById(sitter._id).lean()).toMatchObject({ state: 'ACTIVE', authEpoch: 0 });
    expect(await models.AuthSession.countDocuments({ userId: sitter._id, revokedAt: null })).toBe(1);
    await request(application).get('/api/v1/applications').set('Cookie', `pwc_session=${issued.token}`).expect(403);

    const detail = await request(application).get(`/api/v1/applications/${submitted.body.data.id}`)
      .set('Cookie', admin.cookie).expect(200);
    expect(detail.body.data.sitterStatus).toMatchObject({ status: 'SUSPENDED', reason: suspension.reason, version: 1 });
    const reinstated = await changeStatus('sitter-reinstate-0001', {
      action: 'REINSTATE', reason: 'Rà soát hoàn tất.', expectedVersion: 1
    }).expect(200);
    expect(reinstated.body.data).toMatchObject({ status: 'ACTIVE', version: 2, replayed: false });
    expect(await models.AuthSession.countDocuments({ userId: sitter._id, revokedAt: null })).toBe(1);
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({
      resourceId: submitted.body.data.id, action: { $in: ['SITTER_SUSPENDED', 'SITTER_REINSTATED'] }
    })).toBe(2);
  });

  test('rejects stale/concurrent decisions and never creates an account for rejection', async () => {
    const application = app();
    const submitted = await submit(application, applicationBody()).expect(201);
    const admin = await login('ADMIN');
    const path = `/api/v1/applications/${submitted.body.data.id}/decisions`;
    const decide = (key, action) => request(application).post(path).set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf).set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1').set('Idempotency-Key', key)
      .send({ action, reason: 'Không phù hợp tiêu chí hiện tại.', expectedVersion: 0 });
    const responses = await Promise.all([decide('decision-race-0001', 'REJECT'), decide('decision-race-0002', 'APPROVE')]);
    expect(responses.map(response => response.status)).toEqual(expect.arrayContaining([200, 409]));
    const saved = await sitterApplicationModels(connection).SitterApplication.findById(submitted.body.data.id).lean();
    if (saved.state === 'REJECTED') expect(await User.countDocuments({ roles: ['PET_SITTER'] })).toBe(0);
    expect(saved.state === 'APPROVED' || saved.state === 'REJECTED').toBe(true);
  });

  test('requires Admin for private documents, audits access, returns no-store short-lived capabilities and enforces a view limit', async () => {
    const mediaSpy = jest.spyOn(mediaPort, 'createReadCapability');
    const application = app();
    const submitted = await submit(application, applicationBody()).expect(201);
    const admin = await login('ADMIN');
    const customer = await login('CUSTOMER');
    const path = `/api/v1/applications/${submitted.body.data.id}/documents/identity-document`;
    await request(application).get(path).set('Cookie', customer.cookie).expect(403);
    expect(mediaSpy).not.toHaveBeenCalled();

    const first = await request(application).get(path).set('Cookie', admin.cookie);
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe(`https://private.example.test/${IDENTITY_REF}`);
    expect(first.headers['cache-control']).toMatch(/no-store/);
    expect(first.headers['referrer-policy']).toBe('no-referrer');
    expect(mediaSpy).toHaveBeenCalledTimes(1);
    expect(await sitterApplicationModels(connection).SitterApplicationAudit.countDocuments({
      resourceId: submitted.body.data.id, action: 'APPLICATION_DOCUMENT_REQUESTED'
    })).toBe(1);
    for (let index = 1; index < 20; index += 1) await request(application).get(path).set('Cookie', admin.cookie).expect(302);
    await request(application).get(path).set('Cookie', admin.cookie).expect(429);
    expect(mediaSpy).toHaveBeenCalledTimes(20);
  });
});


describe('P46 composed applicant status runtime', () => {
  async function setup({ failed = false, body = applicationBody() } = {}) {
    const sent = [];
    const instance = app({ contactDelivery: { send: async command => {
      sent.push(command); return { status: failed ? 'FAILED' : 'ACCEPTED' };
    } } });
    const receipt = (await submit(instance, body).expect(201)).body.data;
    const begin = code => request(instance).post('/api/v1/application-status/challenges')
      .send({ applicationCode: code ?? receipt.applicationCode });
    const verify = (challenge, overrides = {}) => request(instance).post('/api/v1/application-status/verify')
      .send({ applicationCode: receipt.applicationCode, challengeId: challenge.challengeId,
        code: sent.at(-1)?.code, ...overrides });
    return { instance, receipt, sent, begin, verify };
  }

  test('issues secret receipt, delivers bound OTP, returns status only and consumes once without account/session', async () => {
    const f = await setup();
    expect(f.receipt.applicationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await sitterApplicationModels(connection).SitterApplication.findById(f.receipt.id)
      .select('+trackingCodeDigest').lean();
    expect(stored.trackingCodeDigest).not.toBe(f.receipt.applicationCode);
    const challenge = (await f.begin().expect(202)).body.data;
    expect(f.sent[0]).toMatchObject({ to: 'sitter@example.test', purpose: 'APPLICATION_STATUS' });
    const result = await f.verify(challenge).expect(200);
    expect(Object.keys(result.body.data).sort()).toEqual(['canReapply', 'reapplyEligibleAt', 'rejectionReason', 'state', 'submittedAt']);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie']).toBeUndefined();
    await f.verify(challenge).expect(401);
    expect(await User.countDocuments()).toBe(0);
    expect(await models.AuthSession.countDocuments()).toBe(0);
  });

  test('unknown code has identical challenge shape and cooldown without delivery or status disclosure', async () => {
    const f = await setup();
    const known = (await f.begin().expect(202)).body.data;
    const unknown = (await f.begin('x'.repeat(43)).expect(202)).body.data;
    expect(Object.keys(unknown)).toEqual(Object.keys(known));
    expect(unknown.expiresInSeconds).toBe(known.expiresInSeconds);
    expect(f.sent).toHaveLength(1);
    await f.begin('x'.repeat(43)).expect(429);
    await f.verify(known, { applicationCode: 'x'.repeat(43) }).expect(401);
    await f.verify(known).expect(200);
  });

  test('rejects cross-application OTP even for the same submitted contact', async () => {
    const f = await setup();
    const challenge = (await f.begin().expect(202)).body.data;
    const Applicant = sitterApplicationModels(connection).SitterApplication;
    const source = await Applicant.findById(f.receipt.id).select('+contactCiphertext +contactLookupKey +identityLookupKey +submissionKeyDigest +submissionPayloadDigest +privateDocuments.storageRef').lean();
    const copy = { ...source };
    delete copy._id;
    const secondCode = 'z'.repeat(43);
    const { createHmac } = await import('node:crypto');
    await Applicant.create({ ...copy, activePendingContactKey: undefined, activePendingIdentityKey: undefined,
      submissionKeyDigest: 'synthetic-second-submission', trackingCodeDigest: createHmac('sha256', SECRETS.CONTACT_LOOKUP_SECRET)
        .update(`application-tracking\0${secondCode}`).digest('hex') });
    await f.verify(challenge, { applicationCode: secondCode }).expect(401);
    await f.verify(challenge).expect(200);
  });

  test('exact expiry and five wrong attempts fail closed; lockout blocks resend', async () => {
    const f = await setup();
    const first = (await f.begin().expect(202)).body.data;
    clockNow += 300000;
    await f.verify(first).expect(401);
    const second = (await f.begin().expect(202)).body.data;
    const wrong = f.sent.at(-1).code === '000000' ? '999999' : '000000';
    for (let i = 0; i < 5; i++) await f.verify(second, { code: wrong }).expect(401);
    await f.verify(second).expect(429);
    await f.begin().expect(429);
    clockNow += 900000;
    const third = (await f.begin().expect(202)).body.data;
    await f.verify(third).expect(200);
  });

  test('resend invalidates old code and rolling hour permits at most five sends', async () => {
    const f = await setup();
    const first = (await f.begin().expect(202)).body.data;
    await f.begin().expect(429);
    clockNow += 60000;
    const second = (await f.begin().expect(202)).body.data;
    await f.verify(first).expect(401);
    for (let i = 0; i < 3; i++) { clockNow += 60000; await f.begin().expect(202); }
    clockNow += 60000;
    await f.begin().expect(429);
    await f.verify(second).expect(401);
  });

  test('concurrent sends reserve only one challenge and concurrent verification grants only once', async () => {
    const f = await setup();
    const started = await Promise.all([f.begin(), f.begin()]);
    expect(started.map(value => value.status).sort()).toEqual([202, 429]);
    expect(f.sent).toHaveLength(1);
    const challenge = started.find(value => value.status === 202).body.data;
    const verified = await Promise.all([f.verify(challenge), f.verify(challenge)]);
    expect(verified.map(value => value.status).sort()).toEqual([200, 401]);
  });

  test('provider failure keeps generic response but invalidates the undelivered challenge', async () => {
    const f = await setup({ failed: true });
    const challenge = (await f.begin().expect(202)).body.data;
    await f.verify(challenge).expect(401);
    expect(await models.OtpChallenge.countDocuments({ invalidationReason: 'DELIVERY_FAILED' })).toBe(1);
  });

  test('rejects cross-origin requests and never accepts scope through general OTP API', async () => {
    const f = await setup();
    await request(f.instance).post('/api/v1/application-status/challenges').set('Origin', 'https://attacker.example')
      .send({ applicationCode: f.receipt.applicationCode }).expect(403);
    await request(f.instance).post('/api/v1/otp-challenges').send({ channel: 'EMAIL',
      contact: 'sitter@example.test', purpose: 'APPLICATION_STATUS' }).expect(422);
  });

  test('Admin can advance interview once with version and audit; applicant sees INTERVIEW', async () => {
    const f = await setup();
    const admin = await login();
    const transition = (path, version, key) => request(f.instance).post(`/api/v1/applications/${f.receipt.id}/${path}`)
      .set('Cookie', admin.cookie).set('X-CSRF-Token', admin.csrf).set('Idempotency-Key', key)
      .set('Origin', 'http://127.0.0.1').set('Host', '127.0.0.1')
      .send({ expectedVersion: version });
    await transition('review', 0, 'review-interview-1').expect(200);
    await transition('interview', 1, 'interview-step-1').expect(200);
    await transition('interview', 1, 'interview-step-1').expect(200);
    await transition('interview', 1, 'interview-step-2').expect(409);
    const challenge = (await f.begin().expect(202)).body.data;
    expect((await f.verify(challenge).expect(200)).body.data.state).toBe('INTERVIEW');
  });
});


test('P46 rejected applicant receives reason and exact 30-day server deadline, never internal interview notes', async () => {
  const sent = [];
  const instance = app({ contactDelivery: { send: async value => { sent.push(value); return { status: 'ACCEPTED' }; } } });
  const receipt = (await submit(instance, applicationBody()).expect(201)).body.data;
  const rejection = new Date(clockNow - 30 * 86400000);
  await sitterApplicationModels(connection).SitterApplication.updateOne({ _id: receipt.id }, { $set: {
    state: 'REJECTED', decisionReason: 'Thiếu kinh nghiệm', rejectedAt: rejection,
    reapplyAt: new Date(clockNow), interviewNote: 'Private internal note'
  } });
  const challenge = (await request(instance).post('/api/v1/application-status/challenges')
    .send({ applicationCode: receipt.applicationCode }).expect(202)).body.data;
  const status = await request(instance).post('/api/v1/application-status/verify')
    .send({ applicationCode: receipt.applicationCode, challengeId: challenge.challengeId, code: sent[0].code }).expect(200);
  expect(status.body.data).toMatchObject({ state: 'REJECTED', rejectionReason: 'Thiếu kinh nghiệm',
    canReapply: true, reapplyEligibleAt: new Date(clockNow).toISOString() });
  expect(JSON.stringify(status.body)).not.toContain('Private internal note');
});
