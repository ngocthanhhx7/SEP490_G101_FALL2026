import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createVisitPickupService } from '../../src/services/pickup/visit-pickup.service.js';

const oid = () => new mongoose.Types.ObjectId();
const bookingId = oid(), visitId = oid(), customerId = oid(), staffId = oid(), adminId = oid(), saleId = oid();
const now = Date.parse('2026-11-27T03:00:00Z');
const actor = (userId, role) => ({ userId: String(userId), roles: [role], state: 'ACTIVE', authEpoch: 1 });
let replica, connection, service;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri()).asPromise();
  for (const name of ['users', 'bookings', 'visits', 'notifications']) await connection.db.createCollection(name);
  await connection.db.collection('users').insertMany([
    { _id: staffId, roles: ['STAFF'], state: 'ACTIVE', authEpoch: 1 },
    { _id: adminId, roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 1 },
    { _id: saleId, roles: ['SALE_STAFF'], state: 'ACTIVE', authEpoch: 1 }
  ]);
  await connection.db.collection('bookings').insertOne({ _id: bookingId, customerId });
  await connection.db.collection('visits').insertOne({ _id: visitId, bookingId, version: 0, state: 'ASSIGNED',
    location: 'FACILITY', startAt: new Date(now + 3600000), endAt: new Date(now + 7200000),
    snapshots: { pets: [{ name: 'Milo' }], pickup: { addressText: 'Test address', distanceMeters: 2000, feeVnd: 20000 } } });
  service = createVisitPickupService({ connection, clock: () => now });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('only active Staff/Admin may hand over, concurrent retries record once, return requires checkout', async () => {
  const record = (who, action) => service.record(who, String(bookingId), String(visitId), action);
  for (const who of [actor(customerId, 'CUSTOMER'), actor(saleId, 'SALE_STAFF'), actor(saleId, 'STAFF'),
    { ...actor(staffId, 'STAFF'), authEpoch: 0 }, { ...actor(staffId, 'STAFF'), state: 'SUSPENDED' }]) {
    await expect(record(who, 'pick-up')).rejects.toMatchObject({ status: 403 });
  }
  await expect(record(actor(adminId, 'ADMIN'), 'return')).rejects.toMatchObject({ status: 409 });
  const results = await Promise.all([record(actor(staffId, 'STAFF'), 'pick-up'), record(actor(staffId, 'STAFF'), 'pick-up')]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]).toMatchObject({ pickedUpAt: new Date(now), petNames: ['Milo'], returnedAt: null });
  const visits = connection.db.collection('visits'), notices = connection.db.collection('notifications');
  expect(await visits.findOne({ _id: visitId })).toMatchObject({ version: 1, pickedUpBy: staffId });
  expect(await notices.countDocuments({ eventType: 'VisitPetPickedUp', recipientId: String(customerId) })).toBe(1);
  await expect(record(actor(adminId, 'ADMIN'), 'return')).rejects.toMatchObject({ status: 409 });
  await visits.updateOne({ _id: visitId }, { $set: { checkOutAt: new Date(now), state: 'COMPLETED' } });
  const returned = await record(actor(adminId, 'ADMIN'), 'return');
  expect(await record(actor(adminId, 'ADMIN'), 'return')).toEqual(returned);
  expect(await visits.findOne({ _id: visitId })).toMatchObject({ version: 2, returnedBy: adminId });
  expect(await notices.countDocuments({ eventType: 'VisitPetReturned', recipientId: String(customerId) })).toBe(1);
});
