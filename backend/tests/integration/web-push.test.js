import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { generateVAPIDKeys } from 'web-push';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { userModel } from '../../src/models/user.model.js';
import { createSessionService } from '../../src/services/session.service.js';
import { createWebPushService } from '../../src/services/notifications/web-push.service.js';

const keys = generateVAPIDKeys();
const env = {
  NODE_ENV: 'test', MONGO_DB: 'web_push_isolated', AUTH_ENABLED: 'true',
  SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
  WEB_PUSH_ENABLED: 'true', WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey,
  WEB_PUSH_CONTACT: 'mailto:fixture@example.com'
};
const baseHeaders = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const headers = session => ({ ...baseHeaders, 'X-CSRF-Token': session.csrfToken, Cookie: `pwc_session=${session.token}` });
const device = id => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/synthetic-${id}`,
  keys: { p256dh: keys.publicKey, auth: randomBytes(16).toString('base64url') }
});
const enabledUrl = '/api/v1/notifications/push';
const subscriptionsUrl = '/api/v1/notifications/subscriptions';
let replica, connection, app, owner, other, Notification, AuthSession, webPush, time;
const clock = () => time;
const send = jest.fn();
const actor = session => ({ userId: session.user.id, sessionId: session.sessionId });

beforeAll(async () => {
  time = Date.now();
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri();
  const config = loadConfig(env);
  connection = await mongoose.createConnection(env.MONGO_URI, { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, clock });
  const sessionPort = createSessionService({ connection, ...config.auth, clock });
  const issue = async () => {
    const user = await userModel(connection).create({ displayName: 'Synthetic', state: 'ACTIVE', roles: ['CUSTOMER'] });
    return connection.transaction(session => sessionPort.issueInTransaction(user, session));
  };
  owner = await issue();
  other = await issue();
  ({ Notification, AuthSession } = connection.models);
  await AuthSession.createIndexes();
  await Notification.createIndexes();
  webPush = createWebPushService({ connection, config: config.webPush, sessionPort, clock, send });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('device subscription requires a session, CSRF, a supported push endpoint and valid configuration', async () => {
  const subscription = device('required');
  await request(app).get(enabledUrl).set(baseHeaders).expect(401);
  await request(app).post(subscriptionsUrl).set(baseHeaders).send({ subscription }).expect(401);
  await request(app).post(subscriptionsUrl).set({ ...baseHeaders, Cookie: `pwc_session=${owner.token}` })
    .send({ subscription }).expect(403);
  await request(app).post(subscriptionsUrl).set(headers(owner))
    .send({ subscription: { ...subscription, endpoint: 'https://example.com/send' } }).expect(400);
  await request(app).get(enabledUrl).set(headers(owner)).expect('Cache-Control', 'private, no-store').expect(200)
    .expect(response => expect(response.body.data).toEqual({ enabled: true, subscribed: false, publicKey: keys.publicKey }));
  expect(() => loadConfig({ ...env, WEB_PUSH_PUBLIC_KEY: generateVAPIDKeys().publicKey })).toThrow(/WEB_PUSH_PUBLIC_KEY/);
});

test('worker sends one generic alert from eligible new unread notifications and unsubscribes when the endpoint is gone', async () => {
  const subscription = device('delivery');
  const notification = (id, recipientId, role, at) => ({
    _id: id, recipientId, role, createdAt: new Date(at), title: 'Synthetic title', message: 'Synthetic detail'
  });
  await Notification.create(notification('old', owner.user.id, 'CUSTOMER', time - 60_000));
  await request(app).post(subscriptionsUrl).set(headers(owner)).send({ subscription }).expect(201);
  await request(app).post(subscriptionsUrl).set(headers(owner)).send({ subscription }).expect(201)
    .expect(response => expect(response.body.data.status).toBe('ALREADY_EXISTS'));
  time += 10_000;
  await Notification.create([
    notification('new', owner.user.id, 'CUSTOMER', time),
    notification('wrong-role', owner.user.id, 'PET_SITTER', time + 1),
    notification('other-owner', other.user.id, 'CUSTOMER', time + 2)
  ]);
  time += 10_000;
  await Promise.all([webPush.runBatch(), webPush.runBatch()]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0].slice(0, 2)).toEqual([subscription, '{}']);
  time += 61_000;
  await webPush.runBatch();
  expect(send).toHaveBeenCalledTimes(1);
  await Notification.create(notification('later', owner.user.id, null, time + 1000));
  time += 61_000;
  send.mockRejectedValueOnce(Object.assign(new Error('expired'), { statusCode: 410 }));
  await webPush.runBatch();
  expect(send).toHaveBeenCalledTimes(2);
  expect((await webPush.status(actor(owner))).subscribed).toBe(false);
  const indexNames = (await AuthSession.collection.indexes()).map(index => index.name);
  expect(indexNames).toEqual(expect.arrayContaining(['auth_session_push_endpoint', 'auth_session_push_due', 'expiresAt_1']));
});

test('registration can move an owned browser endpoint and revoke or disable the session separately', async () => {
  const subscription = device('switch');
  await webPush.subscribe(actor(owner), subscription);
  await expect(webPush.subscribe(actor(other), { ...subscription, keys: { ...subscription.keys, auth: device('invalid').keys.auth } }))
    .rejects.toMatchObject({ code: 'PUSH_SUBSCRIPTION_CONFLICT' });
  expect((await webPush.status(actor(owner))).subscribed).toBe(true);
  await webPush.subscribe(actor(other), subscription);
  expect((await webPush.status(actor(owner))).subscribed).toBe(false);
  expect((await webPush.status(actor(other))).subscribed).toBe(true);
  await request(app).delete(subscriptionsUrl).set(headers(owner)).expect(200);
  expect((await webPush.status(actor(other))).subscribed).toBe(true);
  await AuthSession.updateOne({ sessionId: other.sessionId }, { $set: { revokedAt: new Date(time) } });
  expect((await webPush.status(actor(other))).subscribed).toBe(false);
  await request(app).get(enabledUrl).set(headers(other)).expect(401);
});
