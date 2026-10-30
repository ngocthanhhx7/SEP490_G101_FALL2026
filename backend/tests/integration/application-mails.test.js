import { beforeAll, beforeEach, afterAll, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createApplicationMailService } from '../../src/services/applications/application-mail.service.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { applicationMailModel } from '../../src/models/application-mail.model.js';
import { identityModels } from '../../src/models/identity.model.js';
import { startRuntime } from '../../src/runtime.js';

let replica, connection, Mail, Contact, crypto, delivery, service, now;
const owner = new mongoose.Types.ObjectId(), applicationId = new mongoose.Types.ObjectId();
const email = 'synthetic-applicant@example.test';
const application = (state = 'PENDING', version = 0) => ({ _id: applicationId, ownerUserId: owner,
  contactChannel: 'EMAIL', contactCiphertext: crypto.encrypt(email), state, version });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'application_mail_test' }).asPromise();
  Mail = applicationMailModel(connection); Contact = identityModels(connection).Contact;
  crypto = createContactCrypto({ lookupSecret: 'l'.repeat(32), encryptionKey: 'e'.repeat(32) });
  await Mail.syncIndexes(); await Contact.syncIndexes();
}, 600000);
beforeEach(async () => {
  await Mail.deleteMany({}); await Contact.deleteMany({}); now = Date.now();
  await Contact.create({ userId: owner, channel: 'EMAIL', state: 'VERIFIED', verifiedAt: new Date(now),
    lookupKey: crypto.lookup('EMAIL', email).lookupKey, canonicalCiphertext: crypto.encrypt(email) });
  delivery = { send: jest.fn(async () => ({ status: 'ACCEPTED' })) };
  service = createApplicationMailService({ connection, contactCrypto: crypto, delivery, clock: () => now });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
test('transactional queue emits each committed status once and never sends before commit', async () => {
  for (const [version, state] of ['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED'].entries()) {
    await connection.transaction(session => service.enqueue(application(state, version), session));
    await connection.transaction(session => service.enqueue(application(state, version), session));
  }
  expect(delivery.send).not.toHaveBeenCalled();
  expect(await Mail.countDocuments()).toBe(4);
  expect(JSON.stringify(await Mail.find().select('+contactCiphertext').lean())).not.toContain(email);
  const result = await service.runBatch();
  expect(result).toMatchObject({ processed: 4, accepted: 4 });
  expect(delivery.send.mock.calls.map(([row]) => row.applicationState)).toEqual(['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED']);
  expect(delivery.send.mock.calls.at(-1)[0]).toMatchObject({ template: 'SITTER_APPLICATION_STATUS', to: email });
  await service.runBatch(); expect(delivery.send).toHaveBeenCalledTimes(4);
});
test('rollback removes email with the domain command', async () => {
  await expect(connection.transaction(async session => { await service.enqueue(application(), session); throw Error('Synthetic rollback'); })).rejects.toThrow();
  expect(await Mail.countDocuments()).toBe(0); expect(delivery.send).not.toHaveBeenCalled();
});
test('uncertain SMTP acceptance and an expired sending lease never auto-resend', async () => {
  await connection.transaction(session => service.enqueue(application(), session));
  delivery.send.mockResolvedValueOnce({ status: 'FAILED', uncertain: true, retryable: true, code: 'TIMEOUT' });
  await service.runBatch(); now += 3600000; await service.runBatch();
  expect(delivery.send).toHaveBeenCalledTimes(1);
  expect((await Mail.findOne().lean()).deliveryState).toBe('UNKNOWN');
  await Mail.updateMany({}, { $set: { deliveryState: 'SENDING', leaseUntil: new Date(now - 1) } });
  await service.runBatch(); expect(delivery.send).toHaveBeenCalledTimes(1);
  expect((await Mail.findOne().lean()).failureCode).toBe('ACKNOWLEDGEMENT_UNKNOWN');
});
test('safe temporary failures retry with the same operation id and a bounded attempt count', async () => {
  await connection.transaction(session => service.enqueue(application(), session));
  delivery.send.mockResolvedValue({ status: 'FAILED', retryable: true, code: 'THROTTLED' });
  for (let i = 0; i < 4; i++) { await service.runBatch(); now += 300000; }
  expect(delivery.send).toHaveBeenCalledTimes(3);
  expect(new Set(delivery.send.mock.calls.map(([row]) => row.operationId)).size).toBe(1);
  expect((await Mail.findOne().lean()).deliveryState).toBe('FAILED');
});
test('parallel workers claim a mail only once, and replaced email is never used', async () => {
  await connection.transaction(session => service.enqueue(application(), session));
  await Promise.all([service.runBatch(), service.runBatch()]);
  expect(delivery.send).toHaveBeenCalledTimes(1);
  await connection.transaction(session => service.enqueue(application('UNDER_REVIEW', 1), session));
  await Contact.updateMany({}, { $set: { state: 'REPLACED' } });
  await service.runBatch(); expect(delivery.send).toHaveBeenCalledTimes(1);
  expect((await Mail.findOne({ applicationVersion: 1 }).lean()).deliveryState).toBe('SKIPPED');
});
test('enabled runtime starts the durable mail worker and shutdown finishes the batch', async () => {
  await connection.transaction(session => service.enqueue(application('APPROVED', 3), session));
  let acknowledge;
  const delivered = new Promise(resolve => { acknowledge = resolve; });
  delivery.send.mockImplementation(async () => {
    acknowledge();
    return { status: 'ACCEPTED' };
  });
  const runtime = await startRuntime({ env: { NODE_ENV: 'test', PORT: '0', MONGO_URI: replica.getUri(), MONGO_DB: 'application_mail_test',
    AUTH_ENABLED: 'true', OTP_HMAC_SECRET: 'o'.repeat(32), SESSION_TOKEN_SECRET: 't'.repeat(32), SESSION_CSRF_SECRET: 'c'.repeat(32),
    CONTACT_LOOKUP_SECRET: 'l'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
    EMAIL_ENABLED: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', EMAIL_FROM: 'noreply@example.test' },
    portOverrides: { notificationDelivery: delivery } });
  let deadline;
  try {
    await Promise.race([delivered, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Application mail worker did not deliver within 10 seconds')), 10000);
    })]);
    expect(delivery.send).toHaveBeenCalledWith(expect.objectContaining({ applicationState: 'APPROVED', template: 'SITTER_APPLICATION_STATUS' }));
  } finally { clearTimeout(deadline); await runtime.stop(); }
  expect((await Mail.findOne().lean()).deliveryState).toBe('ACCEPTED');
});
