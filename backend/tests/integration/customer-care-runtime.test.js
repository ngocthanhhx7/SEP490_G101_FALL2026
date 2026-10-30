import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { createMongoNotificationRepository } from '../../src/services/notifications/mongo-notification.repository.js';
import { createNotificationService } from '../../src/services/notifications/notification.service.js';

let replica, connection, app, owner, other, staff, config, petId, addressId;
const base = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const env = { NODE_ENV: 'test', AUTH_ENABLED: 'true', SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48), CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
  BOOKING_CHECKOUT_ENABLED: 'true', EMPLOYEE_SCHEDULING_ENABLED: 'true' };
const pet = { name: 'Synthetic dog', species: 'DOG', breedCode: 'test-dog', weightKg: 4.2, traits: [], careNeedsConfirmed: false,
  ageMonths: 12, sex: 'UNKNOWN', careProfile: { allergies: { status: 'UNKNOWN' }, feeding: { status: 'KNOWN', value: 'Synthetic meal instructions' } } };
const address = { label: 'Synthetic home', location: 'Synthetic street, Hanoi', areaCode: 'DISTRICT_HAI_BA_TRUNG',
  coordinates: [105.85, 21.03], pointConfirmed: true, privateAccessNotes: 'Synthetic owner-only access note' };
const headers = (session, key) => ({ ...base, Cookie: `pwc_session=${session.token}`, 'X-CSRF-Token': session.csrfToken, ...(key ? { 'Idempotency-Key': key } : {}) });
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri(); env.MONGO_DB = 'synthetic_customer_care'; config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  app = createApp({ config, connection, env, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  await connection.db.createCollection('bookings'); await connection.db.createCollection('visits');
  const sessions = createSessionService({ connection, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  const create = async role => {
    const user = await userModel(connection).create({ displayName: 'Synthetic fixture', roles: [role], state: 'ACTIVE' });
    return connection.transaction(session => sessions.issueInTransaction(user, session));
  };
  owner = await create('CUSTOMER'); other = await create('CUSTOMER'); staff = await create('STAFF');
  await connection.models.PetBreed.create({ code: 'test-dog', name: 'Synthetic dog breed', species: 'DOG', active: true, source: 'Synthetic test fixture' });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('real session/CSRF runtime creates one shared pet across concurrent retries, validates care and isolates owners', async () => {
  await request(app).get('/api/v1/pet-care/pets').expect(401);
  await request(app).get('/api/v1/pet-care/pets').set(headers(staff)).expect(403);
  await request(app).post('/api/v1/pet-care/pets').set({ ...base, Cookie: `pwc_session=${owner.token}` }).send(pet).expect(403);
  const responses = await Promise.all([1, 2].map(() => request(app).post('/api/v1/pet-care/pets').set(headers(owner, 'synthetic-pet-create-01')).send(pet)));
  expect(responses.map(row => ({ status: row.status, body: row.body })) ).toEqual([expect.objectContaining({ status: 201 }), expect.objectContaining({ status: 201 })]);
  expect(responses[0].body.data).toEqual(responses[1].body.data); petId = responses[0].body.data.id;
  expect(await connection.models.Pet.countDocuments()).toBe(1);
  const list = await request(app).get('/api/v1/pet-care/pets').set(headers(owner)).expect(200);
  expect(list.body.data[0]).toMatchObject({ id: petId, careProfile: pet.careProfile, weightKg: 4.2 });
  expect((await request(app).get('/api/v1/pet-care/pets').set(headers(other)).expect(200)).body.data).toEqual([]);
  await request(app).post('/api/v1/pet-care/pets').set(headers(owner, 'synthetic-pet-create-01')).send({ ...pet, name: 'Changed' }).expect(409);
  await request(app).post('/api/v1/pet-care/pets').set(headers(owner, 'synthetic-pet-invalid-01')).send({ ...pet, careProfile: { allergies: { status: 'UNKNOWN', value: 'Not safe' } } }).expect(422);
  await request(app).patch(`/api/v1/pet-care/pets/${petId}`).set(headers(other, 'synthetic-pet-other-01')).send({ ...pet, expectedVersion: 0 }).expect(409);
  await request(app).patch(`/api/v1/pet-care/pets/${petId}`).set(headers(owner, 'synthetic-pet-update-01')).send({ ...pet, name: 'Updated fixture', expectedVersion: 0 }).expect(200);
  await request(app).patch(`/api/v1/pet-care/pets/${petId}`).set(headers(owner, 'synthetic-pet-stale-01')).send({ ...pet, expectedVersion: 0 }).expect(409);
  const withoutAge = { ...pet, expectedVersion: 1 };
  delete withoutAge.ageMonths;
  await request(app).patch(`/api/v1/pet-care/pets/${petId}`).set(headers(owner, 'synthetic-pet-clear-age')).send(withoutAge).expect(200);
  const cleared = await request(app).get('/api/v1/pet-care/pets').set(headers(owner)).expect(200);
  expect(cleared.body.data[0].ageMonths).toBeUndefined();
});

test('confirmed map address is shared with care setup, owner notes remain scoped and archive replays safely', async () => {
  await request(app).post('/api/v1/pet-care/addresses').set(headers(owner, 'synthetic-address-invalid')).send({ ...address, pointConfirmed: false }).expect(422);
  const result = await request(app).post('/api/v1/pet-care/addresses').set(headers(owner, 'synthetic-address-create')).send(address).expect(201);
  addressId = result.body.data.id;
  const list = await request(app).get('/api/v1/pet-care/addresses/manage').set(headers(owner)).expect(200);
  expect(list.body.data[0]).toMatchObject({ id: addressId, location: address.location, coordinates: address.coordinates, privateAccessNotes: address.privateAccessNotes });
  expect((await request(app).get('/api/v1/pet-care/addresses/manage').set(headers(other)).expect(200)).body.data).toEqual([]);
  const safeList = await request(app).get('/api/v1/pet-care/addresses').set(headers(owner)).expect(200);
  expect(JSON.stringify(safeList.body)).not.toContain(address.privateAccessNotes);
  expect(JSON.stringify(safeList.body)).not.toContain('coordinates');
  const update = { ...address, location: 'Updated synthetic street', expectedVersion: 0 };
  await request(app).patch(`/api/v1/pet-care/addresses/${addressId}`).set(headers(owner, 'synthetic-address-update')).send(update).expect(200);
  const url = `/api/v1/pet-care/addresses/${addressId}/archives`;
  for (let i = 0; i < 2; i++) await request(app).post(url).set(headers(owner, 'synthetic-address-archive')).send({ expectedVersion: 1 }).expect(200);
  expect((await request(app).get('/api/v1/pet-care/addresses').set(headers(owner)).expect(200)).body.data).toEqual([]);
});

test('booking history lists every state with owner-bound pagination, dashboard reads current sources', async () => {
  const customerId = new mongoose.Types.ObjectId(owner.user.id);
  await connection.db.collection('bookings').insertMany(['CANCELLED', 'AWAITING_PAYMENT', 'COMPLETED'].map(state => ({ customerId,
    state, paymentState: 'UNPAID', paymentDeadlineAt: new Date(Date.now() + 60000), checkoutSnapshot: { customerVisits: [{ snapshots: { serviceName: 'Synthetic service' } }] } })));
  const first = await request(app).get('/api/v1/bookings?limit=1').set(headers(owner)).expect(200);
  expect(first.body.data.items).toHaveLength(1); expect(first.body.data.nextCursor).toBeTruthy();
  await request(app).get(`/api/v1/bookings?limit=1&cursor=${first.body.data.nextCursor}`).set(headers(other)).expect(422);
  const all = await request(app).get('/api/v1/bookings?limit=20').set(headers(owner)).expect(200);
  expect(all.body.data.items.map(row => row.state).sort()).toEqual(['AWAITING_PAYMENT', 'CANCELLED', 'COMPLETED']);
  expect(JSON.stringify(all.body)).not.toContain('customerId');
  const dashboard = await request(app).get('/api/v1/dashboards/customer').set(headers(owner)).expect(200);
  expect(dashboard.body.data.metrics.find(row => row.key === 'awaitingPaymentBookings').value).toBe(1);
});

test('notifications persist, preserve owner/role scope and support replayable read receipts', async () => {
  const repository = createMongoNotificationRepository({ connection, cursorSecret: config.auth.tokenSecret });
  const service = createNotificationService({ repository });
  const event = { eventId: 'synthetic-booking-event', eventType: 'BOOKING_CREATED', title: 'Synthetic booking', message: 'Synthetic notification',
    recipients: [{ recipientId: owner.user.id, role: 'CUSTOMER' }], deepLink: '/account/bookings' };
  const first = await service.publish(event); await service.publish(event);
  const list = await request(app).get('/api/v1/notifications').set(headers(owner)).expect(200);
  expect(list.body.data.unreadCount).toBe(1); expect(list.body.data.items).toHaveLength(1);
  const notificationId = first.notificationIds[0];
  await request(app).post(`/api/v1/notifications/${notificationId}/read-receipts`).set(headers(other)).expect(404);
  for (let i = 0; i < 2; i++) await request(app).post(`/api/v1/notifications/${notificationId}/read-receipts`).set(headers(owner)).expect(200);
  expect((await request(app).get('/api/v1/notifications').set(headers(owner)).expect(200)).body.data.unreadCount).toBe(0);
});

test('missing notification storage is unavailable rather than an empty inbox', async () => {
  await connection.models.Notification.collection.drop();
  try {
    const result = await request(app).get('/api/v1/notifications').set(headers(owner)).expect(503);
    expect(result.body.error.code).toBe('NOTIFICATION_STORAGE_NOT_READY');
  } finally {
    await connection.models.Notification.createCollection();
    await connection.models.Notification.createIndexes();
  }
});
