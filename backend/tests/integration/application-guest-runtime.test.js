import { beforeAll, beforeEach, afterAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createSessionService } from '../../src/services/session.service.js';
import { employmentTerms } from '../fixtures/employment-terms.js';
import { assessmentInput } from '../fixtures/application-assessment.js';
import { createApplicationMailService } from '../../src/services/applications/application-mail.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';

const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true', RATE_LIMIT_MAX: '1000',
  OTP_HMAC_SECRET: 'a'.repeat(32), SESSION_TOKEN_SECRET: 'b'.repeat(32), SESSION_CSRF_SECRET: 'c'.repeat(32),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32), R2_ENABLED: 'true',
  R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'synthetic-private', R2_ACCESS_KEY_ID: 'b'.repeat(32),
  R2_SECRET_ACCESS_KEY: 'c'.repeat(64), SITTER_DOCUMENTS_ENABLED: 'true' };
const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
let replica, connection, app, png, sent, mails, now;
const col = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'pwc_guest_application_test';
  connection = await connectDatabase(loadConfig(env));
  const objects = new Map();
  app = createApp({ config: loadConfig(env), connection, env, clock: () => now, lifecycle: { draining: false }, portOverrides: {
    contactDelivery: { send: async command => { sent.push(command); return { status: 'ACCEPTED' }; } },
    notificationDelivery: { send: async command => { mails.push(command); return { status: 'ACCEPTED' }; } },
    applicantDocuments: { upload: async ({ storageRef, body, contentType }) => objects.set(storageRef, { body, contentType }),
      read: async ({ storageRef }) => objects.get(storageRef) }
  } });
  await Promise.all(Object.values(connection.models).map(model => model.syncIndexes()));
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#dcf2e8' } }).png().toBuffer();
}, 600000);
beforeEach(async () => {
  now = Date.now() + 86400000; sent = []; mails = [];
  await Promise.all(Object.values(connection.models).map(model => model.deleteMany({})));
  await publicPolicyVersionModel(connection).create(['terms', 'privacy'].map(slug => ({ slug, versionId: 'synthetic-v1',
    title: 'Synthetic', purpose: 'Test only', sourceRef: 'synthetic-test', contentHash: 'synthetic-hash', sections: [],
    status: 'APPROVED', approvedBy: 'Synthetic fixture', approvedAt: new Date('2020-01-01'), effectiveAt: new Date('2020-01-01') })));
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
async function intake() {
  const agent = request.agent(app);
  const opened = await agent.get('/api/v1/applications/intake').set(base).expect(200);
  const headers = { ...base, 'X-Application-Token': opened.body.data.csrfToken };
  const documents = [];
  for (const documentType of ['IDENTITY_FRONT', 'IDENTITY_BACK', 'PORTRAIT']) {
    const image = await agent.post('/api/v1/applicant-documents').set(headers).set('Content-Type', 'image/png')
      .set('Idempotency-Key', `synthetic-upload-${documentType}`).send(png).expect(201);
    documents.push({ documentId: image.body.data.id, storageRef: image.body.data.id, documentType });
  }
  const body = { displayName: 'Ứng viên kiểm thử', email: 'guest@example.test', phone: '0912345678', dateOfBirth: '1990-04-12',
    identityNumber: '012345678901', experience: 'Kinh nghiệm chăm sóc chó mèo tại nhà.', requestedServices: ['Dắt chó đi dạo'],
    workAreas: ['Hà Nội'], employmentType: 'FULL_TIME', documents, policyVersions: { terms: 'synthetic-v1', privacy: 'synthetic-v1' } };
  const submit = (payload = body, key = 'synthetic-application-guest') => agent.post('/api/v1/applications').set(headers).set('Idempotency-Key', key).send(payload);
  return { agent, body, headers, submit };
}

test('UC-16 / GBR-25 / GBR-28: Guest applies, Admin approves, then the new Sitter verifies email and signs in', async () => {
  const guest = await intake();
  expect(await col('users').countDocuments()).toBe(0);
  expect(await col('authsessions').countDocuments()).toBe(0);
  const created = (await guest.submit().expect(201)).body.data;
  await guest.submit().expect(200);
  expect(await col('sitterapplications').countDocuments()).toBe(1);
  expect(await col('users').countDocuments()).toBe(0);
  expect(await col('contacts').countDocuments()).toBe(0);
  await guest.agent.post('/api/v1/otp-challenges').set(base).send({ channel: 'EMAIL', contact: guest.body.email, purpose: 'LOGIN' }).expect(409);
  const mail = createApplicationMailService({ connection, clock: () => now,
    contactCrypto: createContactCrypto({ lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY }),
    delivery: { send: async command => { mails.push(command); return { status: 'ACCEPTED' }; } } });
  expect(await mail.runBatch()).toMatchObject({ accepted: 1 });
  expect(mails[0]).toMatchObject({ to: guest.body.email, applicationState: 'PENDING' });
  const user = await userModel(connection).create({ displayName: 'Synthetic Admin', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  let session;
  const sessions = createSessionService({ connection, clock: () => now, tokenSecret: env.SESSION_TOKEN_SECRET, csrfSecret: env.SESSION_CSRF_SECRET });
  await connection.transaction(async mongoSession => { session = await sessions.issueInTransaction(user, mongoSession); });
  const admin = { ...base, Cookie: `pwc_session=${session.token}`, 'X-CSRF-Token': session.csrfToken };
  const root = `/api/v1/applications/${created.id}`;
  await request(app).get(root).set(admin).expect(200).expect(res => expect(res.body.data.phoneNumber).toBe('+84912345678'));
  for (const [stage, expectedVersion] of [['review', 0], ['interview', 1]]) {
    if (stage === 'interview') await request(app).patch(`${root}/assessment`).set(admin)
      .set('Idempotency-Key', 'synthetic-review-assessment').send(assessmentInput(1, 0)).expect(200);
    await request(app).post(`${root}/${stage}`).set(admin).set('Idempotency-Key', `synthetic-${stage}`).send({ expectedVersion }).expect(200);
  }
  const signedOn = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
  const effectiveOn = new Date(now + 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  const contract = (await request(app).post(`${root}/employment-contract`).set(admin).set('Idempotency-Key', 'synthetic-contract')
    .send({ applicationVersion: 2, expectedRevision: 0, terms: employmentTerms({ identityNumber: guest.body.identityNumber, plannedSigningOn: signedOn, effectiveOn }) }).expect(201)).body.data;
  const decisionPath = `${root}/employment-contract/${contract.id}/decisions`;
  await request(app).post(decisionPath).set(admin).set('Idempotency-Key', 'synthetic-issue').send({ action: 'ISSUE', termsHash: contract.termsHash }).expect(200);
  await request(app).post(decisionPath).set(admin).set('Idempotency-Key', 'synthetic-sign').send({ action: 'SIGN', termsHash: contract.termsHash,
    signedOn, archiveReference: 'Synthetic archive', bothPartiesSigned: true }).expect(200);
  await request(app).patch(`${root}/assessment`).set(admin)
    .set('Idempotency-Key', 'synthetic-passed-interview').send(assessmentInput(2, 1, {
      callAt: new Date(now).toISOString(), outcome: 'PASSED'
    })).expect(200);
  const approved = (await request(app).post(`${root}/decisions`).set(admin).set('Idempotency-Key', 'synthetic-approve')
    .send({ action: 'APPROVE', expectedVersion: 2, reason: 'Synthetic review passed' }).expect(200)).body.data;
  expect(await col('users').countDocuments()).toBe(2);
  expect(await col('contacts').countDocuments()).toBe(0);
  await guest.agent.get('/api/v1/me').expect(401);
  const challenge = (await guest.agent.post('/api/v1/otp-challenges').set(base).send({ channel: 'EMAIL', contact: guest.body.email, purpose: 'LOGIN' }).expect(202)).body.data;
  const validCode = sent.at(-1).code;
  await guest.agent.post('/api/v1/sessions').set(base).send({ channel: 'EMAIL', contact: guest.body.email, purpose: 'LOGIN',
    challengeId: challenge.challengeId, code: validCode === '000000' ? '000001' : '000000' }).expect(400);
  expect(await col('contacts').countDocuments()).toBe(0);
  await guest.agent.post('/api/v1/sessions').set(base).send({ channel: 'EMAIL', contact: guest.body.email, purpose: 'LOGIN', challengeId: challenge.challengeId, code: sent.at(-1).code })
    .expect(200).expect(res => { expect(res.body.data.user.id).toBe(approved.userId); expect(res.body.data.user.roles).toEqual(['PET_SITTER']); });
  expect(await col('contacts').countDocuments({ state: 'VERIFIED' })).toBe(1);
  await guest.agent.get('/api/v1/me').expect(200);
  const phoneChallenge = (await guest.agent.post('/api/v1/otp-challenges').set(base).send({ channel: 'PHONE', contact: '+84912345678', purpose: 'LOGIN' }).expect(202)).body.data;
  await guest.agent.post('/api/v1/sessions').set(base).send({ channel: 'PHONE', contact: '+84912345678', purpose: 'LOGIN',
    challengeId: phoneChallenge.challengeId, code: sent.at(-1).code }).expect(200).expect(res => expect(res.body.data.user.id).toBe(approved.userId));
  await guest.agent.get('/api/v1/applications/me').expect(200).expect(res => expect(res.body.data.application.id).toBe(created.id));
  expect(await col('users').countDocuments()).toBe(2);
  expect(await col('contacts').countDocuments({ state: 'VERIFIED' })).toBe(2);
});

test('Guest intake prevents cross-origin upload, missing capability, foreign documents and incomplete contacts', async () => {
  const guest = await intake();
  await request(app).post('/api/v1/applications').set(base).send(guest.body).expect(403);
  await guest.agent.post('/api/v1/applicant-documents').set({ ...guest.headers, Origin: 'https://evil.example.test' }).send(png).expect(403);
  await guest.submit({ ...guest.body, phone: undefined }).expect(422);
  await guest.submit({ ...guest.body, email: undefined }).expect(422);
  const stranger = await intake();
  await stranger.submit({ ...guest.body, documents: guest.body.documents }).expect(403);
  expect(await col('sitterapplications').countDocuments()).toBe(0);
  expect(await col('users').countDocuments()).toBe(0);
});

test('ST-ONB-08 (R3): unauthenticated guest receives MSG40 for email or phone belonging to a verified account', async () => {
  const guest = await intake();
  const User = userModel(connection);
  const owner = await User.create({ displayName: 'Synthetic Customer', roles: ['CUSTOMER'], state: 'ACTIVE' });
  const crypto = createContactCrypto({ lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY });
  const emailContact = crypto.lookup('EMAIL', guest.body.email);
  const phoneContact = crypto.lookup('PHONE', '+84912345678');
  await identityModels(connection).Contact.create([
    {
      channel: 'EMAIL', userId: owner._id, state: 'VERIFIED', lookupKey: emailContact.lookupKey,
      canonicalCiphertext: crypto.encrypt(emailContact.canonicalValue), verifiedAt: new Date(now)
    },
    {
      channel: 'PHONE', userId: owner._id, state: 'VERIFIED', lookupKey: phoneContact.lookupKey,
      canonicalCiphertext: crypto.encrypt(phoneContact.canonicalValue), verifiedAt: new Date(now)
    }
  ]);

  const emailConflict = await guest.submit({ ...guest.body, phone: '0987654321' }, 'guest-taken-email').expect(409);
  expect(emailConflict.body.error).toMatchObject({
    code: 'CONTACT_UNAVAILABLE',
    conflictField: 'email',
    fieldErrors: { email: 'Email này đã thuộc về một tài khoản. Vui lòng dùng email khác.' }
  });

  const phoneConflict = await guest.submit({ ...guest.body, email: 'fresh-guest@example.test' }, 'guest-taken-phone').expect(409);
  expect(phoneConflict.body.error).toMatchObject({
    code: 'CONTACT_UNAVAILABLE',
    conflictField: 'phone',
    fieldErrors: { phone: 'Số điện thoại này đã thuộc về một tài khoản. Vui lòng dùng số điện thoại khác.' }
  });
  expect(await col('sitterapplications').countDocuments()).toBe(0);
});

test('ST-ONB-08 (R3): approved application with provisioned account returns MSG40 for email or phone and generic conflict for identityNumber', async () => {
  const first = await intake();
  const created = (await first.submit(first.body, 'approved-source-app').expect(201)).body.data;
  const provisionedUser = await userModel(connection).create({
    displayName: 'Provisioned Sitter', roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
  });
  await col('sitterapplications').updateOne(
    { _id: (await col('sitterapplications').findOne({ _id: { $exists: true } }))._id },
    {
      $set: { state: 'APPROVED', provisionedUserId: provisionedUser._id },
      $unset: { activePendingContactKey: '', activePendingContactKeys: '', activePendingIdentityKey: '' }
    }
  );
  expect(created.id).toBeTruthy();
  expect(await col('contacts').countDocuments()).toBe(0);

  const second = await intake();
  const emailConflict = await second.submit({
    ...second.body, email: first.body.email, phone: '0987654321', identityNumber: '987654321098'
  }, 'approved-conflict-email').expect(409);
  expect(emailConflict.body.error).toMatchObject({
    code: 'CONTACT_UNAVAILABLE',
    conflictField: 'email',
    fieldErrors: { email: 'Email này đã thuộc về một tài khoản. Vui lòng dùng email khác.' }
  });

  const phoneConflict = await second.submit({
    ...second.body, email: 'other-email@example.test', phone: first.body.phone, identityNumber: '987654321098'
  }, 'approved-conflict-phone').expect(409);
  expect(phoneConflict.body.error).toMatchObject({
    code: 'CONTACT_UNAVAILABLE',
    conflictField: 'phone',
    fieldErrors: { phone: 'Số điện thoại này đã thuộc về một tài khoản. Vui lòng dùng số điện thoại khác.' }
  });

  const identityConflict = await second.submit({
    ...second.body, email: 'other-email-2@example.test', phone: '0987654322', identityNumber: first.body.identityNumber
  }, 'approved-conflict-identity').expect(409);
  expect(identityConflict.body.error).toEqual({
    code: 'APPLICATION_SUBMISSION_UNAVAILABLE',
    message: 'An application cannot be submitted at this time'
  });
  expect(await col('sitterapplications').countDocuments()).toBe(1);
});

test('ST-ONB-08 (R3): counter-created customer with UNVERIFIED phone blocks sitter application with MSG40', async () => {
  const guest = await intake();
  const User = userModel(connection);
  const staff = await User.create({
    displayName: 'Synthetic Staff', roles: ['SALE_STAFF'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
  });
  const counterCustomer = await User.create({
    displayName: 'Synthetic Counter Customer', roles: ['CUSTOMER'], state: 'ACTIVE',
    authEpoch: 0, version: 0, synthetic: false, createdChannel: 'COUNTER', createdBy: staff._id
  });
  const crypto = createContactCrypto({ lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY });
  const phoneContact = crypto.lookup('PHONE', '+84912345678');
  await identityModels(connection).Contact.create({
    channel: 'PHONE', userId: counterCustomer._id, state: 'UNVERIFIED', lookupKey: phoneContact.lookupKey,
    canonicalCiphertext: crypto.encrypt(phoneContact.canonicalValue)
  });

  const phoneConflict = await guest.submit({
    ...guest.body, email: 'fresh-counter-check@example.test', phone: '0912345678'
  }, 'counter-unverified-phone-conflict').expect(409);
  expect(phoneConflict.body.error).toMatchObject({
    code: 'CONTACT_UNAVAILABLE',
    conflictField: 'phone',
    fieldErrors: { phone: 'Số điện thoại này đã thuộc về một tài khoản. Vui lòng dùng số điện thoại khác.' }
  });
  expect(await col('sitterapplications').countDocuments()).toBe(0);
});

test('decide() blocks approving a guest application when its phone belongs to an UNVERIFIED counter customer contact', async () => {
  const guest = await intake();
  const created = (await guest.submit(guest.body, 'pending-before-counter').expect(201)).body.data;
  const User = userModel(connection);
  const adminUser = await User.create({
    displayName: 'Synthetic Admin', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
  });
  const sessions = createSessionService({ connection, clock: () => now, tokenSecret: env.SESSION_TOKEN_SECRET, csrfSecret: env.SESSION_CSRF_SECRET });
  let session;
  await connection.transaction(async mongoSession => { session = await sessions.issueInTransaction(adminUser, mongoSession); });
  const admin = { ...base, Cookie: `pwc_session=${session.token}`, 'X-CSRF-Token': session.csrfToken };
  const root = `/api/v1/applications/${created.id}`;
  await request(app).post(`${root}/review`).set(admin).set('Idempotency-Key', 'uv-review-01').send({ expectedVersion: 0 }).expect(200);
  await request(app).patch(`${root}/assessment`).set(admin).set('Idempotency-Key', 'uv-assess-01').send(assessmentInput(1, 0)).expect(200);
  await request(app).post(`${root}/interview`).set(admin).set('Idempotency-Key', 'uv-interview-01').send({ expectedVersion: 1 }).expect(200);
  const signedOn = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
  const effectiveOn = new Date(now + 86400000 + 7 * 3600000).toISOString().slice(0, 10);
  const contract = (await request(app).post(`${root}/employment-contract`).set(admin).set('Idempotency-Key', 'uv-contract-01')
    .send({ applicationVersion: 2, expectedRevision: 0, terms: employmentTerms({ identityNumber: guest.body.identityNumber, plannedSigningOn: signedOn, effectiveOn }) }).expect(201)).body.data;
  const decisionPath = `${root}/employment-contract/${contract.id}/decisions`;
  await request(app).post(decisionPath).set(admin).set('Idempotency-Key', 'uv-issue-01').send({ action: 'ISSUE', termsHash: contract.termsHash }).expect(200);
  await request(app).post(decisionPath).set(admin).set('Idempotency-Key', 'uv-sign-01').send({
    action: 'SIGN', termsHash: contract.termsHash, signedOn, archiveReference: 'Synthetic archive', bothPartiesSigned: true
  }).expect(200);
  await request(app).patch(`${root}/assessment`).set(admin).set('Idempotency-Key', 'uv-assess-02').send(assessmentInput(2, 1, {
    callAt: new Date(now).toISOString(), outcome: 'PASSED'
  })).expect(200);

  const staff = await User.create({
    displayName: 'Synthetic Staff', roles: ['SALE_STAFF'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false
  });
  const counterCustomer = await User.create({
    displayName: 'Synthetic Counter Customer', roles: ['CUSTOMER'], state: 'ACTIVE',
    authEpoch: 0, version: 0, synthetic: false, createdChannel: 'COUNTER', createdBy: staff._id
  });
  const crypto = createContactCrypto({ lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY });
  const phoneContact = crypto.lookup('PHONE', '+84912345678');
  await identityModels(connection).Contact.create({
    channel: 'PHONE', userId: counterCustomer._id, state: 'UNVERIFIED', lookupKey: phoneContact.lookupKey,
    canonicalCiphertext: crypto.encrypt(phoneContact.canonicalValue)
  });

  const blocked = await request(app).post(`${root}/decisions`).set(admin).set('Idempotency-Key', 'uv-approve-01')
    .send({ action: 'APPROVE', expectedVersion: 2, reason: 'Synthetic review passed' }).expect(409);
  expect(blocked.body.error.code).toBe('APPLICATION_SUBMISSION_UNAVAILABLE');
  expect(await col('users').countDocuments({ roles: 'PET_SITTER' })).toBe(0);
});

test('an intake can recover its original receipt without exposing later status or authorizing a different intake', async () => {
  const a = await intake(), b = await intake();
  const created = await a.submit().expect(201);
  await col('sitterapplications').updateOne({ _id: (await col('sitterapplications').findOne({}))._id },
    { $set: { state: 'UNDER_REVIEW' } });
  const replay = await a.submit().expect(200);
  expect(replay.body.data).toEqual({ ...created.body.data, replayed: true });
  await b.submit(a.body).expect(403).expect(response => {
    expect(Object.keys(response.body.error).sort()).toEqual(['code', 'message']);
    expect(response.body).not.toHaveProperty('data');
  });
});

test('GBR-25: a pending email or phone cannot open another application, including concurrent submissions', async () => {
  const a = await intake(), b = await intake();
  const results = await Promise.all([a.submit(), b.submit({ ...b.body, email: 'other@example.test', identityNumber: '012345678902' }, 'synthetic-other-application')]);
  expect(results.map(res => res.status).sort()).toEqual([201, 409]);
  expect(results.find(res => res.status === 409).body.error).toEqual({
    code: 'APPLICATION_SUBMISSION_UNAVAILABLE', message: 'An application cannot be submitted at this time'
  });
  expect(await col('sitterapplications').countDocuments()).toBe(1);
  expect(await col('users').countDocuments()).toBe(0);
});
