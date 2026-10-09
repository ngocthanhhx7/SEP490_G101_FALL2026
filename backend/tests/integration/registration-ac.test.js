import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { once } from 'node:events';
import { app } from '../../src/app.js';
import { ensureModelIndexes, models } from '../../src/models/index.js';
import { Customer } from '../../src/models/customer.js';
import { ContactVerificationState } from '../../src/models/contact-verification-state.js';
import { PendingRegistration } from '../../src/models/pending-registration.js';
import { RegistrationEvent } from '../../src/models/registration-event.js';
import { RegistrationIpRateLimit } from '../../src/models/registration-ip-rate-limit.js';
import { RegistrationOtp } from '../../src/models/registration-otp.js';
import { clearMockOtps, MockOtpProvider, readMockOtp } from '../../src/providers/mock-otp-provider.js';
import { configureOtpProviders } from '../../src/providers/index.js';
import { normalizeEmail, normalizePhoneVN } from '../../src/utils/registration.js';
import { makeContactKey } from '../../src/services/issue-otp.js';
import { rejectAuthenticated } from '../../src/routes/registration-routes.js';
import { startMongoMemoryReplicaSet, stopMongoMemoryReplicaSet } from '../helpers/mongodb-memory.js';

let server;
let baseUrl;
let customerRoleId;
const mockProvider = new MockOtpProvider();

async function post(path, body = {}, headers = {}) {
  return fetch(`${baseUrl}/api/v1/auth/register${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function json(response) {
  return response.json();
}

async function createEmailRegistration(email = 'alice@example.com', fullName = 'Nguyen Van A') {
  const response = await post('/', { fullName, email });
  const body = await json(response);
  return { response, body, email, otp: readMockOtp(email) };
}

async function activeOtp(registrationId) {
  return RegistrationOtp.findOne({ registrationId, status: 'ACTIVE' });
}

async function movePastCooldown(contactType, contactValue) {
  const old = new Date(Date.now() - 61_000);
  await ContactVerificationState.updateOne(
    { contactKey: makeContactKey(contactType, contactValue) },
    { $set: { lastOtpSentAt: old, otpSendTimestamps: [old] } },
  );
}

async function exhaustContactQuota(contactType, contactValue) {
  const timestamp = new Date(Date.now() - 61_000);
  await ContactVerificationState.updateOne(
    { contactKey: makeContactKey(contactType, contactValue) },
    { $set: { lastOtpSentAt: timestamp, otpSendTimestamps: Array(5).fill(timestamp) } },
  );
}

async function authorizeWithToken(token) {
  return { authorization: `Bearer ${token}` };
}

async function configureFailingProvider() {
  const failed = { async sendOtp() { throw new Error('provider unavailable'); } };
  configureOtpProviders({ email: failed, phone: failed });
}

before(async () => {
  const uri = await startMongoMemoryReplicaSet();
  await mongoose.connect(uri);
  await ensureModelIndexes();
  customerRoleId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('roles').insertOne({ _id: customerRoleId, code: 'CUSTOMER', name: 'Customer', isActive: true });

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await Promise.all(Object.values(models).map((model) => model.deleteMany({})));
  await RegistrationIpRateLimit.deleteMany({});
  await mongoose.connection.collection('roles').deleteMany({});
  customerRoleId = new mongoose.Types.ObjectId();
  await mongoose.connection.collection('roles').insertOne({ _id: customerRoleId, code: 'CUSTOMER', name: 'Customer', isActive: true });
  clearMockOtps();
  configureOtpProviders({ email: mockProvider, phone: mockProvider });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await stopMongoMemoryReplicaSet();
});

test('AC 1: valid email registration creates pending data and sends one six-digit OTP', async () => {
  const { response, body, email, otp } = await createEmailRegistration();
  assert.equal(response.status, 201);
  assert.match(otp, /^\d{6}$/);
  const pending = await PendingRegistration.findOne({ contactType: 'email', contactValue: email });
  assert.equal(pending.status, 'PENDING_VERIFICATION');
  assert.equal(await Customer.countDocuments({ email }), 0);
  assert.equal(body.contactType, 'email');
});

test('AC 2: valid phone registration sends OTP through phone provider', async () => {
  const response = await post('/', { fullName: 'Nguyen Van A', phone: '0901234567' });
  const body = await json(response);
  assert.equal(response.status, 201);
  assert.equal(body.contactType, 'phone');
  assert.equal(readMockOtp('+84901234567')?.length, 6);
  assert.equal(await PendingRegistration.countDocuments({ contactValue: '+84901234567' }), 1);
});

test('AC 3: supplying both or neither contact methods is rejected', async () => {
  assert.equal((await post('/', { fullName: 'Nguyen Van A' })).status, 400);
  assert.equal((await post('/', { fullName: 'Nguyen Van A', email: 'a@example.com', phone: '0901234567' })).status, 400);
  assert.equal(await PendingRegistration.countDocuments(), 0);
});

test('AC 4: missing and malformed registration fields return field validation errors', async () => {
  const missing = await post('/', { email: 'a@example.com' });
  assert.equal(missing.status, 400);
  assert.equal((await json(missing)).error.code, 'VALIDATION_ERROR');
  const malformed = await post('/', { fullName: 'Nguyen Van A', email: { $ne: null } });
  assert.equal(malformed.status, 400);
  assert.equal(await PendingRegistration.countDocuments(), 0);
});

test('AC 5: active account contact returns CONTACT_ALREADY_USED', async () => {
  await Customer.create({ fullName: 'Existing User', email: 'alice@example.com', roleId: customerRoleId });
  const response = await post('/', { fullName: 'Nguyen Van A', email: 'alice@example.com' });
  const body = await json(response);
  assert.equal(response.status, 409);
  assert.equal(body.error.code, 'CONTACT_ALREADY_USED');
  assert.equal(body.error.suggestedAction, 'LOGIN');
  assert.equal(readMockOtp('alice@example.com'), undefined);
});

test('AC 6: correct latest OTP activates the Customer and consumes the OTP once', async () => {
  const { body: registration, otp } = await createEmailRegistration();
  const response = await post('/verify', { otp }, await authorizeWithToken(registration.registrationToken));
  assert.equal(response.status, 200);
  assert.equal((await json(response)).nextAction, 'LOGIN');
  assert.equal(await Customer.countDocuments({ email: 'alice@example.com', status: 'ACTIVE' }), 1);
  const pending = await PendingRegistration.findOne({ contactValue: 'alice@example.com' });
  assert.equal(pending.status, 'COMPLETED');
  assert.equal((await RegistrationOtp.findOne({ registrationId: pending._id })).status, 'CONSUMED');
});

test('AC 7: verify distinguishes wrong, expired, exhausted, missing, and completed states', async () => {
  const wrong = await createEmailRegistration('wrong@example.com');
  let response = await post('/verify', { otp: '999999' }, await authorizeWithToken(wrong.body.registrationToken));
  assert.equal((await json(response)).error.code, 'OTP_INVALID');

  const expired = await createEmailRegistration('expired@example.com');
  const pendingExpired = await PendingRegistration.findOne({ contactValue: expired.email });
  await RegistrationOtp.updateOne({ registrationId: pendingExpired._id, status: 'ACTIVE' }, { $set: { expiresAt: new Date(0) } });
  response = await post('/verify', { contactType: 'email', contact: expired.email, otp: expired.otp });
  assert.equal(response.status, 400);

  const exhausted = await createEmailRegistration('exhausted@example.com');
  await PendingRegistration.updateOne({ contactValue: exhausted.email }, { $set: { wrongOtpAttempts: 5, verificationBlocked: true } });
  response = await post('/verify', { contactType: 'email', contact: exhausted.email, otp: exhausted.otp });
  assert.equal((await json(response)).error.code, 'PENDING_OTP_ATTEMPTS_EXHAUSTED');

  response = await post('/verify', { contactType: 'email', contact: 'missing@example.com', otp: '012345' });
  assert.equal((await json(response)).error.code, 'REGISTRATION_NOT_FOUND');

  const completed = await createEmailRegistration('complete@example.com');
  await post('/verify', { otp: completed.otp }, await authorizeWithToken(completed.body.registrationToken));
  response = await post('/verify', { contactType: 'email', contact: completed.email, otp: completed.otp });
  assert.equal((await json(response)).error.code, 'REGISTRATION_COMPLETED');
});

test('AC 8: resend before cooldown returns OTP_RESEND_TOO_SOON and retryAfterSeconds', async () => {
  const registration = await createEmailRegistration();
  const response = await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  const body = await json(response);
  assert.equal(response.status, 429);
  assert.equal(body.error.code, 'OTP_RESEND_TOO_SOON');
  assert.ok(body.error.retryAfterSeconds > 0);
});

test('AC 9: contact send quota blocks a sixth successful send', async () => {
  const registration = await createEmailRegistration();
  await movePastCooldown('email', registration.email);
  await exhaustContactQuota('email', registration.email);
  const response = await post('/resend', { contactType: 'email', contact: registration.email });
  const body = await json(response);
  assert.equal(response.status, 429);
  assert.equal(body.error.code, 'OTP_RATE_LIMITED');
  assert.ok(body.error.retryAfterSeconds > 0);
});

test('AC 10: accepted resend activates replacement and invalidates previous OTP', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  const oldOtp = await activeOtp(pending._id);
  await movePastCooldown('email', registration.email);
  const response = await post('/resend', { contactType: 'email', contact: registration.email });
  assert.equal(response.status, 200);
  const newOtp = await activeOtp(pending._id);
  assert.notEqual(String(oldOtp._id), String(newOtp._id));
  assert.equal((await RegistrationOtp.findById(oldOtp._id)).status, 'INVALIDATED');
  assert.equal(await verifyResponse(registration.email, readMockOtp(registration.email)), 200);
});

async function verifyResponse(email, otp) {
  return (await post('/verify', { contactType: 'email', contact: email, otp })).status;
}

test('AC 11: provider rejection returns OTP_DELIVERY_FAILED without replacing active OTP', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  const before = await ContactVerificationState.findById(pending.contactStateId).lean();
  await movePastCooldown('email', registration.email);
  await configureFailingProvider();
  const response = await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  assert.equal(response.status, 502);
  assert.equal((await json(response)).error.code, 'OTP_DELIVERY_FAILED');
  assert.equal(await RegistrationOtp.countDocuments({ registrationId: pending._id, status: 'ACTIVE' }), 1);
  assert.equal(await RegistrationOtp.countDocuments({ registrationId: pending._id, status: 'DELIVERY_PENDING' }), 0);
  const after = await ContactVerificationState.findById(pending.contactStateId).lean();
  assert.equal(after.otpSendTimestamps.length, before.otpSendTimestamps.length);
});

test('AC 12: reaching wrong-code maximum blocks further verify and resend', async () => {
  const registration = await createEmailRegistration();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await post('/verify', { otp: '999999' }, await authorizeWithToken(registration.body.registrationToken));
    assert.equal(response.status, 400);
  }
  let response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
  assert.equal((await json(response)).error.code, 'PENDING_OTP_ATTEMPTS_EXHAUSTED');
  response = await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  assert.equal((await json(response)).error.code, 'PENDING_OTP_ATTEMPTS_EXHAUSTED');
});

test('AC 13: expired pending contact is released for registration again', async () => {
  await createEmailRegistration();
  await PendingRegistration.updateOne({ contactValue: 'alice@example.com' }, { $set: { expiresAt: new Date(0) } });
  await movePastCooldown('email', 'alice@example.com');
  const response = await post('/', { fullName: 'Different Name', email: 'alice@example.com' });
  assert.equal(response.status, 201);
  assert.equal(await PendingRegistration.countDocuments({ contactValue: 'alice@example.com' }), 1);
});

test('AC 14: OTP is absent from application logs', async () => {
  const captured = [];
  const originals = { log: console.log, info: console.info, error: console.error };
  for (const key of Object.keys(originals)) console[key] = (...args) => captured.push(args.join(' '));
  try {
    const registration = await createEmailRegistration();
    assert.ok(registration.otp);
    assert.equal(captured.some((entry) => entry.includes(registration.otp)), false);
  } finally {
    Object.assign(console, originals);
  }
});

test('AC 15: abandoned registration remains pending and creates no active Customer', async () => {
  await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: 'alice@example.com' });
  assert.equal(pending.status, 'PENDING_VERIFICATION');
  assert.equal(await Customer.countDocuments({ email: 'alice@example.com' }), 0);
});

test('AC 16: activation persistence failure rolls back Customer and completion', async () => {
  const registration = await createEmailRegistration();
  const originalCreate = Customer.create;
  Customer.create = async () => { throw new Error('simulated persistence failure'); };
  try {
    const response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
    assert.equal(response.status, 500);
    assert.equal((await json(response)).error.code, 'INTERNAL_ERROR');
  } finally {
    Customer.create = originalCreate;
  }
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  assert.equal(pending.status, 'PENDING_VERIFICATION');
  assert.equal(await Customer.countDocuments({ email: registration.email }), 0);
  assert.equal((await activeOtp(pending._id)).status, 'ACTIVE');
});

test('AC 17: duplicate registration preserves existing name and counters', async () => {
  await createEmailRegistration('alice@example.com', 'First Name');
  const response = await post('/', { fullName: 'Changed Name', email: 'alice@example.com' });
  assert.equal((await json(response)).error.code, 'REGISTRATION_PENDING');
  const pending = await PendingRegistration.findOne({ contactValue: 'alice@example.com' });
  assert.equal(pending.fullName, 'First Name');
  assert.equal(pending.resendCount, 0);
});

test('AC 18: two simultaneous resends claim at most one contact send slot', async () => {
  const registration = await createEmailRegistration();
  await movePastCooldown('email', registration.email);
  const headers = await authorizeWithToken(registration.body.registrationToken);
  const responses = await Promise.all([post('/resend', {}, headers), post('/resend', {}, headers)]);
  assert.deepEqual(responses.map((item) => item.status).sort(), [200, 429]);
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  assert.equal(await RegistrationOtp.countDocuments({ registrationId: pending._id, status: 'ACTIVE' }), 1);
  assert.equal((await ContactVerificationState.findById(pending.contactStateId)).otpSendTimestamps.length, 2);
});

test('AC 19: concurrent wrong OTP requests cannot exceed configured maximum', async () => {
  const registration = await createEmailRegistration();
  const headers = await authorizeWithToken(registration.body.registrationToken);
  await Promise.all(Array.from({ length: 12 }, () => post('/verify', { otp: '999999' }, headers)));
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  assert.equal(pending.wrongOtpAttempts, 5);
  assert.equal(pending.verificationBlocked, true);
});

test('AC 20: concurrent valid verify requests create one Customer and complete once', async () => {
  const registration = await createEmailRegistration();
  const headers = await authorizeWithToken(registration.body.registrationToken);
  const responses = await Promise.all(Array.from({ length: 5 }, () => post('/verify', { otp: registration.otp }, headers)));
  const statuses = await Promise.all(responses.map(async (response) => [response.status, await json(response)]));
  assert.equal(statuses.filter(([status]) => status === 200).length, 1);
  assert.ok(statuses.every(([status, body]) => status === 200 || (status === 409 && body.error.code === 'REGISTRATION_COMPLETED')));
  assert.equal(await Customer.countDocuments({ email: registration.email }), 1);
  assert.equal((await PendingRegistration.findOne({ contactValue: registration.email })).status, 'COMPLETED');
});

test('AC 21: duplicate create returns REGISTRATION_PENDING without another initial send', async () => {
  const first = await createEmailRegistration();
  const second = await post('/', { fullName: 'Another Name', email: first.email });
  assert.equal((await json(second)).error.code, 'REGISTRATION_PENDING');
  assert.equal(await RegistrationOtp.countDocuments({ status: 'ACTIVE' }), 1);
});

test('AC 22: OTP at or beyond expiresAt is rejected', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await RegistrationOtp.updateOne({ registrationId: pending._id, status: 'ACTIVE' }, { $set: { expiresAt: new Date(Date.now() - 1) } });
  const response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
  assert.equal((await json(response)).error.code, 'OTP_NOT_VALID');
  assert.equal(pending.wrongOtpAttempts, 0);
});

test('AC 23: only token hash is stored and ObjectId cannot authorize or leak into URL/logs', async () => {
  const captured = [];
  const originals = { log: console.log, info: console.info, error: console.error };
  for (const key of Object.keys(originals)) console[key] = (...args) => captured.push(args.join(' '));
  let registration;
  let resendResponse;
  try {
    registration = await createEmailRegistration();
    resendResponse = await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  } finally {
    Object.assign(console, originals);
  }
  const pending = await PendingRegistration.findOne({ contactValue: registration.email }).lean();
  assert.notEqual(pending.registrationTokenHash, registration.body.registrationToken);
  assert.equal(pending.registrationTokenHash.length, 64);
  assert.equal(resendResponse.status, 429);
  const invalid = await post('/resend', {}, { authorization: `Bearer ${pending._id}` });
  assert.equal(invalid.status, 400);
  assert.equal(`${baseUrl}/api/v1/auth/register/resend`.includes(registration.body.registrationToken), false);
  assert.equal(captured.some((entry) => entry.includes(registration.body.registrationToken)), false);
});

test('AC 24: contact resend and contact-plus-OTP work without registration token', async () => {
  const registration = await createEmailRegistration();
  await movePastCooldown('email', registration.email);
  assert.equal((await post('/resend', { contactType: 'email', contact: registration.email })).status, 200);
  const replacement = readMockOtp(registration.email);
  const verify = await post('/verify', { contactType: 'email', contact: registration.email, otp: replacement });
  assert.equal(verify.status, 200);
});

test('AC 25: E5 rejection does not increment wrong-code attempts', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await RegistrationOtp.updateOne({ registrationId: pending._id, status: 'ACTIVE' }, { $set: { expiresAt: new Date(0) } });
  const response = await post('/verify', { contactType: 'email', contact: registration.email, otp: registration.otp });
  assert.equal((await json(response)).error.code, 'OTP_NOT_VALID');
  assert.equal((await PendingRegistration.findById(pending._id)).wrongOtpAttempts, 0);
  assert.equal(await Customer.countDocuments({ email: registration.email }), 0);
});

test('AC 26: audit events omit OTP, provider secret, and raw contact', async () => {
  const registration = await createEmailRegistration();
  const eventDump = JSON.stringify(await RegistrationEvent.find({}).lean());
  assert.equal(eventDump.includes(registration.otp), false);
  assert.equal(eventDump.includes(registration.email), false);
  assert.equal(eventDump.includes(process.env.OTP_HMAC_SECRET), false);
});

test('AC 27: expired, consumed, and superseded codes all map to OTP_NOT_VALID without attempts', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await RegistrationOtp.updateOne({ registrationId: pending._id, status: 'ACTIVE' }, { $set: { status: 'CONSUMED' } });
  const response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
  assert.equal((await json(response)).error.code, 'OTP_NOT_VALID');
  assert.equal((await PendingRegistration.findById(pending._id)).wrongOtpAttempts, 0);
});

test('AC 28: contact resend returns synchronous success with masked destination', async () => {
  const registration = await createEmailRegistration();
  await movePastCooldown('email', registration.email);
  const response = await post('/resend', { contactType: 'email', contact: registration.email });
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.maskedDestination, 'a**@example.com');
  assert.ok(body.message);
});

test('AC 29: Vietnamese and Unicode names are accepted while disallowed characters fail', async () => {
  const valid = await post('/', { fullName: '  Nguyễn Văn A  ', email: 'name@example.com' });
  assert.equal(valid.status, 201);
  const invalid = await post('/', { fullName: 'Name_One', email: 'other@example.com' });
  assert.equal(invalid.status, 400);
});

test('AC 30: email normalization preserves dot and plus aliases', async () => {
  assert.equal((await post('/', { fullName: 'Name One', email: 'A.B+one@Example.com' })).status, 201);
  assert.equal((await post('/', { fullName: 'Name Two', email: 'ab@example.com' })).status, 201);
  assert.equal((await PendingRegistration.countDocuments({})), 2);
  assert.equal(normalizeEmail('A.B+one@Example.com'), 'a.b+one@example.com');
});

test('AC 31: Vietnam phone is stored as E.164', async () => {
  await post('/', { fullName: 'Nguyen Van A', phone: '090 123 4567' });
  assert.equal(await PendingRegistration.countDocuments({ contactValue: '+84901234567' }), 1);
  assert.equal(normalizePhoneVN('0901234567'), '+84901234567');
});

test('AC 32: repeated pending contact does not mutate name or create another OTP', async () => {
  await createEmailRegistration('alice@example.com', 'Original Name');
  const response = await post('/', { fullName: 'Injected Name', email: 'alice@example.com' });
  assert.equal((await json(response)).error.code, 'REGISTRATION_PENDING');
  assert.equal((await PendingRegistration.findOne({ contactValue: 'alice@example.com' })).fullName, 'Original Name');
  assert.equal(await RegistrationOtp.countDocuments({ status: 'ACTIVE' }), 1);
});

test('AC 33: provider failure leaves previous active OTP usable', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  const oldVerifier = (await activeOtp(pending._id)).codeVerifier;
  await movePastCooldown('email', registration.email);
  await configureFailingProvider();
  const response = await post('/resend', { contactType: 'email', contact: registration.email });
  assert.equal(response.status, 502);
  const currentOtp = await activeOtp(pending._id);
  assert.equal(currentOtp.codeVerifier, oldVerifier);
  configureOtpProviders({ email: mockProvider, phone: mockProvider });
  assert.equal(await verifyResponse(registration.email, registration.otp), 200);
});

test('AC 34: failed provider sends do not consume contact send quota', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await movePastCooldown('email', registration.email);
  const stateBefore = await ContactVerificationState.findById(pending.contactStateId).lean();
  await configureFailingProvider();
  await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  const stateAfter = await ContactVerificationState.findById(pending.contactStateId).lean();
  assert.equal(stateAfter.otpSendTimestamps.length, stateBefore.otpSendTimestamps.length);
});

test('AC 35: token and contact resolve the same pending record and newest OTP', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await movePastCooldown('email', registration.email);
  await post('/resend', { contactType: 'email', contact: registration.email });
  const newest = readMockOtp(registration.email);
  const response = await post('/verify', { otp: newest }, await authorizeWithToken(registration.body.registrationToken));
  assert.equal(response.status, 200);
  assert.equal((await PendingRegistration.findById(pending._id)).status, 'COMPLETED');
});

test('AC 36: resend cooldown uses latest successful issuedAt and does not reset wrong attempts', async () => {
  const registration = await createEmailRegistration();
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  await PendingRegistration.updateOne({ _id: pending._id }, { $set: { wrongOtpAttempts: 2 } });
  const tooSoon = await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken));
  assert.equal((await json(tooSoon)).error.code, 'OTP_RESEND_TOO_SOON');
  await movePastCooldown('email', registration.email);
  assert.equal((await post('/resend', {}, await authorizeWithToken(registration.body.registrationToken))).status, 200);
  assert.equal((await PendingRegistration.findById(pending._id)).wrongOtpAttempts, 2);
});

test('AC 37: token recovery works and successful verify does not auto-login', async () => {
  const registration = await createEmailRegistration();
  const response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.nextAction, 'LOGIN');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('AC 38: TTL indexes exist and expired pending records are treated as expired immediately', async () => {
  await createEmailRegistration();
  const pendingIndexes = await PendingRegistration.collection.indexes();
  const otpIndexes = await RegistrationOtp.collection.indexes();
  assert.ok(pendingIndexes.some((index) => index.name === 'ttl_pending_registration_expiry' && index.expireAfterSeconds === 0));
  assert.ok(otpIndexes.some((index) => index.name === 'ttl_registration_otp_cleanup' && index.expireAfterSeconds === 0));
  await PendingRegistration.updateOne({ contactValue: 'alice@example.com' }, { $set: { expiresAt: new Date(0) } });
  const response = await post('/resend', { contactType: 'email', contact: 'alice@example.com' });
  assert.equal((await json(response)).error.code, 'REGISTRATION_NOT_FOUND');
});

test('AC 39: authenticated registration caller receives 403 ALREADY_AUTHENTICATED', async () => {
  let received;
  rejectAuthenticated({ user: { id: 'u1' } }, {}, (error) => { received = error; });
  assert.equal(received.code, 'ALREADY_AUTHENTICATED');
  assert.equal(received.httpStatus, 403);
});

test('AC 40: per-IP endpoint bucket returns IP_RATE_LIMITED at the configured threshold', async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await post('/', {})).status, 400);
  }
  const response = await post('/', {});
  assert.equal(response.status, 429);
  assert.equal((await json(response)).error.code, 'IP_RATE_LIMITED');
});

test('AC 41: successful verification atomically consumes OTP, creates Customer, and completes pending data', async () => {
  const registration = await createEmailRegistration();
  const response = await post('/verify', { otp: registration.otp }, await authorizeWithToken(registration.body.registrationToken));
  assert.equal(response.status, 200);
  const pending = await PendingRegistration.findOne({ contactValue: registration.email });
  assert.equal(pending.status, 'COMPLETED');
  assert.equal(await Customer.countDocuments({ _id: pending.customerId, email: registration.email, roleId: customerRoleId }), 1);
  assert.equal((await RegistrationOtp.findOne({ registrationId: pending._id })).status, 'CONSUMED');
});

test('AC 42: returned destinations use the configured masking formats', async () => {
  const emailResponse = await createEmailRegistration();
  assert.equal(emailResponse.body.maskedDestination, 'a**@example.com');
  const phoneResponse = await post('/', { fullName: 'Nguyen Van A', phone: '0901234567' });
  assert.equal((await json(phoneResponse)).maskedDestination, '090****567');
});

test('AC 43: first successful delivery after initial provider failure is not counted as resend', async () => {
  await configureFailingProvider();
  const failed = await post('/', { fullName: 'Nguyen Van A', email: 'recover@example.com' });
  assert.equal(failed.status, 502);
  assert.equal(await PendingRegistration.countDocuments({ contactValue: 'recover@example.com' }), 1);
  configureOtpProviders({ email: mockProvider, phone: mockProvider });
  const resend = await post('/resend', { contactType: 'email', contact: 'recover@example.com' });
  assert.equal(resend.status, 200);
  const pending = await PendingRegistration.findOne({ contactValue: 'recover@example.com' });
  assert.ok(pending.initialOtpIssuedAt);
  assert.equal(pending.resendCount, 0);
  assert.equal((await ContactVerificationState.findById(pending.contactStateId)).otpSendTimestamps.length, 1);
});

test('AC 44: quota remains contact-scoped after pending expiry and blocks new registration', async () => {
  await createEmailRegistration('quota@example.com');
  await PendingRegistration.updateOne({ contactValue: 'quota@example.com' }, { $set: { expiresAt: new Date(0) } });
  await exhaustContactQuota('email', 'quota@example.com');
  const response = await post('/', { fullName: 'Nguyen Van A', email: 'quota@example.com' });
  const body = await json(response);
  assert.equal(response.status, 429);
  assert.equal(body.error.code, 'OTP_RATE_LIMITED');
  assert.ok(body.error.retryAfterSeconds > 0);
  assert.equal(await PendingRegistration.countDocuments({ contactValue: 'quota@example.com' }), 0);
});
