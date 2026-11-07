import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createDispatchWorkspaceService } from '../../src/services/employee-scheduling/dispatch-workspace.service.js';
import { createSitterPublicProfileService } from '../../src/services/sitter-public-profile.service.js';
import { sitterPublicProfileModels } from '../../src/models/sitter-public-profile.model.js';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';
import { settlementModels } from '../../src/models/settlement.model.js';

let replica, connection;
const now = Date.parse('2026-11-05T03:00:00Z');
const oid = () => new mongoose.Types.ObjectId();
const actor = { userId: String(oid()), state: 'ACTIVE', roles: ['ADMIN'], expiresAt: now + 60000 };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose
    .createConnection(replica.getUri(), { dbName: 'synthetic_operations_reports' })
    .asPromise();
}, 180000);
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});
beforeEach(async () => {
  for (const collection of await connection.db.collections()) await collection.deleteMany({});
});

test('dispatch summary covers the entire Vietnam day while names and rows remain bounded and read-only', async () => {
  const customerId = oid(),
    sitterId = oid();
  await connection.collection('users').insertMany([
    { _id: customerId, displayName: 'Synthetic customer', privateContact: 'must-not-project' },
    { _id: sitterId, displayName: 'Synthetic sitter' },
  ]);
  const common = {
    bookingId: oid(),
    customerId,
    sitterId,
    areaCode: 'CITY_HANOI',
    snapshots: { serviceName: 'Synthetic care', privateNotes: 'must-not-project' },
    endAt: new Date(now + 3600000),
  };
  const rows = Array.from({ length: 55 }, () => ({
    _id: oid(),
    ...common,
    startAt: new Date('2026-11-04T17:00:00Z'),
    state: 'ASSIGNED',
  }));
  rows[0].checkInAt = new Date(now);
  rows[1].state = 'COMPLETED';
  rows[2].state = 'IN_PROGRESS';
  rows.push(
    { _id: oid(), ...common, state: 'ASSIGNED', startAt: new Date('2026-11-05T16:59:59Z') },
    { _id: oid(), ...common, state: 'ASSIGNED', startAt: new Date('2026-11-05T17:00:00Z') },
    { _id: oid(), ...common, state: 'ASSIGNED', startAt: new Date('2026-11-04T16:59:59Z') },
  );
  await connection.collection('visits').insertMany(rows);
  const before = await connection.collection('visits').find().toArray();
  const report = await createDispatchWorkspaceService({
    col: (name) => connection.collection(name),
    clock: () => now,
  }).read();
  expect(report).toMatchObject({
    date: '2026-11-05',
    hasMore: true,
    summary: { total: 56, completed: 1, inProgress: 1, late: 52 },
  });
  expect(report.items).toHaveLength(50);
  expect(report.items[0]).toMatchObject({
    customerName: 'Synthetic customer',
    sitterName: 'Synthetic sitter',
  });
  expect(JSON.stringify(report)).not.toContain('must-not-project');
  expect(await connection.collection('visits').find().toArray()).toEqual(before);
});

test('public profile states have global counts, bounded names and state-scoped cursors', async () => {
  const model = sitterPublicProfileModels(connection).SitterPublicProfile;
  const ids = Array.from({ length: 52 }, oid);
  await model.collection.insertMany(
    ids.map((userId) => ({
      userId,
      state: 'SUBMITTED',
      bio: 'Synthetic bio',
      areas: ['HN-01'],
      version: 1,
      updatedAt: new Date(now),
    })),
  );
  await model.collection.insertOne({
    userId: oid(),
    state: 'APPROVED',
    bio: 'Reviewed',
    areas: [],
    version: 2,
    updatedAt: new Date(now),
  });
  await connection
    .collection('users')
    .insertOne({ _id: ids[0], displayName: 'Synthetic person', contactCiphertext: 'must-not-project' });
  const service = createSitterPublicProfileService({
    connection,
    clock: () => now,
    cursorSecret: 'synthetic-operation-report-secret-000',
  });
  const first = await service.listPending({ actor });
  expect(first.summary).toEqual({ total: 53, SUBMITTED: 52, APPROVED: 1, REJECTED: 0 });
  expect(first.items).toHaveLength(50);
  expect(first.items[0].displayName).toBe('Synthetic person');
  expect((await service.listPending({ actor, cursor: first.nextCursor })).items).toHaveLength(2);
  await expect(
    service.listPending({ actor, state: 'APPROVED', cursor: first.nextCursor }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect((await service.listPending({ actor, state: 'APPROVED' })).items).toHaveLength(1);
  expect(JSON.stringify(first)).not.toContain('must-not-project');
  await expect(service.listPending({ actor: { ...actor, roles: ['CUSTOMER'] } })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
});

test('payroll overview uses persisted states and integer amounts, never paid amounts as pending', async () => {
  const models = payrollModels(connection);
  await models.PayrollStatement.init();
  await models.PayrollStatement.collection.insertMany([
    { status: 'PREPARED', breakdown: { payableVnd: 100 } },
    { status: 'APPROVED', breakdown: { payableVnd: 2500000 } },
    { status: 'PAID', breakdown: { payableVnd: 9000000 } },
    { status: 'VOIDED', breakdown: { payableVnd: 400 } },
  ].map(row => ({ employeeId: oid(), periodStart: new Date('2026-11-01T00:00:00Z'),
    periodEnd: new Date('2026-12-01T00:00:00Z'), ...row })));
  await models.SalaryAdvance.collection.insertMany([
    { status: 'SUBMITTED', amountVnd: 100 },
    { status: 'PAID', amountVnd: 200 },
  ]);
  const service = createPayrollService({ connection, policy: {}, clock: () => now });
  expect((await service.overview(actor)).summary).toEqual({
    total: 4,
    prepared: 1,
    awaitingPaymentVnd: 2500000,
    pendingAdvances: 1,
  });
  await expect(service.overview({ ...actor, roles: ['STAFF'] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await models.PayrollStatement.collection.insertOne({
    status: 'APPROVED',
    breakdown: { payableVnd: Number.MAX_SAFE_INTEGER },
  });
  await expect(service.overview(actor)).rejects.toMatchObject({ code: 'PAYROLL_OVERFLOW' });
});

test('settlement totals cover all pages without changing requests and reject unsafe sums', async () => {
  const models = settlementModels(connection);
  await models.SettlementRequest.collection.insertMany(
    Array.from({ length: 52 }, (_, i) => ({
      id: 'synthetic-' + String(i).padStart(3, '0'),
      status: i < 51 ? 'SUBMITTED' : 'PAID',
      sitterId: String(oid()),
      amountVnd: 100,
      submittedAt: new Date(now),
      version: 0,
    })),
  );
  const repository = createMongoSettlementRepository({
    connection,
    cursorSecret: 'synthetic-settlement-report-secret-000',
  });
  const first = await repository.listPayroll({ limit: 50 });
  expect(first.items).toHaveLength(50);
  expect(first.summary).toEqual(
    expect.arrayContaining([
      { _id: 'SUBMITTED', count: 51, amountVnd: 5100 },
      { _id: 'PAID', count: 1, amountVnd: 100 },
    ]),
  );
  const second = await repository.listPayroll({ cursor: first.nextCursor });
  expect(second.items).toHaveLength(2);
  expect(second.summary).toHaveLength(first.summary.length);
  expect(second.summary).toEqual(expect.arrayContaining(first.summary));
  expect(await models.SettlementRequest.countDocuments()).toBe(52);
  await models.SettlementRequest.collection.insertOne({
    id: 'overflow',
    status: 'SUBMITTED',
    amountVnd: Number.MAX_SAFE_INTEGER,
    submittedAt: new Date(now),
  });
  await expect(repository.listPayroll()).rejects.toMatchObject({ code: 'SETTLEMENT_REPORT_OVERFLOW' });
});
