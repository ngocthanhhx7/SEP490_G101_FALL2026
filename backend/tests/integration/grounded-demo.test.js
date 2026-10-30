import { afterAll, beforeAll, expect, test, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { platformDataModels } from '../../src/models/platform-data.model.js';
import { userModel } from '../../src/models/user.model.js';
import { edgeKey } from '../../src/services/sitter-matching/routing.service.js';
import { seedDemo, assertDemoDatabase, groundedRoutingProvider, validateGroundedSnapshot,
  GROUNDED_DEMO_DATABASE, GROUNDED_ROUTING_SOURCE, DEMO_DATABASE } from '../../scripts/demo-ai/fixtures.js';
import { createDemoApp } from '../../scripts/demo-ai/server.js';

// Synthetic transport fixture tests exact replay. These are not measured ETA
// observations or the collected public snapshot, and are never training data.
const snapshot = () => ({ kind: 'PWC_PUBLIC_OSRM_SAMPLE_V1', source: 'OSRM_STATIC_ROAD_ETA',
  observedAt: '2026-01-01T00:00:00Z', graphSha256: 'a'.repeat(64), osmSha256: 'b'.repeat(64),
  profile: 'OSRM_CAR_V2610', bounds: [105.15, 20.45, 106.15, 21.55],
  points: [[105.8, 21.01], [105.81, 21.02], [105.82, 21.03]],
  durations: [[0, 120, null], [180, 0, 240], [null, 300, 0]],
  distances: [[0, 1000, null], [1200, 0, 1500], [null, 1700, 0]],
  snappingDistances: [0, 0, 0], groundTruthTravelTimes: false, customerData: false,
  attribution: 'Synthetic test of OpenStreetMap contributors attribution contract',
  purpose: 'Synthetic integration fixture only; not collected observations' });
let replica, connection, config, manifest, app;
const origin = 'http://127.0.0.1:3012';
jest.setTimeout(180000);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  const env = { NODE_ENV: 'development', MONGO_URI: replica.getUri(), MONGO_DB: GROUNDED_DEMO_DATABASE,
    AUTH_ENABLED: 'true', AI_ENABLED: 'true', EMAIL_ENABLED: 'false', SMS_ENABLED: 'false',
    OTP_HMAC_SECRET: 'test-grounded-otp-secret-at-least32',
    SESSION_TOKEN_SECRET: 'test-grounded-token-secret-at-least32',
    SESSION_CSRF_SECRET: 'test-grounded-csrf-secret-at-least32',
    CONTACT_LOOKUP_SECRET: 'test-grounded-lookup-secret-at-least32', CONTACT_ENCRYPTION_KEY: 'a'.repeat(32) };
  for (const seed of ['service-catalog.js', 'registration-policies.js', 'pricing.js', 'sitter-matching.js']) {
    await promisify(execFile)(process.execPath, ['scripts/seeds/' + seed, '--apply'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)), env: { ...process.env, ...env }, stdio: 'pipe'
    });
  }
  config = loadConfig(env); connection = await connectDatabase(config);
  manifest = await seedDemo(connection, config, Date.now, { groundedSnapshot: snapshot() });
  app = createDemoApp({ config, connection, manifest, origin, groundedSnapshot: snapshot() });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('grounded guard requires its exact separate database, local host and port, with no production seed', async () => {
  expect(() => assertDemoDatabase({ name: DEMO_DATABASE, host: '127.0.0.1' }, true)).toThrow();
  expect(() => assertDemoDatabase({ name: GROUNDED_DEMO_DATABASE, host: 'remote.example' }, true)).toThrow();
  expect(() => assertDemoDatabase({ name: GROUNDED_DEMO_DATABASE, host: '127.0.0.1' })).toThrow();
  expect(() => createDemoApp({ config, connection, manifest, origin: 'http://127.0.0.1:3011', groundedSnapshot: snapshot() })).toThrow();
  expect(() => createDemoApp({ config, connection, manifest, origin, groundedSnapshot: undefined })).toThrow();
  await expect(seedDemo(connection, { ...config, nodeEnv: 'production' }, Date.now, { groundedSnapshot: snapshot() })).rejects.toThrow();
  await request(app).get('/demo/state').set('Host', 'evil.example').expect(403);
});

test('replays asymmetric collected seconds and null edges exactly; rejects absent points and invalid evidence', async () => {
  const value = snapshot(), provider = groundedRoutingProvider(value);
  value.durations[0][1] = 9999; // Provider owns an immutable copy of captured evidence.
  const result = await provider.matrix(snapshot().points);
  expect(result.source).toBe(GROUNDED_ROUTING_SOURCE);
  expect(result.map.get(edgeKey(snapshot().points[0], snapshot().points[1]))).toBe(2);
  expect(result.map.get(edgeKey(snapshot().points[1], snapshot().points[0]))).toBe(3);
  expect(result.map.get(edgeKey(snapshot().points[0], snapshot().points[2]))).toBeNull();
  await expect(provider.matrix([[105.800001, 21.01]])).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  for (const invalid of [{ ...snapshot(), source: 'SIMULATED' }, { ...snapshot(), customerData: true },
    { ...snapshot(), graphSha256: '' }, { ...snapshot(), observedAt: '2099-01-01T00:00:00Z' },
    { ...snapshot(), durations: [[0]] }, { ...snapshot(), profile: 'motorbike' }]) {
    expect(() => validateGroundedSnapshot(invalid)).toThrow();
  }
});

test('seed uses only snapshot coordinates and no invented ratings, outcomes, model or experience', async () => {
  const models = platformDataModels(connection);
  const again = await seedDemo(connection, config, Date.now, { groundedSnapshot: snapshot() });
  expect(again.accounts).toHaveLength(16);
  expect(again.trainingObservations).toBe(0);
  expect(again.sitters.every(row => row.rating === null && row.visits === 0 && row.faults === 0)).toBe(true);
  expect(await models.SitterVisitOutcome.countDocuments()).toBe(0);
  expect(await models.SitterRankModel.countDocuments()).toBe(0);
  const users = await userModel(connection).find().lean();
  expect(users.every(user => user.displayName.startsWith('[DEMO]') && user.fixtureKey.startsWith('ai-grounded-demo:'))).toBe(true);
  const allowed = new Set(snapshot().points.map(row => JSON.stringify(row)));
  const addresses = await models.CustomerAddress.find().select('+point').lean();
  const blocks = await models.SitterScheduleBlock.find().select('+point').lean();
  const profiles = await models.SitterMatchingProfile.find().select('+starts').lean();
  const points = [...addresses.map(row => row.point.coordinates), ...blocks.map(row => row.point.coordinates),
    ...profiles.flatMap(row => row.starts.map(start => start.point.coordinates))];
  expect(points.every(point => allowed.has(JSON.stringify(point)))).toBe(true);
  await request(app).post('/api/v1/ai/admin/outcomes').set('Host', '127.0.0.1:3012').set('Origin', origin).send({}).expect(403);
});

test('real OTP/session and recommendation APIs use captured road evidence with limited history', async () => {
  const account = manifest.accounts.find(row => row.key === 'customer-an');
  const agent = request.agent(app), headers = { Host: '127.0.0.1:3012', Origin: origin };
  const payload = { channel: 'EMAIL', contact: account.email, purpose: 'LOGIN' };
  const challenge = await agent.post('/api/v1/otp-challenges').set(headers).send(payload).expect(202);
  const inbox = await agent.get('/demo/inbox/' + account.key).set(headers).expect(200);
  const session = await agent.post('/api/v1/sessions').set(headers).send({ ...payload,
    challengeId: challenge.body.data.challengeId, code: inbox.body.code, rememberDevice: false }).expect(200);
  expect(session.headers['set-cookie'][0]).toMatch(/^pwc_grounded_session=/);
  const authenticated = { ...headers, Cookie: session.headers['set-cookie'][0].split(';')[0], 'X-CSRF-Token': session.body.data.csrfToken };
  const body = { ...manifest.scenarios[0] };
  delete body.key; delete body.label; delete body.ownerId;
  const match = await agent.post('/api/v1/ai/recommendations').set(authenticated).send(body).expect(201);
  expect(match.headers['x-pwc-demo-routing']).toBe(GROUNDED_ROUTING_SOURCE);
  expect(match.body.data.routingSource).toBe(GROUNDED_ROUTING_SOURCE);
  expect(match.body.meta.routingEvidence.graphSha256).toBe(snapshot().graphSha256);
  // With no observed history, the current production threshold can reject all
  // declared profiles. The demo must preserve that result rather than seed fake
  // outcomes or lower the financial/eligibility/scoring rules to fill a list.
  expect(match.body.data.returned).toBe(0);
  expect(match.body.data.shortfall).toBe(5);
  expect(match.body.data.exclusions.BELOW_AUTOMATIC_THRESHOLD).toBeGreaterThan(0);
  const caches = await platformDataModels(connection).RoutingMatrixCache.find().lean();
  expect(caches.length).toBeGreaterThan(0);
  expect(caches.every(row => row.source === GROUNDED_ROUTING_SOURCE)).toBe(true);
});
