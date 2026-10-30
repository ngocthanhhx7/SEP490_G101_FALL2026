import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { userModel } from '../../src/models/user.model.js';
import { publicPolicyVersionModel } from '../../src/models/public-policy-version.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { identityModels } from '../../src/models/identity.model.js';
import { privateImageModels, applicantDocumentModels } from '../../src/models/private-image.model.js';
import { createSessionService } from '../../src/services/session.service.js';

const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true',
  OTP_HMAC_SECRET: 'a'.repeat(32), SESSION_TOKEN_SECRET: 'b'.repeat(32), SESSION_CSRF_SECRET: 'c'.repeat(32),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32), R2_ENABLED: 'true',
  R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'synthetic-private', R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'c'.repeat(64), SITTER_DOCUMENTS_ENABLED: 'true' };
const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const policyVersions = { terms: 'synthetic-v1', privacy: 'synthetic-v1' };
let replica, connection, app, sent, png, writes, unavailable;
let clockNow = Date.now() + 86400000;

async function register(email = 'applicant@example.test') {
  const agent = request.agent(app);
  const challenge = await agent.post('/api/v1/otp-challenges').set(base).send({ channel: 'EMAIL', contact: email, purpose: 'REGISTER' }).expect(202);
  const result = await agent.post('/api/v1/otp-verifications').set(base).send({
    channel: 'EMAIL', contact: email, purpose: 'REGISTER', challengeId: challenge.body.data.challengeId,
    code: sent.at(-1).code, displayName: 'Ứng viên kiểm thử', policyVersions
  }).expect(200);
  return { agent, csrf: result.body.data.csrfToken, id: result.body.data.user.id, email, cookie: result.headers['set-cookie'][0].split(';')[0] };
}
async function upload(owner, key = 'synthetic-image-key-0001', status = 201) {
  const response = await owner.agent.post('/api/v1/applicant-documents').set({ ...base, 'X-CSRF-Token': owner.csrf,
    'Idempotency-Key': key, 'Content-Type': 'image/png' }).send(png).expect(status);
  return response.body.data.id;
}
function application(owner, documentId) {
  return { displayName: 'Ứng viên kiểm thử', contactChannel: 'EMAIL', contactValue: owner.email,
    dateOfBirth: '1998-04-12', identityNumber: 'TEST12345678', experience: 'Kinh nghiệm chăm sóc chó mèo tại nhà.',
    policyVersions, requestedServices: ['Dắt chó đi dạo'], workAreas: ['Khu vực kiểm thử, Hà Nội'],
    documents: [{ documentId, storageRef: documentId, documentType: 'IDENTITY' }] };
}
function submit(owner, body, key = 'synthetic-application-command-01') {
  return owner.agent.post('/api/v1/applications').set({ ...base, 'X-CSRF-Token': owner.csrf, 'Idempotency-Key': key }).send(body);
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'pwc_intake_runtime_test';
  connection = await connectDatabase(loadConfig(env));
  const objects = new Map();
  app = createApp({ config: loadConfig(env), connection, lifecycle: { draining: false }, env, clock: () => clockNow, portOverrides: {
    contactDelivery: { send: async command => { sent.push(command); return { status: 'ACCEPTED' }; } },
    applicantDocuments: {
      upload: async ({ storageRef, body, contentType }) => { if (unavailable) throw new Error('synthetic unavailable'); writes++; objects.set(storageRef, { body, contentType }); },
      read: async ({ storageRef }) => objects.get(storageRef),
      createReadCapability: async () => ({ url: 'https://private.example.test/short-lived', expiresAt: new Date(Date.now() + 60000).toISOString() })
    }
  } });
  await Promise.all(Object.values(connection.models).map(model => model.syncIndexes()));
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#dcf2e8' } }).png().toBuffer();
}, 600000);
beforeEach(async () => {
  await Promise.all(Object.values(connection.models).map(model => model.deleteMany({})));
  sent = []; writes = 0; unavailable = false; clockNow = Date.now() + 86400000;
  await publicPolicyVersionModel(connection).create(['terms', 'privacy'].map(slug => ({
    slug, versionId: 'synthetic-v1', title: 'Synthetic policy', purpose: 'Test fixture only', sourceRef: 'synthetic-test',
    contentHash: 'synthetic-content-hash', sections: [{ heading: 'Synthetic', paragraphs: ['Test only'] }], status: 'APPROVED',
    approvedBy: 'Synthetic fixture', approvedAt: new Date('2020-01-01'), effectiveAt: new Date('2020-01-01')
  })));
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('registration → private upload → application → scoped OTP status → approval → same-account sitter login', async () => {
  const owner = await register();
  const intake = await owner.agent.get('/api/v1/applications/intake').set(base).expect(200);
  expect(intake.body.data).toMatchObject({ contactValue: owner.email, uploadsAvailable: true, application: null });
  const documentId = await upload(owner);
  await upload(owner, 'synthetic-image-key-0001', 200);
  expect(writes).toBe(1);
  const body = application(owner, documentId);
  const created = await submit(owner, body).expect(201);
  expect(created.body.data.state).toBe('PENDING');
  expect(JSON.stringify(created.body)).not.toMatch(/TEST12345678|1998-04-12|private-images/);
  await submit(owner, body).expect(200);
  const { SitterApplication } = sitterApplicationModels(connection);
  expect(await SitterApplication.countDocuments()).toBe(1);
  const stored = await SitterApplication.findById(created.body.data.id).lean();
  expect(stored.policyConsents.map(receipt => receipt.slug).sort()).toEqual(['privacy', 'terms']);
  expect(stored.policyConsents.every(receipt => receipt.versionId === 'synthetic-v1')).toBe(true);
  expect((await userModel(connection).findById(owner.id)).roles).toEqual(['CUSTOMER']);
  const reopened = await owner.agent.get('/api/v1/applications/intake').expect(200);
  expect(reopened.body.data.application.applicationCode).toBe(created.body.data.applicationCode);
  const applicationCode = created.body.data.applicationCode;
  const statusChallenge = await request(app).post('/api/v1/application-status/challenges').set(base).send({ applicationCode }).expect(202);
  const statusCode = sent.at(-1).code;
  await request(app).post('/api/v1/application-status/verify').set(base).send({ applicationCode,
    challengeId: statusChallenge.body.data.challengeId, code: statusCode }).expect(200).expect(res => expect(res.body.data.state).toBe('PENDING'));
  const admin = await userModel(connection).create({ displayName: 'Synthetic Admin', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  const sessions = createSessionService({ connection, clock: () => clockNow, tokenSecret: env.SESSION_TOKEN_SECRET, csrfSecret: env.SESSION_CSRF_SECRET });
  let adminSession;
  await connection.transaction(async mongoSession => { adminSession = await sessions.issueInTransaction(admin, mongoSession); });
  const adminHeaders = { ...base, Cookie: `pwc_session=${adminSession.token}`, 'X-CSRF-Token': adminSession.csrfToken };
  await request(app).get(`/api/v1/applications/${created.body.data.id}/documents/${documentId}`).set(adminHeaders).expect(302);
  await request(app).post(`/api/v1/applications/${created.body.data.id}/decisions`).set({ ...adminHeaders, 'Idempotency-Key': 'synthetic-approve-0001' })
    .send({ action: 'APPROVE', expectedVersion: 0, reason: 'Synthetic review completed' }).expect(200)
    .expect(res => expect(res.body.data.userId).toBe(owner.id));
  expect(await userModel(connection).countDocuments()).toBe(2);
  await owner.agent.get('/api/v1/me').expect(401);
  clockNow += 61000; // Respect the real resend cooldown before the new login.
  const challenge = await owner.agent.post('/api/v1/otp-challenges').set(base).send({ channel: 'EMAIL', contact: owner.email, purpose: 'LOGIN' }).expect(202);
  await owner.agent.post('/api/v1/sessions').set(base).send({ channel: 'EMAIL', contact: owner.email, purpose: 'LOGIN', challengeId: challenge.body.data.challengeId, code: sent.at(-1).code }).expect(200)
    .expect(res => { expect(res.body.data.user.id).toBe(owner.id); expect(res.body.data.user.roles).toEqual(['CUSTOMER', 'PET_SITTER']); });
});

test('guest/CSRF/contact/foreign-file/underage/tampered-file checks prevent submission', async () => {
  await request(app).get('/api/v1/applications/intake').expect(401);
  await request(app).post('/api/v1/applications').set(base).send({}).expect(401);
  const owner = await register();
  await owner.agent.post('/api/v1/applications').set(base).send({}).expect(403);
  const documentId = await upload(owner);
  await submit(owner, application(owner, documentId)).set('Origin', 'https://untrusted.example.test').expect(403);
  await submit(owner, { ...application(owner, documentId), dateOfBirth: '2020-01-01' }).expect(422);
  await submit(owner, { ...application(owner, documentId), contactValue: 'unverified@example.test' }).expect(403);
  const other = await register('other@example.test');
  await submit(other, application(other, documentId), 'synthetic-other-application-01').expect(403);
  await owner.agent.post('/api/v1/applicant-documents').set({ ...base, 'X-CSRF-Token': owner.csrf,
    'Idempotency-Key': 'synthetic-bad-image-0001', 'Content-Type': 'image/png' }).send(Buffer.from('not an image')).expect(422);
  expect(await sitterApplicationModels(connection).SitterApplication.countDocuments()).toBe(0);
});

test('provider failure keeps the durable upload key retryable and never creates an application', async () => {
  const owner = await register();
  unavailable = true;
  const headers = { ...base, 'X-CSRF-Token': owner.csrf, 'Idempotency-Key': 'synthetic-image-retry-01', 'Content-Type': 'image/png' };
  await owner.agent.post('/api/v1/applicant-documents').set(headers).send(png).expect(503);
  expect(await sitterApplicationModels(connection).SitterApplication.countDocuments()).toBe(0);
  unavailable = false;
  const response = await owner.agent.post('/api/v1/applicant-documents').set(headers).send(png).expect(201);
  expect(response.body.data.state).toBe('READY');
});


test('missing or unapproved policy consent blocks application persistence', async () => {
  const owner = await register();
  const documentId = await upload(owner);
  await submit(owner, { ...application(owner, documentId), policyVersions: undefined }).expect(409);
  await submit(owner, { ...application(owner, documentId), policyVersions: { terms: 'unapproved', privacy: 'synthetic-v1' } }).expect(409);
  expect(await sitterApplicationModels(connection).SitterApplication.countDocuments()).toBe(0);
});


async function anotherVerifiedEmail(owner, email) {
  const crypto = createContactCrypto({ lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY });
  const canonical = crypto.lookup('EMAIL', email);
  await identityModels(connection).Contact.create({ userId: owner.id, channel: 'EMAIL', state: 'VERIFIED',
    verifiedAt: new Date(clockNow), lookupKey: canonical.lookupKey, canonicalCiphertext: crypto.encrypt(canonical.canonicalValue) });
  return { ...owner, email };
}

test('owner cooldown survives verified email and identity changes after rejection', async () => {
  const owner = await register();
  const documentId = await upload(owner);
  const created = await submit(owner, application(owner, documentId)).expect(201);
  const admin = await userModel(connection).create({ displayName: 'Synthetic Admin', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0, synthetic: false });
  const sessions = createSessionService({ connection, clock: () => clockNow, tokenSecret: env.SESSION_TOKEN_SECRET, csrfSecret: env.SESSION_CSRF_SECRET });
  let issued;
  await connection.transaction(async session => { issued = await sessions.issueInTransaction(admin, session); });
  await request(app).post(`/api/v1/applications/${created.body.data.id}/decisions`).set({ ...base, Cookie: `pwc_session=${issued.token}`,
    'X-CSRF-Token': issued.csrfToken, 'Idempotency-Key': 'synthetic-reject-owner-01' }).send({ action: 'REJECT', expectedVersion: 0, reason: 'Synthetic rejected application' }).expect(200);
  const changed = await anotherVerifiedEmail(owner, 'changed@example.test');
  await identityModels(connection).Contact.updateOne({ userId: owner.id, channel: 'EMAIL', lookupKey: createContactCrypto({
    lookupSecret: env.CONTACT_LOOKUP_SECRET, encryptionKey: env.CONTACT_ENCRYPTION_KEY }).lookup('EMAIL', owner.email).lookupKey }, { $set: { state: 'REPLACED' } });
  await submit(changed, { ...application(changed, documentId), identityNumber: 'DIFFERENT12345' }, 'synthetic-reapply-owner-01').expect(409)
    .expect(res => expect(res.body.error.code).toBe('REAPPLY_NOT_AVAILABLE'));
  expect(await sitterApplicationModels(connection).SitterApplication.countDocuments()).toBe(1);
});

test('concurrent commands with distinct verified emails and identities create at most one pending application per owner', async () => {
  const owner = await register();
  const second = await anotherVerifiedEmail(owner, 'second@example.test');
  const documentId = await upload(owner);
  const results = await Promise.all([submit(owner, application(owner, documentId), 'concurrent-owner-command-01'),
    submit(second, { ...application(second, documentId), identityNumber: 'SECOND12345678' }, 'concurrent-owner-command-02')]);
  expect(results.map(result => result.status).sort()).toEqual([201, 409]);
  expect(await sitterApplicationModels(connection).SitterApplication.countDocuments()).toBe(1);
});

test('owned photo IDs cannot be submitted as applicant documents', async () => {
  const owner = await register();
  const id = 'e'.repeat(64);
  await privateImageModels(connection).PrivateImage.create({ _id: id, ownerId: owner.id, state: 'READY', inputDigest: 'f'.repeat(64), storageRef: `private-images/${id}` });
  await submit(owner, application(owner, id)).expect(403);
  expect(await applicantDocumentModels(connection).PrivateImage.countDocuments()).toBe(0);
});

test('photo R2 enabled with document flag off does not expose upload or enable intake', async () => {
  const owner = await register();
  const envWithoutDocuments = { ...env, SITTER_DOCUMENTS_ENABLED: 'false' };
  const disabled = createApp({ config: loadConfig(envWithoutDocuments), connection, lifecycle: { draining: false }, env: envWithoutDocuments, clock: () => clockNow });
  await request(disabled).get('/api/v1/applications/intake').set({ ...base, Cookie: owner.cookie }).expect(200)
    .expect(res => expect(res.body.data.uploadsAvailable).toBe(false));
  await request(disabled).post('/api/v1/applicant-documents').set({ ...base, Cookie: owner.cookie }).send({}).expect(404);
});
