import { beforeAll, afterAll, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import {
  seedDemo,
  DEMO_DATABASE,
  assertDemoDatabase,
} from '../../scripts/demo-ai/fixtures.js';
import { createDemoApp } from '../../scripts/demo-ai/server.js';
import { aiModels } from '../../src/ai/models.js';
import { userModel } from '../../src/models/user.model.js';

let replica, connection, config, manifest, app;
jest.setTimeout(180000);
const origin = 'http://127.0.0.1:3011';
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: { version: '8.0.34' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const env = {
    NODE_ENV: 'development',
    MONGO_URI: replica.getUri(),
    MONGO_DB: DEMO_DATABASE,
    AUTH_ENABLED: 'true',
    AI_ENABLED: 'true',
    EMAIL_ENABLED: 'false',
    SMS_ENABLED: 'false',
    OTP_HMAC_SECRET: 'test-demo-only-otp-secret-at-least32',
    SESSION_TOKEN_SECRET: 'test-demo-only-token-secret-at-least32',
    SESSION_CSRF_SECRET: 'test-demo-only-csrf-secret-at-least32',
    CONTACT_LOOKUP_SECRET: 'test-demo-only-lookup-secret-at-least32',
    CONTACT_ENCRYPTION_KEY: 'test-demo-contact-encryption-key32',
  };
  // Exactly 32 bytes for AES-256, no real credentials.
  env.CONTACT_ENCRYPTION_KEY = 'a'.repeat(32);
  for (const seed of [
    'service-catalog.js',
    'registration-policies.js',
    'ai.js',
  ])
    await promisify(execFile)(
      process.execPath,
      ['scripts/seeds/' + seed, '--apply'],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        env: { ...process.env, ...env },
        stdio: 'pipe',
      }
    );
  config = loadConfig(env);
  connection = await connectDatabase(config);
  manifest = await seedDemo(connection, config);
  app = createDemoApp({ config, connection, manifest, origin });
}, 180000);
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});
async function login(key) {
  const agent = request.agent(app),
    account = manifest.accounts.find((a) => a.key === key);
  const payload = {
    channel: 'EMAIL',
    contact: account.email,
    purpose: 'LOGIN',
  };
  const challenge = await agent
    .post('/api/v1/otp-challenges')
    .set('Host', '127.0.0.1:3011')
    .set('Origin', origin)
    .send(payload)
    .expect(202);
  const inbox = await agent
    .get('/demo/inbox/' + key)
    .set('Host', '127.0.0.1:3011')
    .expect(200);
  const session = await agent
    .post('/api/v1/sessions')
    .set('Host', '127.0.0.1:3011')
    .set('Origin', origin)
    .send({
      ...payload,
      challengeId: challenge.body.data.challengeId,
      code: inbox.body.code,
      rememberDevice: false,
    })
    .expect(200);
  expect(session.body.data.authenticated).toBe(true);
  // Supertest uses its own ephemeral host; explicitly carry only this test cookie.
  const headers = {
    Host: '127.0.0.1:3011',
    Origin: origin,
    Cookie: session.headers['set-cookie'][0].split(';')[0],
    'X-CSRF-Token': session.body.data.csrfToken,
  };
  return { agent, headers };
}
test('fixtures reject non-demo or non-local databases, and serving on non-loopback origin', () => {
  expect(() =>
    assertDemoDatabase({ name: 'paw_world_care_dev', host: '127.0.0.1' })
  ).toThrow();
  expect(() =>
    assertDemoDatabase({ name: DEMO_DATABASE, host: 'example.com' })
  ).toThrow();
  expect(() =>
    createDemoApp({
      config,
      connection,
      manifest,
      origin: 'http://0.0.0.0:3011',
    })
  ).toThrow();
});
test('rerun preserves fixture counts and complete account/pet/application relationships', async () => {
  const before = await aiModels(connection).AiVisitOutcome.countDocuments();
  const again = await seedDemo(connection, config);
  expect(again.accounts).toHaveLength(16);
  expect(again.sitters).toHaveLength(11);
  expect(again.pets).toHaveLength(6);
  expect(again.addresses).toHaveLength(7);
  expect(await userModel(connection).countDocuments()).toBe(16);
  expect(await aiModels(connection).AiVisitOutcome.countDocuments()).toBe(
    before
  );
});
test('real OTP/session APIs run quotes, shortlist >=5, shortage=3, species and schedule changes', async () => {
  const { agent, headers } = await login('customer-an');
  const first = manifest.scenarios[0];
  const quote = await agent
    .post('/api/v1/ai/quotes')
    .set(headers)
    .send({
      serviceId: first.serviceId,
      petIds: first.petIds,
      durationMinutes: 30,
    })
    .expect(201);
  expect(quote.body.data.totalVnd).toBe(80000);
  const tier = await agent
    .post('/api/v1/ai/quotes')
    .set(headers)
    .send({
      serviceId: first.serviceId,
      petIds: first.petIds,
      durationMinutes: 60,
      visitCount: 32,
    })
    .expect(201);
  expect(tier.body.data.totalVnd).toBe(5222400);
  const results = {};
  for (const scenario of manifest.scenarios) {
    const { key } = scenario;
    const body = { ...scenario };
    delete body.key;
    delete body.label;
    delete body.ownerId;
    const response = await agent
      .post('/api/v1/ai/recommendations')
      .set(headers)
      .send(body)
      .expect(201);
    expect(response.headers['x-pwc-demo-routing']).toBe('SIMULATED_NOT_OSRM');
    expect(response.body.data.routingSource).toBe('DEMO_SIMULATED_NOT_OSRM');
    expect(response.body.meta.demoFixture).toBe(true);
    results[key] = response.body.data;
  }
  expect(results.many.returned).toBe(5);
  expect(results.walking.returned).toBe(5);
  expect(results.vet.returned).toBeGreaterThanOrEqual(1);
  expect(results.two.returned).toBe(2);
  expect(results.two.shortfall).toBe(3);
  const sitterId = (key) => manifest.sitters.find((s) => s.scenario === key).id;
  expect(
    results.many.candidates.some((s) => s.sitterId === sitterId('duc'))
  ).toBe(false);
  expect(
    results.many.candidates.some((s) => s.sitterId === sitterId('trang'))
  ).toBe(false);
  expect(
    results.cat.candidates.some((s) => s.sitterId === sitterId('mai'))
  ).toBe(true);
  expect(
    results.later.candidates.some((s) => s.sitterId === sitterId('trang'))
  ).toBe(true);
  expect(results.many.candidates[0].sitterId).toBe(sitterId('lan'));
});
test('second customer cannot quote first customer pets; sitter cannot call customer quotes', async () => {
  const { agent, headers } = await login('customer-binh');
  const scenario = manifest.scenarios[0],
    body = {
      serviceId: scenario.serviceId,
      petIds: scenario.petIds,
      durationMinutes: 30,
    };
  await agent.post('/api/v1/ai/quotes').set(headers).send(body).expect(404);
  const sitter = await login('sitter-minh');
  await sitter.agent
    .post('/api/v1/ai/quotes')
    .set(sitter.headers)
    .send(body)
    .expect(403);
  await sitter.agent.get('/api/v1/me').set(sitter.headers).expect(200);
  for (const [key, role] of [
    ['admin', 'ADMIN'],
    ['staff', 'STAFF'],
  ]) {
    const session = await login(key);
    const me = await session.agent
      .get('/api/v1/me')
      .set(session.headers)
      .expect(200);
    expect(me.body.data.user.roles).toEqual([role]);
    await session.agent
      .post('/api/v1/ai/quotes')
      .set(session.headers)
      .send(body)
      .expect(403);
  }
});
test('demo rejects cross-site/foreign Host, serves static UI and does not deliver to outside emails', async () => {
  await request(app).get('/demo/state').set('Host', 'evil.example').expect(403);
  await request(app)
    .post('/api/v1/otp-challenges')
    .set('Host', '127.0.0.1:3011')
    .set('Origin', 'https://evil.example')
    .send({})
    .expect(403);
  const page = await request(app)
    .get('/')
    .set('Host', '127.0.0.1:3011')
    .expect(200);
  expect(page.text).toContain('AI DEMO');
  await request(app)
    .get('/demo/inbox/not-a-fixture')
    .set('Host', '127.0.0.1:3011')
    .expect(404);
  await request(app)
    .post('/api/v1/otp-challenges')
    .set('Host', '127.0.0.1:3011')
    .set('Origin', origin)
    .send({
      channel: 'EMAIL',
      contact: 'not-a-fixture@example.com',
      purpose: 'LOGIN',
    })
    .expect(202);
  await request(app)
    .get('/demo/inbox/not-a-fixture')
    .set('Host', '127.0.0.1:3011')
    .expect(404);
});
