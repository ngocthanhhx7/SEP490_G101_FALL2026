import { afterAll, beforeAll, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { createVisitReminderJob } from '../../src/jobs/visit-reminder.job.js';

let replica;
let connection;
let app;
let owner;
let other;
let sitter;
let admin;
let Notification;
let config;

const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const env = {
  NODE_ENV: 'test',
  AUTH_ENABLED: 'true',
  SESSION_TOKEN_SECRET: 'a'.repeat(48),
  SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(48),
  CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
};

const headers = (session, key) => ({
  ...base,
  Cookie: `pwc_session=${session.token}`,
  'X-CSRF-Token': session.csrfToken,
  ...(key ? { 'Idempotency-Key': key } : {})
});

const row = (id, recipientId, extra = {}) => ({
  _id: id,
  eventId: `event-${id}`,
  recipientId,
  role: 'CUSTOMER',
  eventType: 'SYNTHETIC',
  title: `Synthetic ${id}`,
  message: 'Synthetic notification',
  channel: 'IN_APP',
  deepLink: '/account/bookings',
  createdAt: new Date(Date.now() - 60000),
  readAt: null,
  ...extra
});

async function createSession(role) {
  const user = await userModel(connection).create({ displayName: `Synthetic ${role}`, roles: [role], state: 'ACTIVE' });
  return connection.transaction(session => createSessionService({
    connection,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  }).issueInTransaction(user, session));
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri();
  env.MONGO_DB = 'synthetic_fe19_notifications';
  config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  Notification = connection.models.Notification;
  owner = await createSession('CUSTOMER');
  other = await createSession('CUSTOMER');
  sitter = await createSession('PET_SITTER');
  admin = await createSession('ADMIN');
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  await Notification.deleteMany({});
  await connection.models.NotificationEvent?.deleteMany({});
});

describe('FE-19 UC-88 - View Notifications', () => {
  test('IT-FE19-UC88-01 lists notifications for the signed-in user', async () => {
    await Notification.create(row('owner-01', owner.user.id));
    await Notification.create(row('other-01', other.user.id));

    const response = await request(app).get('/api/v1/notifications').set(headers(owner)).expect(200);
    expect(response.body.data.items.map(item => item.id)).toEqual(['owner-01']);
  });

  test('IT-FE19-UC88-02 isolates notifications between users', async () => {
    await Notification.create(row('owner-02', owner.user.id));
    await Notification.create(row('other-02', other.user.id));

    const response = await request(app).get('/api/v1/notifications').set(headers(other)).expect(200);
    expect(response.body.data.items.map(item => item.id)).toEqual(['other-02']);
    expect(JSON.stringify(response.body)).not.toContain('owner-02');
  });

  test('IT-FE19-UC88-03 and 04 filter All and Unread with the correct unread count', async () => {
    await Notification.create([
      row('all-unread', owner.user.id),
      row('all-read', owner.user.id, { readAt: new Date('2026-01-01T00:00:00.000Z') })
    ]);

    const all = await request(app).get('/api/v1/notifications?unreadOnly=false').set(headers(owner)).expect(200);
    expect(all.body.data.items.map(item => item.id).sort()).toEqual(['all-read', 'all-unread']);
    expect(all.body.data.unreadCount).toBe(1);

    const unread = await request(app).get('/api/v1/notifications?unreadOnly=true').set(headers(owner)).expect(200);
    expect(unread.body.data.items.map(item => item.id)).toEqual(['all-unread']);
    expect(unread.body.data.unreadCount).toBe(1);
  });

  test('IT-FE19-UC88-05 marks one notification read in the database', async () => {
    await Notification.create(row('single-read', owner.user.id));
    await request(app).post('/api/v1/notifications/single-read/read-receipts').set(headers(owner)).expect(200);

    expect((await Notification.findById('single-read').lean()).readAt).toBeTruthy();
    const unread = await request(app).get('/api/v1/notifications?unreadOnly=true').set(headers(owner)).expect(200);
    expect(unread.body.data.unreadCount).toBe(0);
  });

  test('IT-FE19-UC88-06 marks all notifications read and leaves another account unchanged', async () => {
    await Notification.create([row('all-read-01', owner.user.id), row('all-read-02', owner.user.id), row('other-read-01', other.user.id)]);
    const response = await request(app).post('/api/v1/notifications/read-all').set(headers(owner, 'fe19-read-all-01')).expect(200);

    expect(response.body.data).toMatchObject({ status: 'READ', markedCount: 2 });
    expect(await Notification.countDocuments({ recipientId: owner.user.id, readAt: null })).toBe(0);
    expect(await Notification.countDocuments({ recipientId: other.user.id, readAt: null })).toBe(1);
  });

  test('IT-FE19-UC88-07 resolves a booking notification to the owned booking', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId: new mongoose.Types.ObjectId(owner.user.id) });
    const notificationId = 'a'.repeat(64);
    await Notification.create(row(notificationId, owner.user.id, { deepLink: `/account/bookings/${bookingId}` }));

    const response = await request(app).get(`/api/v1/notifications/${notificationId}/intent`).set(headers(owner)).expect(200);
    expect(response.body.data).toEqual({ to: `/account/bookings/${bookingId}` });
  });

  test('IT-FE19-UC88-12 lists an existing rejected-goods notification for Admin', async () => {
    const notifications = await connection.db.collection('notifications');
    await notifications.insertOne({
      _id: 'fe19-goods-rejected', eventId: 'goods-receipt:GR-FE19:product-01', recipientId: admin.user.id,
      role: 'ADMIN', eventType: 'GoodsReceiptRejected', title: 'Hàng nhập bị từ chối',
      message: 'Phiếu nhập GR-FE19: từ chối 2 Synthetic food. Lý do: damaged.', channel: 'IN_APP',
      deepLink: '/admin/goods-receipts?receipt=GR-FE19', createdAt: new Date(), readAt: null
    });

    const response = await request(app).get('/api/v1/notifications').set(headers(admin)).expect(200);
    expect(response.body.data.items[0]).toMatchObject({ eventType: 'GoodsReceiptRejected', deepLink: '/admin/goods-receipts?receipt=GR-FE19' });
  });

  test('IT-FE19-UC88-13 loads the next page without duplicates', async () => {
    await Notification.create(Array.from({ length: 3 }, (_, index) => row(`${'a'.repeat(63)}${index}`, owner.user.id, {
      createdAt: new Date(Date.now() - index * 1000)
    })));
    const first = await request(app).get('/api/v1/notifications?limit=2').set(headers(owner)).expect(200);
    const second = await request(app).get('/api/v1/notifications').query({ limit: 2, cursor: first.body.data.nextCursor }).set(headers(owner)).expect(200);
    expect(new Set(second.body.data.items.map(item => item.id)).size).toBe(1);
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
  });

  test('IT-FE19-UC88-14 reloads the latest database state', async () => {
    await Notification.create(row('reload-before', owner.user.id));
    const first = await request(app).get('/api/v1/notifications').set(headers(owner)).expect(200);
    await Notification.create(row('reload-after', owner.user.id, { createdAt: new Date(Date.now() + 1000) }));
    const second = await request(app).get('/api/v1/notifications').set(headers(owner)).expect(200);
    expect(first.body.data.items.map(item => item.id)).toEqual(['reload-before']);
    expect(second.body.data.items.map(item => item.id)).toEqual(['reload-after', 'reload-before']);
  });

  test('IT-FE19-UC88-08 resolves Visit and sitter invitation notifications to their target screen', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    const visitId = new mongoose.Types.ObjectId();
    const offerId = new mongoose.Types.ObjectId();
    const visitNotificationId = 'b'.repeat(64);
    const offerNotificationId = 'c'.repeat(64);
    await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId: new mongoose.Types.ObjectId(owner.user.id) });
    await connection.db.collection('visits').insertOne({ _id: visitId, bookingId, state: 'ASSIGNED', sitterId: new mongoose.Types.ObjectId(sitter.user.id) });
    await connection.db.collection('employeevisitoffers').insertOne({ _id: offerId, sitterId: sitter.user.id, visitId, state: 'PENDING' });
    await Notification.create([
      row(visitNotificationId, owner.user.id, { deepLink: `/account/bookings/${bookingId}/visits/${visitId}` }),
      row(offerNotificationId, sitter.user.id, { role: 'PET_SITTER', deepLink: `/sitter/invitations?offerId=${offerId}` })
    ]);

    const visitResponse = await request(app).get(`/api/v1/notifications/${visitNotificationId}/intent`).set(headers(owner)).expect(200);
    const offerResponse = await request(app).get(`/api/v1/notifications/${offerNotificationId}/intent`).set(headers(sitter)).expect(200);
    expect(visitResponse.body.data).toEqual({ to: `/account/bookings/${bookingId}/visits/${visitId}` });
    expect(offerResponse.body.data).toEqual({ to: `/sitter/invitations?offerId=${offerId}` });
  });

  test('IT-FE19-UC88-09 resolves payment notifications to the owned booking payment screen', async () => {
    const bookingId = new mongoose.Types.ObjectId();
    const notificationId = 'd'.repeat(64);
    await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId: new mongoose.Types.ObjectId(owner.user.id) });
    await Notification.create(row(notificationId, owner.user.id, {
      eventType: 'PaymentVerified', deepLink: `/account/bookings/${bookingId}`
    }));

    const response = await request(app).get(`/api/v1/notifications/${notificationId}/intent`).set(headers(owner)).expect(200);
    expect(response.body.data).toEqual({ to: `/account/bookings/${bookingId}` });
  });

  test('IT-FE19-UC88-10 resolves online product order notifications to the owned order', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const notificationId = 'e'.repeat(64);
    await connection.db.collection('productorders').insertOne({ _id: orderId, customerId: new mongoose.Types.ObjectId(owner.user.id) });
    await Notification.create(row(notificationId, owner.user.id, {
      eventType: 'ProductOrderUpdated', deepLink: `/customer/product-orders?order=${orderId}`
    }));

    const response = await request(app).get(`/api/v1/notifications/${notificationId}/intent`).set(headers(owner)).expect(200);
    expect(response.body.data).toEqual({ to: `/customer/product-orders?order=${orderId}` });
  });

  test('IT-FE19-UC88-11 resolves grooming appointment notifications to the owned appointment', async () => {
    const appointmentId = new mongoose.Types.ObjectId();
    const notificationId = 'f'.repeat(64);
    await connection.db.collection('groomingappointments').insertOne({ _id: appointmentId, customerId: new mongoose.Types.ObjectId(owner.user.id) });
    await Notification.create(row(notificationId, owner.user.id, {
      eventType: 'GroomingAppointmentUpdated', deepLink: `/grooming-booking?appointment=${appointmentId}`
    }));

    const response = await request(app).get(`/api/v1/notifications/${notificationId}/intent`).set(headers(owner)).expect(200);
    expect(response.body.data).toEqual({ to: `/grooming-booking?appointment=${appointmentId}` });
  });
});

describe('FE-19 JOB-01 - Visit reminders', () => {
  const visit = (overrides = {}) => ({
    visitId: 'visit-fe19', bookingId: 'booking-fe19', customerId: owner.user.id, sitterId: other.user.id,
    state: 'ASSIGNED', scheduleVersion: 1, startAt: '2026-11-25T05:00:00.000Z', ...overrides
  });

  function makeJob({ candidate = visit(), send = jest.fn(async () => ({ status: 'ACCEPTED' })) } = {}) {
    const delivered = new Set();
    const repository = {
      findUpcomingVisits: jest.fn(async () => [candidate]),
      createReminderAtomically: jest.fn(async ({ idempotencyKey }) => delivered.has(idempotencyKey)
        ? { status: 'ALREADY_EXISTS' } : { status: 'READY' }),
      markReminderDelivered: jest.fn(async ({ idempotencyKey }) => delivered.add(idempotencyKey)),
      markReminderFailed: jest.fn()
    };
    return { repository, send, job: createVisitReminderJob({ repository, notifier: { sendVisitReminder: send }, clock: () => new Date('2026-11-25T03:00:00.000Z'), leadMinutes: 120 }) };
  }

  test('IT-FE19-UC88-15 sends one reminder containing Customer and Pet Sitter recipients', async () => {
    const { job, send } = makeJob();
    await expect(job.runOnce()).resolves.toMatchObject({ reminded: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipients: [owner.user.id, other.user.id], leadMinutes: 120 }));
  });

  test('IT-FE19-UC88-16 does not create a duplicate reminder for the same schedule', async () => {
    const { job, send } = makeJob();
    await job.runOnce();
    await job.runOnce();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('IT-FE19-UC88-17 retries after notification persistence fails without marking delivery', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('synthetic database failure')).mockResolvedValueOnce({ status: 'ACCEPTED' });
    const { job, repository } = makeJob({ send });
    await expect(job.runOnce()).resolves.toMatchObject({ failed: 1, reminded: 0 });
    expect(repository.markReminderDelivered).not.toHaveBeenCalled();
    await expect(job.runOnce()).resolves.toMatchObject({ reminded: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('IT-FE19-UC88-18 sends the next schedule version to the replacement Pet Sitter only', async () => {
    const { job, send, repository } = makeJob();
    repository.findUpcomingVisits
      .mockResolvedValueOnce([visit({ scheduleVersion: 1 })])
      .mockResolvedValueOnce([visit({ scheduleVersion: 2, sitterId: 'replacement-sitter', recipients: ['replacement-sitter'] })]);

    await expect(job.runOnce()).resolves.toMatchObject({ reminded: 1 });
    await expect(job.runOnce()).resolves.toMatchObject({ reminded: 1 });
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ recipients: [owner.user.id, other.user.id], scheduleVersion: 1 }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ recipients: ['replacement-sitter'], scheduleVersion: 2 }));
  });
});
