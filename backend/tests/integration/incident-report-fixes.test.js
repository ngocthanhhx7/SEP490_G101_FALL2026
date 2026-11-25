import { afterAll, beforeAll, expect, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { financeSourceRuntime } from '../../src/routes/finance-source-runtime.js';
import { errorHandler, notFound, requestId } from '../../src/middlewares/http.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';

const oid = () => new mongoose.Types.ObjectId();
const bookingId = oid();
const visitId = oid();
const customerId = oid();
const sitterId = oid();
const staffId = oid();
const otherUserId = oid();
const sitterPhotoId = 'a'.repeat(64);
const foreignPhotoId = 'b'.repeat(64);
const now = () => Date.parse('2026-11-25T08:00:00Z');

let replica;
let connection;

const actors = {
  sitter: { userId: String(sitterId), roles: ['PET_SITTER'], state: 'ACTIVE' },
  customer: { userId: String(customerId), roles: ['CUSTOMER'], state: 'ACTIVE' },
  staff: { userId: String(staffId), roles: ['STAFF'], state: 'ACTIVE' }
};

const sessionService = {
  async authenticate(req) {
    const found = actors[req.get('x-test-actor')];
    return found ? { ...found, expiresAt: now() + 60000 } : null;
  },
  verifyCsrf: async () => true
};

function makeApp(env = {}) {
  const instance = express();
  instance.use(requestId);
  instance.use(express.json());
  const mod = financeSourceRuntime({
    config: { auth: { enabled: true, tokenSecret: 'synthetic-incident-test-secret-0123456789' } },
    connection,
    sessionService,
    clock: now,
    env: { FINANCE_SOURCES_ENABLED: 'true', ...env }
  });
  instance.use('/api/v1', mod.router);
  instance.use(notFound, errorHandler(() => {}));
  return instance;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_incident_fixes' }).asPromise();
  await provisionFinanceSources(connection);
  const db = connection.db;
  for (const name of ['notifications', 'employeeschedulecommands', 'employeescheduleevents', 'privateimages']) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (!exists.length) await db.createCollection(name);
  }

  await db.collection('users').insertMany([
    { _id: sitterId, displayName: 'Sitter Test', roles: ['PET_SITTER'], state: 'ACTIVE' },
    { _id: customerId, displayName: 'Customer Test', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: staffId, displayName: 'Staff Test', roles: ['STAFF'], state: 'ACTIVE' }
  ]);
  await db.collection('sitterstatuses').insertOne({ userId: sitterId, status: 'ACTIVE' });
  await db.collection('bookings').insertOne({
    _id: bookingId,
    customerId,
    state: 'IN_PROGRESS',
    paymentMode: 'PREPAY',
    paymentState: 'PAID',
    visitIds: [visitId],
    originalVisitCount: 1,
    careVisitCount: 1,
    version: 0
  });
  await db.collection('visits').insertOne({
    _id: visitId,
    bookingId,
    customerId,
    sitterId,
    state: 'IN_PROGRESS',
    version: 0,
    evidenceRefs: []
  });
  await db.collection('privateimages').insertMany([
    { _id: sitterPhotoId, ownerId: sitterId, state: 'READY', contentDigest: 'c'.repeat(64), byteLength: 1024 },
    { _id: foreignPhotoId, ownerId: otherUserId, state: 'READY', contentDigest: 'd'.repeat(64), byteLength: 1024 }
  ]);
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

test('ST-CAS-01: GET /api/v1/incidents/config resolves PAWWORLD_HOTLINE then GROOMING_SHOP_HOTLINE then null', async () => {
  const withPrimary = await request(makeApp({ PAWWORLD_HOTLINE: '1900 9999', GROOMING_SHOP_HOTLINE: '1900 1111' }))
    .get('/api/v1/incidents/config')
    .set('x-test-actor', 'sitter')
    .expect(200);
  expect(withPrimary.body.data).toEqual({ hotline: '1900 9999' });

  const withFallback = await request(makeApp({ GROOMING_SHOP_HOTLINE: '1900 1111' }))
    .get('/api/v1/incidents/config')
    .set('x-test-actor', 'customer')
    .expect(200);
  expect(withFallback.body.data).toEqual({ hotline: '1900 1111' });

  const empty = await request(makeApp({}))
    .get('/api/v1/incidents/config')
    .set('x-test-actor', 'sitter')
    .expect(200);
  expect(empty.body.data).toEqual({ hotline: null });
});

test('ST-CAS-01: Pet sitter incident with uploaded private photo notifies Staff and Customer', async () => {
  const res = await request(makeApp({ PAWWORLD_HOTLINE: '1900 9999' }))
    .post('/api/v1/incidents')
    .set('Host', '127.0.0.1')
    .set('Origin', 'http://127.0.0.1')
    .set('x-test-actor', 'sitter')
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('Idempotency-Key', 'incident-sitter-photo-0001')
    .send({
      visitId: String(visitId),
      category: 'HEALTH_OBSERVATION',
      severity: 'HIGH',
      urgency: 'URGENT',
      description: 'Thú cưng có biểu hiện mệt và bỏ ăn.',
      evidenceRefs: [sitterPhotoId]
    })
    .expect(201);

  const caseId = res.body.data.incident.id;
  const notices = await connection.db.collection('notifications').find({ deepLink: `/cases/${caseId}` }).toArray();
  const recipients = notices.map((n) => ({ recipientId: n.recipientId, role: n.role }));
  expect(recipients).toEqual(
    expect.arrayContaining([
      { recipientId: String(staffId), role: 'STAFF' },
      { recipientId: String(customerId), role: 'CUSTOMER' }
    ])
  );
  expect(recipients.some((r) => r.recipientId === String(sitterId))).toBe(false);
});

test('ST-CAS-01: Customer incident without photo notifies Staff and assigned Pet Sitter', async () => {
  const res = await request(makeApp({}))
    .post('/api/v1/incidents')
    .set('Host', '127.0.0.1')
    .set('Origin', 'http://127.0.0.1')
    .set('x-test-actor', 'customer')
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('Idempotency-Key', 'incident-customer-nophoto-0001')
    .send({
      visitId: String(visitId),
      category: 'OTHER',
      severity: 'LOW',
      urgency: 'ROUTINE',
      description: 'Khách ghi nhận sự cố nhỏ cần Staff theo dõi.',
      evidenceRefs: []
    })
    .expect(201);

  const caseId = res.body.data.incident.id;
  const notices = await connection.db.collection('notifications').find({ deepLink: `/cases/${caseId}` }).toArray();
  const recipients = notices.map((n) => ({ recipientId: n.recipientId, role: n.role }));
  expect(recipients).toEqual(
    expect.arrayContaining([
      { recipientId: String(staffId), role: 'STAFF' },
      { recipientId: String(sitterId), role: 'PET_SITTER' }
    ])
  );
  expect(recipients.some((r) => r.recipientId === String(customerId))).toBe(false);
});

test('ST-CAS-01: Rejects private image owned by another user', async () => {
  const res = await request(makeApp({}))
    .post('/api/v1/incidents')
    .set('Host', '127.0.0.1')
    .set('Origin', 'http://127.0.0.1')
    .set('x-test-actor', 'sitter')
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('Idempotency-Key', 'incident-foreign-photo-0001')
    .send({
      visitId: String(visitId),
      category: 'PROPERTY',
      severity: 'MEDIUM',
      urgency: 'ROUTINE',
      description: 'Thử đính kèm ảnh không thuộc quyền sở hữu.',
      evidenceRefs: [foreignPhotoId]
    })
    .expect(409);

  expect(res.body.error.code).toBe('EVIDENCE_NOT_READY');
});
