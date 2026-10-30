import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { settlementModels } from '../../src/models/settlement.model.js';
import { earningAccrualModels } from '../../src/models/earning-accrual.model.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { createMongoEarningsRepository } from '../../src/services/dashboards/mongo-earnings.repository.js';
import { createEarningsService } from '../../src/services/dashboards/earnings.service.js';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import request from 'supertest';
import { settlementRuntimeFixture } from '../fixtures/settlement-runtime.js';
import { userModel } from '../../src/models/user.model.js';

let replica, connection, models, service;
const actor = { userId: 'sitter-one', roles: ['PET_SITTER'], state: 'ACTIVE', expiresAt: Date.now() + 3600000 };
const secret = 'synthetic-earnings-cursor-secret-0001';
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'p28_earnings_regression', autoIndex: false }).asPromise();
  models = { ...settlementModels(connection), ...earningAccrualModels(connection) };
  await provisionSettlementStorage(connection);
  service = createEarningsService({ repository: createMongoEarningsRepository({ connection, cursorSecret: secret }) });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
async function seed(id, sitterId = actor.userId, completedAt = '2026-10-26T03:00:00Z') {
  await models.BookingEarningSnapshot.create({ id, sitterId, bookingId: `booking-${id}`, completedAt,
    weekKey: '2026-10-26', ordinal: id.endsWith('two') ? 2 : 1, serviceBasisVnd: 100,
    feeBasisPoints: 1000, commissionVnd: 10, confirmedTaxVnd: 0, sitterTaxCostVnd: 0,
    platformTaxCostVnd: 0, accruedVnd: 90, policyVersion: 'synthetic-fee-policy',
    decisionVersion: 'synthetic-approved-decision', sourceVersion: 'synthetic-source-v1',
    sourceHash: 'synthetic-source-hash', completionReference: `completion:${id}`,
    paymentReference: `payment:${id}`, allocationReference: `allocation:${id}`,
    assessmentReference: `assessment:${id}`, createdAt: new Date(completedAt) });
  await models.Earning.create({ earningId: id, sitterId, bookingId: `booking-${id}`, sourceSnapshotId: id,
    completedAt, earningPeriodKey: '2026-10-26', accruedVnd: 90, availableVnd: 90,
    state: 'AVAILABLE', version: 0, explanation: 'Synthetic completed booking', ledgerReference: `origin:${id}` });
  await models.EarningLedgerEntry.create({ lineId: `origin:${id}`, operationId: `origin:${id}`,
    earningId: id, sitterId, toBucket: 'AVAILABLE', amountVnd: 90, occurredAt: new Date(completedAt) });
}
beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await seed('earning-one');
});

test('joined immutable booking snapshot and ledger provide real owner-scoped earnings', async () => {
  await seed('foreign', 'sitter-two');
  const result = await service.read({ actor });
  expect(result.data.items).toEqual([{ id: 'earning-one', bookingId: 'booking-earning-one',
    state: 'COMPLETED', accrued: 90, pending: 0, held: 0, available: 90, reserved: 0, paid: 0,
    completedAt: '2026-10-26T03:00:00.000Z', explanation: 'Synthetic completed booking',
    ledgerReference: 'origin:earning-one', transferRecordedAt: null }]);
  expect(result.data.totalsScope).toBe('PAGE');
  expect(result.data.metrics.find(row => row.key === 'available').value).toBe(90);
  expect(JSON.stringify(result)).not.toContain('assessment:');
  expect(JSON.stringify(result)).not.toContain('payment:');
});

test('signed cursor binds scope and filters; Vietnam dates include Monday at 00:00', async () => {
  await seed('earning-two', actor.userId, '2026-10-25T17:00:00Z');
  const query = { from: '2026-10-26', to: '2026-10-26', limit: '1' };
  const first = await service.read({ actor, query });
  const token = first.data.nextCursor;
  expect(token).toBeTruthy();
  const second = await service.read({ actor, query: { ...query, cursor: token } });
  expect(second.data.items[0].id).toBe('earning-two');
  expect(second.data.nextCursor).toBeNull();
  await expect(service.read({ actor: { ...actor, userId: 'sitter-two' }, query: { ...query, cursor: token } }))
    .rejects.toMatchObject({ status: 422 });
  await expect(service.read({ actor, query: { ...query, from: '2026-10-25', cursor: token } }))
    .rejects.toMatchObject({ status: 422 });
});

test('an earning missing its authoritative snapshot stays pending without fabricated totals', async () => {
  await models.BookingEarningSnapshot.deleteMany({});
  expect(await service.read({ actor })).toMatchObject({ pending: true });
});

test('missing or inconsistent ledger fails rather than showing a plausible balance', async () => {
  await models.EarningLedgerEntry.deleteMany({});
  await expect(service.read({ actor })).rejects.toMatchObject({ code: 'INVALID_PROJECTION' });
});

test('financial locks and audited releases project persisted disjoint buckets', async () => {
  const repository = createMongoSettlementRepository({ connection });
  const hold = { earningId: 'earning-one', lockType: 'CASE', reference: 'case-one', actorId: 'staff' };
  await createUnitOfWork(connection).run(session => repository.lockEarning(hold, session));
  expect((await service.read({ actor })).data.items[0]).toMatchObject({ available: 0, held: 90, accrued: 90 });
  await createUnitOfWork(connection).run(session => repository.unlockEarning({ ...hold, actorId: 'admin' }, session));
  expect((await service.read({ actor })).data.items[0]).toMatchObject({ available: 90, held: 0, accrued: 90 });
});

test('wrong roles fail before the repository is read', async () => {
  for (const role of ['ADMIN', 'STAFF', 'CUSTOMER']) await expect(service.read({ actor: { ...actor, roles: [role] } }))
    .rejects.toMatchObject({ status: 403 });
});

test('default app composes auth, earnings and settlement under one API mount', async () => {
  const f = await settlementRuntimeFixture(connection, replica.getUri(), 'PET_SITTER');
  const user = await userModel(connection).findOne({ displayName: 'Settlement test' }).lean();
  await seed('runtime-earning', String(user._id));
  await request(f.app).get('/api/v1/me/earnings').expect(401);
  await request(f.app).get('/api/v1/me').set('Cookie', f.cookie).expect(200);
  const response = await request(f.app).get('/api/v1/me/earnings').set('Cookie', f.cookie).expect(200);
  expect(response.body.data.items).toHaveLength(1);
  expect(response.body.data.items[0].bookingId).toBe('booking-runtime-earning');
  await request(f.app).get('/api/v1/settlement-requests').set('Cookie', f.cookie).expect(200);
});

test('a hold between earnings and ledger queries cannot mix two committed snapshots', async () => {
  const find = models.Earning.find;
  let pause = true;
  models.Earning.find = function (...args) {
    const query = find.apply(this, args);
    const exec = query.exec.bind(query);
    query.exec = async () => {
      const rows = await exec();
      if (pause) {
        pause = false;
        const repository = createMongoSettlementRepository({ connection });
        await createUnitOfWork(connection).run(session => repository.lockEarning({ earningId: 'earning-one',
          lockType: 'REFUND', reference: 'snapshot-refund', actorId: 'admin' }, session));
      }
      return rows;
    };
    return query;
  };
  try {
    expect((await service.read({ actor })).data.items[0]).toMatchObject({ available: 90, held: 0 });
    expect((await service.read({ actor })).data.items[0]).toMatchObject({ available: 0, held: 90 });
  } finally { models.Earning.find = find; }
});
