import { afterAll, beforeAll, expect, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { customerReadRuntime } from '../../src/routes/customer-read-runtime.js';
import { bookingCheckoutRuntimeModule } from '../../src/routes/booking-checkout.routes.js';
import { errorHandler, notFound, requestId } from '../../src/middlewares/http.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';

const oid = () => new mongoose.Types.ObjectId();
const bookingId = oid(), owner = oid(), another = oid(), sitterId = oid();
const visitId = oid(), nextId = oid(), addressId = oid();
const originalTime = new Date('2026-11-11T00:00:00Z');
const endAt = new Date('2026-11-11T00:30:00Z');
const newTime = new Date('2026-11-11T02:00:00Z');
const now = () => Date.parse('2026-11-10T12:00:00Z');
let replica, connection;
const sessionService = {
  async authenticate(req) {
    const roles = { owner: 'CUSTOMER', other: 'CUSTOMER', staff: 'STAFF', admin: 'ADMIN', sitter: 'PET_SITTER' };
    const identity = req.get('x-test-actor');
    return roles[identity] ? { userId: String(identity === 'owner' ? owner : another), roles: [roles[identity]], state: 'ACTIVE', expiresAt: now() + 60000 } : null;
  },
  verifyCsrf: async () => false
};
function app({ checkout = true, auth = true, finance = true } = {}) {
  const config = { auth: { enabled: auth, tokenSecret: 'synthetic-cursor-secret-for-booking-tests' } };
  const context = { config, connection, sessionService, clock: now,
    env: { BOOKING_CHECKOUT_ENABLED: String(checkout), FINANCE_SOURCES_ENABLED: String(finance) } };
  const instance = express();
  instance.use(requestId);
  if (auth) instance.use('/api/v1', customerReadRuntime(context).router);
  const module = bookingCheckoutRuntimeModule(context);
  if (module) instance.use(module.mount, module.router);
  instance.use(notFound, errorHandler(() => {}));
  return instance;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_booking_details' }).asPromise();
  await provisionFinanceSources(connection);
  const snapshot = { serviceName: 'Dắt chó đi dạo', serviceAddress: 'Địa chỉ lúc đặt', careMinutes: 30, baseVnd: 80000, surchargeVnd: 10000,
    pets: [{ name: 'Milo' }], care: { privateAccessNotes: 'DOOR_CODE_TEST', pets: [{ name: 'Milo',
      careProfile: { handling: { status: 'KNOWN', value: 'Milo hay kéo dây' }, emergencyContact: { status: 'KNOWN', value: 'PRIVATE_PHONE_TEST' } } }] } };
  const original = { _id: visitId, bookingId, addressId, requestedSitterId: sitterId, areaCode: 'DISTRICT_THANH_XUAN',
    startAt: originalTime, endAt, state: 'SCHEDULED', snapshots: snapshot };
  await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId: owner, state: 'ASSIGNED', paymentMode: 'PREPAY',
    paymentState: 'PAID', paymentSnapshot: { amountVnd: 171000, currency: 'VND' }, visitIds: [visitId, nextId], originalVisitCount: 2,
    checkoutSnapshot: { consentAt: originalTime, customerVisits: [original, { ...original, _id: nextId }],
      quote: { visitCount: 2, discountVnd: 9000, totalVnd: 171000 } } });
  await connection.db.collection('visits').insertMany([
    { ...original, sitterId, startAt: newTime, endAt: new Date('2026-11-11T02:30:00Z'), state: 'COMPLETED' },
    { ...original, _id: nextId, startAt: new Date('2026-11-12T00:00:00Z'), endAt: new Date('2026-11-12T00:30:00Z') }
  ]);
  await connection.db.collection('users').insertMany([{ _id: sitterId, displayName: 'Lê Văn Minh' },
    { _id: owner, displayName: 'Trần Thị Lan', email: 'PRIVATE_EMAIL_TEST', phone: 'PRIVATE_PHONE_TEST' }]);
  await connection.db.collection('customeraddresses').insertOne({ _id: addressId, ownerId: owner, location: 'Địa chỉ lúc đặt' });
  await connection.db.collection('customeraddresses').updateOne({ _id: addressId }, { $set: { location: 'Địa chỉ mới' } });
}, 600000);

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

const path = scope => `/api/v1/${scope}/bookings/${bookingId}`;

test.each(['staff', 'admin'])('UC-27 / GBR-02 / GBR-20: %s reads safe saved terms, live visits and quoted price', async actor => {
  const response = await request(app()).get(path('staff')).set('x-test-actor', actor).expect(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.data).toMatchObject({
    customerName: 'Trần Thị Lan', paymentMode: 'PREPAY', paymentState: 'PAID',
    details: {
      terms: [{ serviceAddress: 'Địa chỉ lúc đặt', startAt: originalTime.toISOString(), requestedSitterName: 'Lê Văn Minh' },
        { serviceAddress: 'Địa chỉ lúc đặt' }],
      visits: [{ id: String(visitId), startAt: newTime.toISOString(), endAt: '2026-11-11T02:30:00.000Z', sitterName: 'Lê Văn Minh', state: 'COMPLETED' },
        { id: String(nextId), state: 'SCHEDULED' }],
      price: { visitCount: 2, visitPricesVnd: [90000], discountVnd: 9000, totalVnd: 171000 }
    }
  });
  expect(response.text).not.toMatch(/privateAccessNotes|DOOR_CODE_TEST|PRIVATE_PHONE_TEST|PRIVATE_EMAIL_TEST|Địa chỉ mới/);
});

test('UC-27 / GBR-02: Customer retains ownership, other roles and missing sessions are denied', async () => {
  const instance = app();
  const result = await request(instance).get(path('checkout')).set('x-test-actor', 'owner').expect(200);
  expect(result.body.data.details.terms[0].serviceAddress).toBe('Địa chỉ lúc đặt');
  expect(result.body.data).not.toHaveProperty('customerName');
  expect(result.text).not.toMatch(/privateAccessNotes|DOOR_CODE_TEST/);
  await request(instance).get(path('checkout')).set('x-test-actor', 'other').expect(404);
  await request(instance).get(path('checkout')).set('x-test-actor', 'staff').expect(403);
  await request(instance).get(path('checkout')).expect(401);
  await request(instance).get(path('staff')).set('x-test-actor', 'owner').expect(403);
  await request(instance).get(path('staff')).set('x-test-actor', 'sitter').expect(403);
  await request(instance).get(path('staff')).expect(401);
});

test('UC-27 / GBR-17: checkout and auth gates govern details independently of the finance flag', async () => {
  await request(app({ checkout: false })).get(path('staff')).set('x-test-actor', 'staff').expect(404);
  await request(app({ auth: false })).get(path('staff')).set('x-test-actor', 'staff').expect(404);
  await request(app({ finance: false })).get(path('staff')).set('x-test-actor', 'staff').expect(200);
});
