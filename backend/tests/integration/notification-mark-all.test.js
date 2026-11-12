import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createMongoNotificationRepository } from '../../src/services/notifications/mongo-notification.repository.js';
import { createNotificationService } from '../../src/services/notifications/notification.service.js';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';

let replica, connection, app, owner, other, Notification;
const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true', SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32) };
const headers = (session, key) => ({ ...base, Cookie: `pwc_session=${session.token}`, 'X-CSRF-Token': session.csrfToken, ...(key ? { 'Idempotency-Key': key } : {}) });
const row = (id, recipientId, extra = {}) => ({ _id: id, eventId: `event-${id}`, recipientId, role: 'CUSTOMER', eventType: 'SYNTHETIC',
  title: `Synthetic ${id}`, message: 'Synthetic notification', channel: 'IN_APP', createdAt: new Date(Date.now() - 60000), readAt: null, ...extra });

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'synthetic_notification_mark_all'; const config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  Notification = connection.models.Notification;
  const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const create = async role => {
    const user = await userModel(connection).create({ displayName: 'Synthetic fixture', roles: [role], state: 'ACTIVE' });
    return connection.transaction(session => sessions.issueInTransaction(user, session));
  };
  owner = await create('CUSTOMER'); other = await create('CUSTOMER');
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('UC-88 marks every unread notification of the caller, across pages, and leaves other scopes and later notifications unread', async () => {
  const mine = Array.from({ length: 45 }, (_, i) => row(`mine-${i}`, owner.user.id));
  await Notification.create([
    ...mine,
    row('mine-already-read', owner.user.id, { readAt: new Date('2026-10-01T00:00:00.000Z') }),
    row('mine-other-role', owner.user.id, { role: 'PET_SITTER' }),
    row('mine-later', owner.user.id, { createdAt: new Date(Date.now() + 3600000) }),
    ...Array.from({ length: 5 }, (_, i) => row(`theirs-${i}`, other.user.id))
  ]);
  const before = await request(app).get('/api/v1/notifications?limit=20').set(headers(owner)).expect(200);
  expect(before.body.data.items).toHaveLength(20); expect(before.body.data.nextCursor).toBeTruthy();
  expect(before.body.data.unreadCount).toBe(46);

  const done = await request(app).post('/api/v1/notifications/read-all').set(headers(owner, 'synthetic-read-all-01')).expect(200);
  expect(done.body.data).toMatchObject({ status: 'READ', markedCount: 45 });

  const after = await request(app).get('/api/v1/notifications?unreadOnly=true&limit=20').set(headers(owner)).expect(200);
  expect(after.body.data.unreadCount).toBe(1);
  expect(after.body.data.items.map(item => item.id)).toEqual(['mine-later']);
  expect(await Notification.countDocuments({ recipientId: owner.user.id, role: 'CUSTOMER', readAt: null })).toBe(1);
  expect(await Notification.countDocuments({ recipientId: owner.user.id, role: 'PET_SITTER', readAt: null })).toBe(1);
  expect(await Notification.countDocuments({ recipientId: other.user.id, readAt: null })).toBe(5);
  const kept = await Notification.findById('mine-already-read').lean();
  expect(kept.readAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
});

test('UC-88 retry returns the original acknowledgement; a distinct request has no new rows to mark', async () => {
  await request(app).post('/api/v1/notifications/read-all').set(headers(owner, 'synthetic-read-all-01')).expect(200)
    .expect(res => expect(res.body.data).toMatchObject({ status: 'READ', markedCount: 45 }));
  await request(app).post('/api/v1/notifications/read-all').set(headers(owner)).expect(200)
    .expect(res => expect(res.body.data.markedCount).toBe(0));
});

test('UC-88 requires a session and CSRF for the write and rejects unexpected bodies', async () => {
  await request(app).post('/api/v1/notifications/read-all').set(base).expect(401);
  await request(app).post('/api/v1/notifications/read-all').set({ ...base, Cookie: `pwc_session=${owner.token}` }).expect(403);
  await request(app).post('/api/v1/notifications/read-all').set(headers(owner)).send({ recipientId: other.user.id }).expect(422);
  expect(await Notification.countDocuments({ recipientId: other.user.id, readAt: null })).toBe(5);
});

test('UC-88 single read receipts keep working next to read-all', async () => {
  const single = await Notification.create(row('mine-single', owner.user.id));
  await request(app).post(`/api/v1/notifications/${single._id}/read-receipts`).set(headers(other)).expect(404);
  await request(app).post(`/api/v1/notifications/${single._id}/read-receipts`).set(headers(owner)).expect(200);
  await request(app).post(`/api/v1/notifications/${single._id}/read-receipts`).set(headers(owner)).expect(200);
  expect((await Notification.findById(single._id).lean()).readAt).toBeTruthy();
});

test('concurrent retries keep the original cutoff, while a new operation can read a later arrival', async () => {
  let time = Date.now();
  const actor = { userId: 'synthetic-replay-owner', state: 'ACTIVE', roles: ['CUSTOMER'] };
  const repository = createMongoNotificationRepository({ connection, cursorSecret: 'synthetic-notification-replay-secret-32-bytes', clock: () => time });
  const service = createNotificationService({ repository, clock: () => time });
  await Notification.create(row('replay-first', actor.userId, { createdAt: new Date(time - 1000) }));
  const command = { actor, idempotencyKey: 'synthetic-stable-command' };
  const [first, concurrent] = await Promise.all([service.markAllRead(command), service.markAllRead(command)]);
  expect(first).toEqual(concurrent);
  expect(first.markedCount).toBe(1);
  time += 2000;
  await Notification.create(row('replay-later', actor.userId, { createdAt: new Date(time - 1000) }));
  expect(await service.markAllRead(command)).toEqual(first);
  expect((await Notification.findById('replay-later').lean()).readAt).toBeNull();
  expect((await service.markAllRead({ actor, idempotencyKey: 'synthetic-new-command' })).markedCount).toBe(1);
  const Event = connection.models.NotificationEvent;
  await Event.create({ _id: 'synthetic-permanent-publication', fingerprint: 'synthetic' });
  expect((await Event.findById('synthetic-permanent-publication').lean()).expiresAt).toBeUndefined();
  const indexes = await Event.collection.indexes();
  expect(indexes.find(index => index.name === 'notification_operation_expiry').expireAfterSeconds).toBe(0);
  const plan = await Notification.collection.find({ recipientId: actor.userId, readAt: null,
    createdAt: { $lte: new Date(time) } }).explain('executionStats');
  expect(plan.executionStats.totalDocsExamined).toBeLessThanOrEqual(2);
});
