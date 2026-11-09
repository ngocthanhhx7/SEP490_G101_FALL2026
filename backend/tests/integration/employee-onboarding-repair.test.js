import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createEmployeeOnboardingRepair, ONBOARDING_REPAIR, ownerWorkingWindows } from '../../src/services/employee-onboarding-repair.service.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';
let replica, connection, repair, admin, ids;
const clock = () => Date.parse('2026-11-09T04:00:00Z'), oid = () => new mongoose.Types.ObjectId();
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_owner_repair' }).asPromise();
  await provisionEmployeeScheduling(connection);
  for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  admin = oid(); ids = [oid(), oid(), oid(), oid()];
  await connection.collection('users').insertMany([{ _id: admin, state: 'ACTIVE', roles: ['ADMIN'], authEpoch: 0 }, ...ids.map(_id => ({ _id, state: 'ACTIVE', roles: ['PET_SITTER'], authEpoch: 0 }))]);
  await connection.collection('sitterstatuses').insertMany(ids.map(userId => ({ userId, status: 'ACTIVE' })));
  await connection.collection('sitterapplications').insertMany(ids.map(provisionedUserId => ({ provisionedUserId, state: 'APPROVED' })));
  await connection.collection('services').insertOne({ _id: oid(), code: 'synthetic-care' });
  await connection.collection('employmentcontracts').insertOne({ employeeId: ids[0], version: 1, effectiveAt: new Date('2026-11-14T00:00:00Z'), signedAt: new Date('2026-11-05T00:00:00Z'), employmentType: 'PART_TIME', weeklyMinutes: 1200 });
  repair = createEmployeeOnboardingRepair({ connection, clock });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
test('dry-run changes nothing, apply is exact/idempotent, future contract stays historical and 40h excludes lunch/weekends', async () => {
  const plan = await repair.inspect(), usersBefore = await connection.collection('users').countDocuments();
  expect(plan.users).toHaveLength(4); expect(await connection.collection('aisitterprofiles').countDocuments()).toBe(0);
  await expect(repair.apply({ actorId: String(admin), expectedDigest: plan.digest, confirmation: 'wrong' })).rejects.toMatchObject({ code: 'REPAIR_CONFIRMATION_REQUIRED' });
  await expect(repair.apply({ actorId: String(admin), expectedDigest: 'stale', confirmation: ONBOARDING_REPAIR })).rejects.toMatchObject({ code: 'REPAIR_PLAN_CHANGED' });
  const input = { actorId: String(admin), expectedDigest: plan.digest, confirmation: ONBOARDING_REPAIR };
  const result = await repair.apply(input); expect(await repair.apply(input)).toEqual(result);
  expect(result).toMatchObject({ employees: 4, weeklyMinutes: 2400 });
  expect(await connection.collection('users').countDocuments()).toBe(usersBefore);
  expect(await connection.collection('employmentcontracts').countDocuments()).toBe(5);
  const old = await connection.collection('employmentcontracts').findOne({ employeeId: ids[0], version: 1 });
  expect(old.effectiveAt.toISOString()).toBe('2026-11-14T00:00:00.000Z'); expect(old.supersededAt).toEqual(new Date(clock()));
  const repository = createEmployeeScheduleRepository({ connection, clock });
  expect((await repository.contractAt(String(ids[0]), new Date('2026-11-16T02:00:00Z'), new Date('2026-11-16T03:00:00Z'))).version).toBe(2);
  expect(ownerWorkingWindows).toHaveLength(10);
  expect(ownerWorkingWindows.every(row => row.weekday >= 1 && row.weekday <= 5 && ['08:00', '13:00'].includes(row.startLocalTime))).toBe(true);
  for (const uid of ids) {
    const capability = await connection.collection('aisitterprofiles').findOne({ userId: uid });
    expect(capability.starts).toEqual([]); expect(capability.maxPets).toBe(1); expect(capability.maxWeightKg).toBe(25);
    expect(capability.areaCodes.length).toBeGreaterThan(1);
  }
});
test('changed population or conflicting accepted work blocks the operator transaction', async () => {
  const extra = oid(); await connection.collection('users').insertOne({ _id: extra, roles: ['PET_SITTER'], state: 'ACTIVE' });
  await expect(repair.inspect()).rejects.toMatchObject({ code: 'REPAIR_BLOCKED' });
  await connection.collection('users').deleteOne({ _id: extra });
  await connection.collection('visits').insertOne({ sitterId: ids[0], state: 'ASSIGNED', startAt: new Date('2026-11-14T02:00:00Z'), endAt: new Date('2026-11-14T03:00:00Z') });
  await expect(repair.inspect()).rejects.toMatchObject({ code: 'REPAIR_BLOCKED' });
});
