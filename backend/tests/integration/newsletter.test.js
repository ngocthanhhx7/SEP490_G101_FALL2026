import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import express from 'express';
import { connectDatabase } from '../../src/config/database.js';
import { newsletterModule } from '../../src/routes/newsletter.routes.js';
import { newsletterModel } from '../../src/models/newsletter-request.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
let replica, connection, Model;
const auth = { enabled: true, contactLookupSecret: 'synthetic-newsletter-lookup-secret-32-bytes',
  contactEncryptionKey: '0123456789abcdef0123456789abcdef' };
function app(enabled = true) {
  const instance = express();
  instance.use(requestId, express.json());
  const module = newsletterModule({ config: { auth: enabled ? auth : { enabled: false } }, connection });
  instance.use(module.mount, module.router);
  instance.use(errorHandler(() => {}));
  return instance;
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await connectDatabase({ mongoUri: replica.getUri(), database: 'synthetic_newsletter', connectTimeoutMs: 3000 });
  Model = newsletterModel(connection); await Model.syncIndexes();
}, 600000);
beforeEach(async () => { await Model.deleteMany({}); });
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
test('records encrypted canonical email once and returns the same receipt for duplicates', async () => {
  const instance = app();
  const send = email => request(instance).post('/api/v1/newsletter/subscriptions').send({ email });
  const first = await send(' Synthetic@Example.test ').expect(202);
  const second = await send('synthetic@example.test').expect(202);
  expect(first.body.data).toEqual({ status: 'REQUESTED' });
  expect(first.body.data).toEqual(second.body.data);
  expect(first.headers['cache-control']).toBe('no-store');
  expect(await Model.countDocuments()).toBe(1);
  const saved = await Model.findOne().select('+contactLookup +contactCiphertext').lean();
  expect(JSON.stringify(saved)).not.toContain('synthetic@example.test');
  const crypto = createContactCrypto({ lookupSecret: auth.contactLookupSecret, encryptionKey: auth.contactEncryptionKey });
  expect(crypto.decrypt(saved.contactCiphertext)).toBe('synthetic@example.test');
  expect(saved.state).toBe('REQUESTED');
});
test('rejects malformed input and cross-origin writes, and fails closed without crypto configuration', async () => {
  const instance = app();
  await request(instance).post('/api/v1/newsletter/subscriptions').send({ email: 'invalid' }).expect(422);
  await request(instance).post('/api/v1/newsletter/subscriptions').send({ email: 'a@example.test', state: 'ACTIVE' }).expect(422);
  await request(instance).post('/api/v1/newsletter/subscriptions').set('Origin', 'https://outside.example')
    .send({ email: 'a@example.test' }).expect(403);
  await request(app(false)).post('/api/v1/newsletter/subscriptions').send({ email: 'a@example.test' }).expect(503);
  expect(await Model.countDocuments()).toBe(0);
});
test('limits public subscription attempts to five per IP per hour', async () => {
  const instance = app();
  for (let i = 0; i < 5; i++) await request(instance).post('/api/v1/newsletter/subscriptions').send({ email: 'a@example.test' }).expect(202);
  await request(instance).post('/api/v1/newsletter/subscriptions').send({ email: 'b@example.test' }).expect(429);
  expect(await Model.countDocuments()).toBe(1);
});
