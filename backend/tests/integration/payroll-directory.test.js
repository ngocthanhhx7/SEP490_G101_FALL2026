import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { payrollModels } from '../../src/models/payroll.model.js';
import { createPayrollDraftService } from '../../src/services/payroll/payroll-draft.service.js';

let replica, connection, Contract, service;
const admin = { state: 'ACTIVE', roles: ['ADMIN'] };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_payroll_directory',
    autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
  ({ EmploymentContract: Contract } = payrollModels(connection));
  await Contract.createCollection(); await Contract.createIndexes();
  await connection.db.createCollection('users');
  service = createPayrollDraftService({ connection });
}, 180000);
beforeEach(async () => { await Contract.deleteMany({}); await connection.collection('users').deleteMany({}); });
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

async function seed(count, versions = 3) {
  const ids = Array.from({ length: count }, () => new mongoose.Types.ObjectId());
  if (!count) return;
  await Contract.collection.insertMany(ids.flatMap((employeeId, index) => Array.from({ length: versions }, (_, v) => ({
    employeeId, version: v + 1, monthlyBaseVnd: 3000000 + v, employeeCode: `SYNTHETIC-${index}-${v}`,
    payCycle: 'MONTHLY', effectiveAt: new Date(v ? '2030-01-01' : '2020-01-01'), endsAt: new Date('2021-01-01'),
    ...(v % 2 ? { workScheduleMode: 'SELF_REGISTERED' } : { schedule: { weekdays: [1] } })
  }))));
  if (ids.length > 1) await connection.collection('users').insertMany(ids.slice(1).reverse().map((_id, index) => ({
    _id, displayName: `Synthetic ${index}`, roles: index === 0 ? ['CUSTOMER'] : ['PET_SITTER']
  })));
}
async function previousDirectory() {
  const rows = await Contract.aggregate([{ $sort: { version: -1 } },
    { $group: { _id: '$employeeId', contract: { $first: '$$ROOT' } } }, { $limit: 201 }]);
  if (rows.length > 200) return { error: 'PAYROLL_REVIEW_REQUIRED' };
  const users = await connection.collection('users').find({ _id: { $in: rows.map(row => row._id) }, roles: 'PET_SITTER' },
    { projection: { displayName: 1 } }).toArray();
  return { items: users.map(user => {
    const c = rows.find(row => String(row._id) === String(user._id)).contract;
    return { id: String(user._id), displayName: user.displayName, employeeCode: c.employeeCode ?? null,
      automaticReady: c.workScheduleMode === 'SELF_REGISTERED' || Boolean(c.schedule?.weekdays?.length),
      monthlyBaseVnd: c.monthlyBaseVnd, payCycle: c.payCycle };
  }) };
}
test.each([0, 1, 199, 200, 201])('directory preserves ordered DTO and cap-before-role semantics with %i contract employees', async count => {
  await seed(count);
  const previous = await previousDirectory();
  if (previous.error) await expect(service.employees(admin)).rejects.toMatchObject({ status: 409, code: previous.error });
  else expect(await service.employees(admin)).toEqual(previous);
});
test('actual service pipeline traverses the existing owner/version index without scanning history', async () => {
  await seed(100, 10);
  let pipeline;
  const listener = event => { if (event.commandName === 'aggregate' && event.command.aggregate === Contract.collection.name) pipeline = event.command.pipeline; };
  const previous = await previousDirectory();
  connection.getClient().on('commandStarted', listener);
  try { expect(await service.employees(admin)).toEqual(previous); }
  finally { connection.getClient().off('commandStarted', listener); }
  const explain = await connection.db.command({ explain: { aggregate: Contract.collection.name, pipeline, cursor: {} }, verbosity: 'executionStats' });
  const stats = explain.executionStats ?? explain.stages?.find(stage => stage.$cursor)?.$cursor.executionStats;
  expect(stats.totalDocsExamined).toBeLessThanOrEqual(100);
  expect(stats.totalKeysExamined).toBeLessThan(1000);
  expect(JSON.stringify(explain)).toContain('employeeId_1_version_1');
});
test('directory retains authorization and works without a forced hint if the index is missing', async () => {
  await seed(3);
  await expect(service.employees({ state: 'ACTIVE', roles: ['STAFF'] })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  await Contract.collection.dropIndex('employeeId_1_version_1');
  try { expect(await service.employees(admin)).toEqual(await previousDirectory()); }
  finally { await Contract.createIndexes(); }
});


test('payroll preview ignores replaced past/future contract versions without forcing a false mid-month split', async () => {
  const employeeId = new mongoose.Types.ObjectId(), supersededAt = new Date('2026-11-09T00:00:00Z');
  const base = { employeeId, version: 1, employmentType: 'FULL_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 10000000, payCycle: 'MONTHLY',
    weeklyMinutes: 2400, signedAt: new Date('2026-10-01T00:00:00Z'), effectiveAt: new Date('2026-10-01T00:00:00Z'),
    schedule: { weekdays: [1,2,3,4,5], dailyMinutes: 480 } };
  await Contract.collection.insertMany([base, { ...base, version: 2, effectiveAt: new Date('2026-10-15T00:00:00Z'), supersededAt },
    { ...base, version: 3, effectiveAt: new Date('2026-11-14T00:00:00Z'), supersededAt }]);
  const reader = createPayrollDraftService({ connection, clock: () => Date.parse('2026-12-02T00:00:00Z') });
  const draft = await reader.preview(admin, { employeeId: String(employeeId), periodStart: '2026-11-01', periodEnd: '2026-12-01', dueAt: '2026-12-02',
    unpaidMinutes: 0, attendanceReference: 'Synthetic verified attendance', attendanceConfirmed: true,
    overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    statutoryReference: 'Synthetic approved assessment', statutoryConfirmed: true, deductionConsentReference: 'Synthetic consent' });
  expect(draft.contract.version).toBe(1);
  expect(await Contract.countDocuments()).toBe(3);
});
