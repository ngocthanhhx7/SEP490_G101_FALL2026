import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { demoPricingPolicy, demoServiceCatalog } from '../../src/constants/demo-service-catalog.js';
import { createSchedulingNotifications } from '../../src/services/notifications/scheduling-notifications.service.js';
import { calculateQuote } from '../../src/services/pricing/pricing-calculation.service.js';
import { createWorkspaceAnalytics } from '../../src/services/dashboards/workspace-analytics.service.js';
import { createDomainNotifications } from '../../src/services/notifications/domain-notifications.service.js';

let replica, connection, app, admin, customer, sitter, staff;
const serviceId = new mongoose.Types.ObjectId();
const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true', SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32) };
const headers = session => ({ Host: '127.0.0.1', Origin: 'http://127.0.0.1', Cookie: `pwc_session=${session.token}`, 'X-CSRF-Token': session.csrfToken });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'workspace_refresh_test';
  const config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  await connection.db.createCollection('visits'); await connection.db.createCollection('bookings');
  const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const create = async role => {
    const user = await userModel(connection).create({ displayName: 'Synthetic workspace user', roles: [role], state: 'ACTIVE' });
    return connection.transaction(session => sessions.issueInTransaction(user, session));
  };
  admin = await create('ADMIN'); customer = await create('CUSTOMER'); sitter = await create('PET_SITTER'); staff = await create('STAFF');
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('financial, employee and care notifications remain private, durable and rollback-safe', async () => {
  const notify = createDomainNotifications({ connection });
  const booking = { customerId: customer.user.id };
  const publish = async session => {
    await notify.payment({ eventId: 'synthetic-verified', booking, reconciliation: false }, session);
    await notify.payment({ eventId: 'synthetic-reconciliation', booking, reconciliation: true }, session);
    await notify.payroll({ eventId: 'synthetic-payroll', employeeId: sitter.user.id, type: 'STATEMENT_PREPARED' }, session);
    await notify.application({ applicationId: 'synthetic-application', ownerId: customer.user.id, approved: true }, session);
    await notify.visit({ visitId: 'synthetic-visit', version: 1, customerId: customer.user.id, operation: 'CHECK_IN' }, session);
  };
  await connection.transaction(publish); await connection.transaction(publish);
  const rows = await connection.db.collection('notifications').find({}).toArray();
  expect(rows.filter(row => row.eventId === 'synthetic-verified')).toHaveLength(1);
  expect(rows.filter(row => row.eventType === 'PaymentReconciliationRequired').map(row => row.recipientId).sort()).toEqual([admin.user.id, staff.user.id].sort());
  expect(rows.find(row => row.eventId === 'synthetic-payroll').recipientId).toBe(sitter.user.id);
  await expect(connection.transaction(async session => {
    await notify.payment({ eventId: 'synthetic-rollback', booking, reconciliation: false }, session); throw new Error('Rollback');
  })).rejects.toThrow('Rollback');
  expect(await connection.db.collection('notifications').countDocuments({ eventId: 'synthetic-rollback' })).toBe(0);
  await connection.db.collection('notifications').deleteMany({});
});

test('analytics enforce roles, aggregate all rows and retain zero Vietnam days', async () => {
  await createWorkspaceAnalytics({ connection }).read({ actor: { userId: admin.user.id, state: 'ACTIVE', roles: ['ADMIN'], expiresAt: Date.now() + 60000 }, kind: 'users', query: { days: '7' } });
  await request(app).get('/api/v1/workspaces/users/analytics').expect(401);
  await request(app).get('/api/v1/workspaces/users/analytics').set(headers(customer)).expect(403);
  await request(app).get('/api/v1/workspaces/users/analytics?days=8').set(headers(admin)).expect(422);
  const users = await request(app).get('/api/v1/workspaces/users/analytics?days=7').set(headers(admin)).expect(200);
  expect(users.body.data.metrics[0].value).toBe(4); expect(users.body.data.trend).toHaveLength(7);
  expect(users.body.data.distribution.map(row => row.value)).toEqual([1, 1, 1, 1]);
  expect(JSON.stringify(users.body)).not.toContain(customer.user.id);
  const bookingId = new mongoose.Types.ObjectId();
  await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId: new mongoose.Types.ObjectId(customer.user.id) });
  await connection.db.collection('visits').insertMany(Array.from({ length: 23 }, (_, i) => ({ bookingId,
    customerId: new mongoose.Types.ObjectId(customer.user.id), sitterId: new mongoose.Types.ObjectId(sitter.user.id),
    state: i ? 'COMPLETED' : 'ASSIGNED', startAt: new Date(), snapshots: { serviceName: 'Synthetic service' } })));
  const own = await request(app).get('/api/v1/workspaces/sitter/analytics').set(headers(sitter)).expect(200);
  expect(own.body.data.metrics[0].value).toBe(23); expect(own.body.data.metrics[1].value).toBe(22);
  const customerRead = await request(app).get('/api/v1/workspaces/customer/analytics').set(headers(customer)).expect(200);
  expect(customerRead.body.data.metrics[0].value).toBe(23);
  const stranger = await request(app).get('/api/v1/workspaces/customer/analytics').set(headers({ ...customer, token: sitter.token })).expect(403);
  expect(stranger.body.data).toBeUndefined();
  const otherBooking = new mongoose.Types.ObjectId();
  await connection.db.collection('bookings').insertOne({ _id: otherBooking, customerId: new mongoose.Types.ObjectId() });
  await connection.db.collection('visits').insertOne({ bookingId: otherBooking, customerId: new mongoose.Types.ObjectId(customer.user.id), state: 'COMPLETED', startAt: new Date() });
  const scoped = await request(app).get('/api/v1/workspaces/customer/analytics').set(headers(customer)).expect(200);
  expect(scoped.body.data.metrics[0].value).toBe(23);
  await connection.db.collection('visits').deleteOne({ bookingId: otherBooking });
  await request(app).get('/api/v1/workspaces/admin/analytics').set(headers(staff)).expect(403);
  await request(app).get('/api/v1/workspaces/services/analytics?cursor=invalid').set(headers(admin)).expect(422);
  await connection.db.collection('serviceversions').drop();
  await request(app).get('/api/v1/workspaces/services/analytics').set(headers(admin)).expect(503);
  await connection.models.ServiceVersion.createCollection();
  await connection.models.ServiceVersion.createIndexes();
});

test('combo revisions preserve the complete prior policy, reject stale edits and bound discounts', async () => {
  const policy = await connection.models.PricingPolicy.create({ ...demoPricingPolicy(demoServiceCatalog[0]), serviceId,
    version: 1, status: 'APPROVED', approvedBy: admin.user.id, approvedAt: new Date(), effectiveAt: new Date(), reason: 'Synthetic approved policy' });
  const path = `/api/v1/pricing/services/${serviceId}/combo`;
  await request(app).get(path).set(headers(customer)).expect(403);
  const read = await request(app).get(path).set(headers(admin)).expect(200);
  expect(read.body.data).toMatchObject({ latestVersion: 1, policies: [{ comboPerVisitBps: 100, comboMaxBps: 1000 }] });
  const body = { expectedVersion: 1, effectiveAt: new Date().toISOString(), reason: 'Synthetic discount revision', comboPerVisitBps: 200, comboMaxBps: 1000 };
  const noCsrf = { ...headers(admin) }; delete noCsrf['X-CSRF-Token'];
  await request(app).post(path).set(noCsrf).send(body).expect(403);
  await request(app).post(path).set(headers(admin)).send(body).expect(201);
  await request(app).post(path).set(headers(admin)).send(body).expect(409);
  await request(app).post(path).set(headers(staff)).send(body).expect(403);
  await request(app).post(path).set(headers(admin)).send({ ...body, expectedVersion: 2, comboMaxBps: 1001 }).expect(422);
  const rows = await connection.models.PricingPolicy.find({ serviceId }).sort({ version: 1 }).lean();
  expect(rows).toHaveLength(2); expect(rows[0].comboPerVisitBps).toBe(100); expect(rows[1].comboPerVisitBps).toBe(200);
  expect(rows[1].rules).toEqual(policy.toObject().rules); expect(rows[1].billingMode).toBe(policy.billingMode);
  expect(rows[1].unitMinutes).toBe(policy.unitMinutes); expect(rows[1].approvedBy.toString()).toBe(admin.user.id);
  const quote = calculateQuote({ baseAmountVnd: 100000, priceVersion: 1, policy: rows[1],
    pets: [{ species: 'DOG', weightKg: 3, traits: [], breedCode: 'synthetic-dog' }], durationMinutes: rows[1].unitMinutes, visitCount: 3 });
  expect(quote.lines.find(row => row.code === 'COMBO_DISCOUNT').bps).toBe(600);
});

test('transactional scheduling messages are private, idempotent and rollback with the event', async () => {
  const visit = await connection.db.collection('visits').findOne({});
  const notifications = createSchedulingNotifications({ col: name => connection.db.collection(name) });
  const event = { type: 'OfferCreated', sitterId: sitter.user.id, visitId: String(visit._id), offerId: String(new mongoose.Types.ObjectId()) };
  for (let i = 0; i < 2; i++) await connection.transaction(session => notifications.publish(event, session));
  const endpoint = '/api/v1/notifications';
  const own = await request(app).get(endpoint).set(headers(sitter)).expect(200);
  expect(own.body.data.items).toHaveLength(1); expect(own.body.data.unreadCount).toBe(1);
  expect(own.body.data.items[0].deepLink).toBe('/sitter/invitations');
  expect((await request(app).get(endpoint).set(headers(customer))).body.data.items).toEqual([]);
  await expect(connection.transaction(async session => { await notifications.publish({ ...event, offerId: 'rolled-back' }, session); throw new Error('Synthetic rollback'); })).rejects.toThrow('Synthetic rollback');
  expect(await connection.db.collection('notifications').countDocuments({ recipientId: sitter.user.id })).toBe(1);
  await connection.transaction(session => notifications.publish({ ...event, type: 'OfferAccepted' }, session));
  for (const user of [customer, admin, staff]) expect((await request(app).get(endpoint).set(headers(user))).body.data.items).toHaveLength(1);
  const id = own.body.data.items[0].id;
  await request(app).post(`${endpoint}/${id}/read-receipts`).set(headers(customer)).expect(404);
  await request(app).post(`${endpoint}/${id}/read-receipts`).set(headers(sitter)).expect(200);
  expect((await request(app).get(endpoint).set(headers(sitter))).body.data.unreadCount).toBe(0);
  await connection.db.collection('notifications').insertOne({ _id: 'shared-notice', recipientId: customer.user.id, role: null,
    title: 'Synthetic account notice', message: 'Safe synthetic content', createdAt: new Date(), readAt: null });
  expect((await request(app).get(endpoint).set(headers(customer))).body.data.items.some(row => row.id === 'shared-notice')).toBe(true);
});
