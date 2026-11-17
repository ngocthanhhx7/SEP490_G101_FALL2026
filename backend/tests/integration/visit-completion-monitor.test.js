import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createVisitCompletionMonitor } from '../../src/services/employee-scheduling/visit-completion-monitor.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';

const oid = () => new mongoose.Types.ObjectId(), END = Date.parse('2026-11-16T03:00:00Z'), MINUTE = 60000;
let replica, connection, service, now;
const col = name => connection.db.collection(name);
const sitter = oid(), staff = oid(), admin = oid(), locked = oid();
async function seed(extra = {}) {
  const row = { _id: oid(), bookingId: oid(), sitterId: sitter, state: 'IN_PROGRESS', version: 3,
    startAt: new Date(END - 30 * MINUTE), endAt: new Date(END), checkInAt: new Date(END - 29 * MINUTE), ...extra };
  await col('visits').insertOne(row); return row;
}
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_completion_monitor' }).asPromise();
  await provisionEmployeeScheduling(connection);
  await col('users').insertMany([
    { _id: sitter, state: 'ACTIVE', roles: ['PET_SITTER'] }, { _id: staff, state: 'ACTIVE', roles: ['STAFF'] },
    { _id: admin, state: 'ACTIVE', roles: ['ADMIN', 'STAFF'] }, { _id: locked, state: 'SUSPENDED', roles: ['STAFF'] }
  ]);
  service = createVisitCompletionMonitor({ repository: { col, models: employeeSchedulingModels(connection), uow: createUnitOfWork(connection) }, clock: () => now });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => {
  now = END; await col('visits').deleteMany({}); await col('notifications').deleteMany({}); await col('employeescheduleevents').deleteMany({});
});
test('reminds at minus 5 minutes, plus 15 minutes and plus 2 hours, with correct role links and no manufactured checkout', async () => {
  const visit = await seed(); now = END - 5 * MINUTE - 1;
  expect(await service.runBatch()).toEqual({ notified: 0, reviewed: 0 });
  now++; expect(await service.runBatch()).toEqual({ notified: 1, reviewed: 0 });
  now = END + 15 * MINUTE - 1; expect((await service.runBatch()).notified).toBe(0);
  now++; expect((await service.runBatch()).notified).toBe(1);
  now = END + 120 * MINUTE - 1; expect((await service.runBatch()).notified).toBe(0);
  now++; expect(await service.runBatch()).toEqual({ notified: 1, reviewed: 1 });
  const stored = await col('visits').findOne({ _id: visit._id });
  expect(stored).toMatchObject({ state: 'IN_PROGRESS', version: 3, completionAttention: { code: 'COMPLETION_REVIEW_REQUIRED' } });
  expect(stored.checkOutAt).toBeUndefined(); expect(stored.completedAt).toBeUndefined();
  const notices = await col('notifications').find({ eventType: 'VisitCompletionReviewRequired' }).toArray();
  expect(notices).toHaveLength(3);
  expect(notices).toEqual(expect.arrayContaining([
    expect.objectContaining({ recipientId: String(staff), role: 'STAFF', deepLink: `/staff/dispatch?closureId=${visit._id}` }),
    expect.objectContaining({ recipientId: String(admin), role: 'ADMIN', deepLink: `/admin/dispatch?closureId=${visit._id}` }),
    expect.objectContaining({ recipientId: String(sitter), deepLink: `/sitter/invitations?visitId=${visit._id}` })
  ]));
  expect(await col('notifications').countDocuments({ recipientId: String(locked) })).toBe(0);
});
test('restart, visit-version changes and concurrent workers send each phase once', async () => {
  const visit = await seed(); now = END + 120 * MINUTE;
  const results = await Promise.all([service.runBatch(), service.runBatch()]);
  expect(results.reduce((sum, row) => sum + row.notified, 0)).toBe(1);
  await col('visits').updateOne({ _id: visit._id }, { $inc: { version: 1 } });
  expect((await service.runBatch()).notified).toBe(0);
  expect(await col('employeescheduleevents').countDocuments({ visitId: String(visit._id) })).toBe(1);
  expect(await col('notifications').countDocuments({})).toBe(3);
});
test('completed/cancelled/not-checked-in visits are ignored, even if old', async () => {
  now = END + 120 * MINUTE;
  await seed({ state: 'COMPLETED', checkOutAt: new Date(END) }); await seed({ state: 'CANCELLED' });
  await seed({ state: 'ASSIGNED', checkInAt: null }); await seed({ checkOutAt: new Date(END) });
  expect((await service.runBatch()).notified).toBe(0);
});
test('bounded batches progress past already notified rows without starving later overdue visits', async () => {
  now = END + 120 * MINUTE;
  for (let i = 0; i < 7; i++) await seed();
  expect((await service.runBatch({ limit: 3 })).reviewed).toBe(3);
  expect((await service.runBatch({ limit: 3 })).reviewed).toBe(3);
  expect((await service.runBatch({ limit: 3 })).reviewed).toBe(1);
  expect((await service.runBatch({ limit: 3 })).reviewed).toBe(0);
  expect(await col('employeescheduleevents').countDocuments({})).toBe(7);
});
