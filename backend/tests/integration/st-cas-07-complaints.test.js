import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createBookingRefundBilling } from '../../src/services/complaints/booking-refund-billing.service.js';
import { createComplaintService } from '../../src/services/complaints/complaint.service.js';
import { createMongoComplaintRepository } from '../../src/services/complaints/mongo-complaint.repository.js';
import { notificationModels } from '../../src/models/notification.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';

let replica, connection, complaints;
let now = new Date('2026-11-28T06:00:00Z');
const oid = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_st_cas_07' }).asPromise();
  for (const model of Object.values({ ...payrollModels(connection), ...notificationModels(connection) })) {
    await model.createCollection();
    await model.createIndexes();
  }
  await provisionFinanceSources(connection);
  for (const name of ['users', 'privateimages']) {
    await connection.db.createCollection(name).catch(() => {});
  }
  const finance = createBookingFinanceSourceService({ connection, clock: () => now, compensationModel: 'EMPLOYEE' });
  const repository = createMongoComplaintRepository({
    connection,
    finance,
    cursorSecret: 'synthetic-st-cas-07-cursor-secret-32',
    compensationModel: 'EMPLOYEE',
    clock: () => now.getTime()
  });
  complaints = createComplaintService({
    repository,
    billing: createBookingRefundBilling({ connection }),
    clock: () => now.getTime()
  });
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  now = new Date('2026-11-28T06:00:00Z');
  for (const name of ['users', 'bookings', 'visits', 'cases', 'finance_source_commands', 'finance_source_events', 'notifications']) {
    await connection.db.collection(name).deleteMany({}).catch(() => {});
  }
});

test('ST-CAS-07 customer My complaints lists newly submitted OPEN complaints newest first even when booking.customerId is stored as string', async () => {
  const customerId = oid();
  const sitterId = oid();
  const staffId = oid();
  const bookingObjId = oid();
  const visitObjId = oid();
  const bookingStrId = oid();
  const visitStrId = oid();

  await connection.db.collection('users').insertMany([
    { _id: customerId, displayName: 'Khách hàng 01', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: sitterId, displayName: 'Người chăm sóc 01', roles: ['PET_SITTER'], state: 'ACTIVE' },
    { _id: staffId, displayName: 'Nhân viên 01', roles: ['STAFF'], state: 'ACTIVE' }
  ]);
  await connection.db.collection('bookings').insertMany([
    { _id: bookingObjId, customerId, state: 'COMPLETED', version: 1, bookingCode: 'BK-OBJ-01', visitIds: [visitObjId] },
    { _id: bookingStrId, customerId: String(customerId), state: 'COMPLETED', version: 1, bookingCode: 'BK-STR-01', visitIds: [visitStrId] }
  ]);
  await connection.db.collection('visits').insertMany([
    {
      _id: visitObjId, bookingId: bookingObjId, customerId, sitterId, state: 'COMPLETED', version: 1,
      startAt: new Date('2026-11-27T02:00:00Z'), endAt: new Date('2026-11-27T03:00:00Z'),
      completedAt: new Date('2026-11-27T03:00:00Z'), checkOutAt: new Date('2026-11-27T03:00:00Z'),
      snapshots: { serviceName: 'Chăm sóc tại nhà' }
    },
    {
      _id: visitStrId, bookingId: bookingStrId, customerId: String(customerId), sitterId, state: 'COMPLETED', version: 1,
      startAt: new Date('2026-11-27T04:00:00Z'), endAt: new Date('2026-11-27T05:00:00Z'),
      completedAt: new Date('2026-11-27T05:00:00Z'), checkOutAt: new Date('2026-11-27T05:00:00Z'),
      snapshots: { serviceName: 'Chăm sóc tại nhà' }
    }
  ]);

  const customer = { userId: String(customerId), roles: ['CUSTOMER'], state: 'ACTIVE', expiresAt: now.getTime() + 3600000 };
  const staff = { userId: String(staffId), roles: ['STAFF'], state: 'ACTIVE', expiresAt: now.getTime() + 3600000 };

  const first = await complaints.submit({
    actor: customer, scope: 'VISIT', bookingId: String(bookingObjId), visitId: String(visitObjId),
    expectedVersion: 1, description: 'Buổi 1 đến muộn', evidenceRefs: [], idempotencyKey: 'st-cas-07-first'
  });
  expect(first).toMatchObject({ messageCode: 'MSG128', state: 'OPEN' });
  expect(first.complaint.booking).toMatchObject({ id: String(bookingObjId), code: 'BK-OBJ-01' });
  expect(first.complaint.visit).toMatchObject({ id: String(visitObjId), startAt: '2026-11-27T02:00:00.000Z' });

  now = new Date(now.getTime() + 60_000);
  const second = await complaints.submit({
    actor: customer, scope: 'VISIT', bookingId: String(bookingStrId), visitId: String(visitStrId),
    expectedVersion: 1, description: 'Buổi 2 chưa chụp đủ ảnh', evidenceRefs: [], idempotencyKey: 'st-cas-07-second'
  });
  expect(second).toMatchObject({ messageCode: 'MSG128', state: 'OPEN' });
  expect(second.complaint.booking).toMatchObject({ id: String(bookingStrId), code: 'BK-STR-01' });
  expect(second.complaint.visit).toMatchObject({ id: String(visitStrId), startAt: '2026-11-27T04:00:00.000Z' });

  const staffList = await complaints.list({ actor: staff, query: { state: 'OPEN' } });
  expect(staffList.items.map(item => item.id)).toEqual([second.complaintId, first.complaintId]);

  const customerList = await complaints.list({ actor: customer, query: {} });
  expect(customerList.items.map(item => item.id)).toEqual([second.complaintId, first.complaintId]);
  expect(customerList.items[0]).toMatchObject({
    id: second.complaintId,
    code: second.complaint.code,
    state: 'OPEN',
    booking: { id: String(bookingStrId), code: 'BK-STR-01' },
    visit: { id: String(visitStrId), startAt: '2026-11-27T04:00:00.000Z' }
  });
});
