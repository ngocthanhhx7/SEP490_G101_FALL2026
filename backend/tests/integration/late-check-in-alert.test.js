import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createLateCheckInAlerts } from '../../src/services/employee-scheduling/late-check-in-alert.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { normalizeNotification } from '../../src/services/notifications/notification.service.js';

const oid = () => new mongoose.Types.ObjectId(), MINUTE = 60000;
// 10:00 on 16/11/2026 in Vietnam.
const START = Date.parse('2026-11-16T03:00:00Z');
let replica, connection, repository, service, now;
const col = name => connection.db.collection(name);
const sitter = oid(), customer = oid(), staff = oid(), staffAdmin = oid(), adminOnly = oid(), locked = oid(), synthetic = oid();

async function seed(extra = {}) {
  const row = { _id: oid(), bookingId: oid(), customerId: customer, sitterId: sitter, state: 'ASSIGNED', version: 2,
    startAt: new Date(START), endAt: new Date(START + 60 * MINUTE), ...extra };
  await col('visits').insertOne(row); return row;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_late_check_in' }).asPromise();
  await provisionEmployeeScheduling(connection);
  await col('users').insertMany([
    { _id: sitter, displayName: 'Synthetic Sitter', state: 'ACTIVE', roles: ['PET_SITTER'] },
    { _id: customer, displayName: 'Synthetic Customer', state: 'ACTIVE', roles: ['CUSTOMER'] },
    { _id: staff, state: 'ACTIVE', roles: ['STAFF'] }, { _id: staffAdmin, state: 'ACTIVE', roles: ['ADMIN', 'STAFF'] },
    { _id: adminOnly, state: 'ACTIVE', roles: ['ADMIN'] }, { _id: locked, state: 'SUSPENDED', roles: ['STAFF'] },
    { _id: synthetic, state: 'ACTIVE', roles: ['STAFF'], synthetic: true }
  ]);
  repository = { col, models: employeeSchedulingModels(connection), uow: createUnitOfWork(connection) };
  service = createLateCheckInAlerts({ repository, clock: () => now });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => {
  now = START + 15 * MINUTE;
  await col('visits').deleteMany({}); await col('notifications').deleteMany({}); await col('employeescheduleevents').deleteMany({});
});

test('JOB-07: at 15 minutes every Staff account gets one alert with the time, customer, pet sitter and a link to the visit', async () => {
  const visit = await seed();
  now--; expect(await service.runBatch()).toEqual({ alerted: 0, failed: 0 });
  now++; expect(await service.runBatch()).toEqual({ alerted: 1, failed: 0 });
  const notices = await col('notifications').find({}).toArray();
  expect(notices.map(row => row.recipientId).sort()).toEqual([String(staff), String(staffAdmin)].sort());
  for (const notice of notices) {
    expect(notice).toMatchObject({ eventType: 'VisitCheckInLate', title: 'Buổi chăm sóc trễ check-in',
      deepLink: `/staff/dispatch?handoverVisitId=${visit._id}`, metadata: { visitId: String(visit._id) } });
    expect(notice.message).toContain('Buổi lúc 10:00 16/11/2026 chưa check-in');
    expect(notice.message).toContain('Khách hàng: Synthetic Customer');
    expect(notice.message).toContain('Người chăm sóc: Synthetic Sitter');
    expect(() => normalizeNotification(notice, { userId: notice.recipientId, roles: [notice.role], state: 'ACTIVE' })).not.toThrow();
  }
  const stored = await col('visits').findOne({ _id: visit._id });
  expect(stored).toMatchObject({ state: 'ASSIGNED', version: 2, lateCheckInAlert: { startAt: visit.startAt, alertedAt: new Date(now) } });
});

test('JOB-07: concurrent and later runs never alert a visit twice, and a new start time is alerted again', async () => {
  const visit = await seed();
  const results = await Promise.all([service.runBatch(), service.runBatch()]);
  expect(results.reduce((sum, row) => sum + row.alerted, 0)).toBe(1);
  now += 5 * MINUTE;
  await col('visits').updateOne({ _id: visit._id }, { $inc: { version: 1 } });
  expect((await service.runBatch()).alerted).toBe(0);
  expect(await col('notifications').countDocuments({})).toBe(2);
  await col('visits').updateOne({ _id: visit._id }, { $set: { startAt: new Date(START + 60 * MINUTE) } });
  now = START + 75 * MINUTE;
  expect((await service.runBatch()).alerted).toBe(1);
  expect(await col('notifications').countDocuments({})).toBe(4);
});

test('JOB-07: visits that are checked in, closed, without a pet sitter or from an earlier day are skipped', async () => {
  await seed({ checkInAt: new Date(START + MINUTE) });
  await seed({ state: 'IN_PROGRESS', checkInAt: new Date(START) });
  await seed({ state: 'CANCELLED' });
  await seed({ state: 'SCHEDULED', sitterId: null });
  await seed({ startAt: new Date(START - 24 * 60 * MINUTE) });
  expect(await service.runBatch()).toEqual({ alerted: 0, failed: 0 });
  expect(await col('notifications').countDocuments({})).toBe(0);
});

test('JOB-07: a visit starting just before midnight is alerted after midnight', async () => {
  const start = Date.parse('2026-11-16T16:50:00Z');
  await seed({ startAt: new Date(start), endAt: new Date(start + 60 * MINUTE) });
  now = start + 15 * MINUTE;
  expect((await service.runBatch()).alerted).toBe(1);
});

test('JOB-07: when a notification cannot be saved the visit stays unmarked and the next run alerts it', async () => {
  const visit = await seed();
  const broken = createLateCheckInAlerts({ clock: () => now, repository: { ...repository,
    col: name => name !== 'notifications' ? col(name) : { updateOne: async () => { throw new Error('synthetic database error'); } } } });
  expect(await broken.runBatch()).toEqual({ alerted: 0, failed: 1 });
  expect((await col('visits').findOne({ _id: visit._id })).lateCheckInAlert).toBeUndefined();
  expect(await col('employeescheduleevents').countDocuments({})).toBe(0);
  expect(await service.runBatch()).toEqual({ alerted: 1, failed: 0 });
});

test('JOB-07: bounded batches progress past alerted visits', async () => {
  for (let index = 0; index < 5; index++) await seed();
  expect((await service.runBatch({ limit: 2 })).alerted).toBe(2);
  expect((await service.runBatch({ limit: 2 })).alerted).toBe(2);
  expect((await service.runBatch({ limit: 2 })).alerted).toBe(1);
  await expect(service.runBatch({ limit: 0 })).rejects.toThrow(TypeError);
});
