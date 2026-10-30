import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createMongoOperationalDashboardRepository } from '../../src/services/dashboards/mongo-operational-dashboard.repository.js';
import { createCustomerDashboardService } from '../../src/services/dashboards/customer-dashboard.service.js';
import { createSitterDashboardService } from '../../src/services/dashboards/sitter-dashboard.service.js';
import { createStaffDashboardService } from '../../src/services/dashboards/staff-dashboard.service.js';
import { createAdminDashboardService } from '../../src/services/dashboards/admin-dashboard.service.js';

let replica, connection, repository, customer, sitter, staff, admin, bookingId, visitId;
const names = ['visits', 'bookings', 'bills', 'employeevisitoffers', 'cases', 'sitterapplications'];
const now = new Date('2026-10-29T12:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const actor = role => ({ userId: String(oid()), roles: [role], state: 'ACTIVE', expiresAt: Date.now() + 3600000 });
const insert = (name, row) => connection.db.collection(name).insertOne(row);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'operational_dashboard_test' }).asPromise();
  for (const name of names) await connection.db.createCollection(name);
  repository = createMongoOperationalDashboardRepository({ connection, cursorSecret: 'synthetic-dashboard-cursor-secret-01', clock: () => now.getTime() });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  for (const name of names) await connection.db.collection(name).deleteMany({});
  customer = actor('CUSTOMER'); sitter = actor('PET_SITTER'); staff = actor('STAFF'); admin = actor('ADMIN');
  bookingId = oid(); visitId = oid();
  await insert('bookings', { _id: bookingId, customerId: new mongoose.Types.ObjectId(customer.userId) });
  await insert('visits', { _id: visitId, bookingId, sitterId: new mongoose.Types.ObjectId(sitter.userId),
    state: 'ASSIGNED', startAt: new Date('2026-10-30T02:00:00Z'), needsAction: true, privateAccessNotes: 'private-home-notes' });
});

test('customer ownership is joined before counts/pagination and counts active prepay orders', async () => {
  const foreign = oid();
  await insert('bookings', { _id: foreign, customerId: oid() });
  await insert('visits', { bookingId: foreign, state: 'ASSIGNED', startAt: new Date('2026-10-30T01:00:00Z') });
  await insert('bills', { bookingId, state: 'ISSUED', dueAt: new Date('2026-10-30T08:00:00Z') });
  await insert('bills', { bookingId, state: 'PAID', dueAt: now });
  await insert('bills', { bookingId: foreign, state: 'ISSUED', dueAt: now });
  await connection.db.collection('bookings').updateOne({ _id: bookingId }, { $set: { state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', paymentDeadlineAt: new Date(now.getTime() + 60000) } });
  const result = await createCustomerDashboardService({ repository }).read({ actor: customer, query: { limit: '1' } });
  expect(result.data.items).toHaveLength(1);
  expect(result.data.items[0].id).toBe(String(visitId));
  expect(result.data.metrics.map(row => row.value)).toEqual([1, 1]);
  expect(JSON.stringify(result)).not.toContain('private-home-notes');
});

test('sitter counts only owned assignments and unexpired offers; Vietnam date filter uses visit dates', async () => {
  await insert('employeevisitoffers', { sitterId: sitter.userId, visitId, state: 'PENDING', deadline: new Date(now.getTime() + 1000) });
  await insert('employeevisitoffers', { sitterId: sitter.userId, visitId, state: 'PENDING', deadline: now });
  await insert('employeevisitoffers', { sitterId: String(oid()), visitId, state: 'PENDING', deadline: new Date(now.getTime() + 1000) });
  const result = await createSitterDashboardService({ repository }).read({ actor: sitter, query: { from: '2026-10-30', to: '2026-10-30' } });
  expect(result.data.metrics.map(row => row.value)).toEqual([1, 1]);
  expect(result.data.items).toHaveLength(1);
});

test('Staff and Admin use real case/application/needsAction sources', async () => {
  await insert('visits', { bookingId, state: 'SCHEDULED', sitterId: null, startAt: new Date('2026-10-31T02:00:00Z') });
  await insert('cases', { visitId, state: 'OPEN' }); await insert('cases', { visitId, state: 'CLOSED' });
  await insert('sitterapplications', { state: 'PENDING', createdAt: now });
  await insert('sitterapplications', { state: 'APPROVED', createdAt: now });
  expect((await createStaffDashboardService({ repository }).read({ actor: staff })).data.metrics.map(row => row.value)).toEqual([1, 1]);
  expect((await createAdminDashboardService({ repository }).read({ actor: admin })).data.metrics.map(row => row.value)).toEqual([1, 1]);
});

test('stable scoped pagination keeps whole-period metrics and rejects changed identity/filter', async () => {
  await insert('visits', { bookingId, sitterId: new mongoose.Types.ObjectId(sitter.userId), state: 'ASSIGNED', startAt: new Date('2026-10-31T02:00:00Z') });
  const service = createSitterDashboardService({ repository });
  const first = await service.read({ actor: sitter, query: { limit: '1' } });
  const second = await service.read({ actor: sitter, query: { limit: '1', cursor: first.data.nextCursor } });
  expect(second.data.items[0].id).not.toBe(first.data.items[0].id);
  expect(second.data.metrics[0].value).toBe(2);
  await expect(service.read({ actor: actor('PET_SITTER'), query: { limit: '1', cursor: first.data.nextCursor } })).rejects.toMatchObject({ status: 422 });
  await expect(service.read({ actor: sitter, query: { limit: '1', from: '2026-10-30', cursor: first.data.nextCursor } })).rejects.toMatchObject({ status: 422 });
});

test('missing source stays pending, malformed owned source fails, role is checked before reading', async () => {
  const service = createCustomerDashboardService({ repository });
  await expect(service.read({ actor: staff })).rejects.toMatchObject({ status: 403 });
  await connection.db.collection('visits').updateOne({ _id: visitId }, { $set: { state: 'UNRECOGNIZED' } });
  await expect(service.read({ actor: customer })).rejects.toMatchObject({ code: 'INVALID_PROJECTION' });
  await connection.db.collection('bookings').drop();
  try { expect(await service.read({ actor: customer })).toMatchObject({ pending: true }); }
  finally { await connection.db.createCollection('bookings'); }
});
