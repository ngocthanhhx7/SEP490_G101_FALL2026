import { beforeAll, beforeEach, afterAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';
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

test('GBR-25: a pending email or phone cannot open another application, including concurrent submissions', async () => {
  const a = await intake(), b = await intake();
  const results = await Promise.all([a.submit(), b.submit({ ...b.body, email: 'other@example.test', identityNumber: '012345678902' }, 'synthetic-other-application')]);
  expect(results.map(res => res.status).sort()).toEqual([201, 409]);
  expect(await col('sitterapplications').countDocuments()).toBe(1);
  expect(await col('users').countDocuments()).toBe(0);
});
