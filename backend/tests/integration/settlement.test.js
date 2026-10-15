import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { settlementModels } from '../../src/models/settlement.model.js';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';
import { createSettlementService } from '../../src/services/settlements/settlement.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import request from 'supertest';
import { settlementRuntimeFixture } from '../fixtures/settlement-runtime.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';

let replica, connection, models, repository, service;
const actor = { userId: 'sitter', state: 'ACTIVE', roles: ['PET_SITTER'] };
const week = { requestWeekKey: '2026-10-12', startsAt: '2026-10-11T17:00:00Z', endsAt: '2026-10-18T17:00:00Z' };
const policy = { resolve: async () => ({ ready: true, policyVersion: 'synthetic', decisionVersion: 'synthetic', decisionIds: [] }) };

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'settlement_regression', autoIndex: false }).asPromise();
  models = settlementModels(connection);
  await provisionSettlementStorage(connection);
  repository = createMongoSettlementRepository({ connection });
  service = createSettlementService({ repository, unitOfWork: createUnitOfWork(connection), policy,
    clock: () => new Date('2026-10-15T03:00:00Z') });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await models.Earning.create({ earningId: 'e1', sitterId: 'sitter', visitId: 'v1', earningPeriodKey: 'old',
    accruedVnd: 100, availableVnd: 100, state: 'AVAILABLE', version: 0 });
  await models.EarningLedgerEntry.create({ lineId: 'origin', operationId: 'origin', earningId: 'e1', sitterId: 'sitter',
    toBucket: 'AVAILABLE', amountVnd: 100, occurredAt: new Date() });
});

test('real transactions enforce one request and one reservation across concurrent devices', async () => {
  const results = await Promise.allSettled(['device-one', 'device-two'].map(idempotencyKey =>
    service.submit({ actor, earningIds: ['e1'], idempotencyKey })));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await models.SettlementWeekClaim.countDocuments()).toBe(1);
  expect(await models.SettlementRequest.countDocuments()).toBe(1);
  expect(await models.SettlementCommand.countDocuments()).toBe(1);
  expect(await models.SettlementEvent.countDocuments()).toBe(1);
  expect(await models.SettlementOutbox.countDocuments()).toBe(1);
  expect((await repository.readOwn({ sitterId: 'sitter', ...week })).balances).toMatchObject({ available: 0, reserved: 100 });
});

test('missing request maps to not found rather than throwing during projection', async () => {
  expect(await repository.getById('missing')).toBeNull();
});

test('concurrent replay of the same command returns the committed original result', async () => {
  const input = { actor, earningIds: ['e1'], idempotencyKey: 'same-command' };
  const results = await Promise.all([service.submit(input), service.submit(input)]);
  expect(results[0]).toEqual(results[1]);
  expect(await models.SettlementRequest.countDocuments()).toBe(1);
  expect(await models.SettlementCommand.countDocuments()).toBe(1);
});

test('partial or inconsistent ledger never exposes a requestable balance', async () => {
  await models.EarningLedgerEntry.create({ lineId: 'incomplete', operationId: 'incomplete', earningId: 'e1', sitterId: 'sitter',
    toBucket: 'AVAILABLE', amountVnd: 50, occurredAt: new Date() });
  expect(await repository.readOwn({ sitterId: 'sitter', ...week })).toEqual({ ledgerReady: false });
  await expect(service.submit({ actor, earningIds: ['e1'], idempotencyKey: 'corrupt-ledger' }))
    .rejects.toMatchObject({ code: 'EARNINGS_UNAVAILABLE' });
  expect(await models.SettlementWeekClaim.countDocuments()).toBe(0);
});

test('oversized history fails explicitly instead of returning truncated balances', async () => {
  await models.Earning.insertMany(Array.from({ length: 1000 }, (_, index) => ({
    earningId: `extra-${index}`, sitterId: 'sitter', visitId: `extra-visit-${index}`, earningPeriodKey: 'old',
    accruedVnd: 0, availableVnd: 0, state: 'AVAILABLE', version: 0
  })));
  await expect(repository.readOwn({ sitterId: 'sitter', ...week })).rejects.toMatchObject({ code: 'SETTLEMENT_HISTORY_LIMIT' });
});

test('readOwn uses one snapshot while a reservation commits between queries', async () => {
  const find = models.Earning.find;
  let paused = false;
  models.Earning.find = function (...args) {
    const query = find.apply(this, args);
    const exec = query.exec.bind(query);
    query.exec = async () => {
      const rows = await exec();
      if (!paused) {
        paused = true;
        await service.submit({ actor, earningIds: ['e1'], idempotencyKey: 'snapshot-command' });
      }
      return rows;
    };
    return query;
  };
  try {
    const projection = await repository.readOwn({ sitterId: 'sitter', ...week });
    expect(projection.ledgerReady).toBe(true);
    expect(projection.balances).toMatchObject({ available: 100, reserved: 0 });
    expect(projection.requests).toHaveLength(0);
    expect(projection.quotaUsed).toBe(false);
  } finally { models.Earning.find = find; }
});

test('missing unique quota index blocks a command before reserving money', async () => {
  await models.SettlementWeekClaim.collection.dropIndex('sitterId_1_requestWeekKey_1');
  try {
    await expect(service.submit({ actor, earningIds: ['e1'], idempotencyKey: 'index-command' }))
      .rejects.toMatchObject({ code: 'SETTLEMENT_STORAGE_NOT_READY' });
    expect(await models.SettlementWeekClaim.countDocuments()).toBe(0);
    expect((await models.Earning.findOne({ earningId: 'e1' })).availableVnd).toBe(100);
  } finally { await models.SettlementWeekClaim.createIndexes(); }
});

test('active case lock blocks reservation without consuming weekly quota', async () => {
  await createUnitOfWork(connection).run(transaction => repository.lockEarning({ earningId: 'e1', lockType: 'CASE', reference: 'case1' }, transaction));
  await expect(service.submit({ actor, earningIds: ['e1'], idempotencyKey: 'held-command' })).rejects.toMatchObject({ code: 'EARNINGS_UNAVAILABLE' });
  expect(await models.SettlementWeekClaim.countDocuments()).toBe(0);
});

test('read view exposes unresolved policy IDs even with a healthy empty ledger', async () => {
  await models.Earning.deleteMany({});
  await models.EarningLedgerEntry.deleteMany({});
  const pending = createSettlementService({ repository, unitOfWork: createUnitOfWork(connection),
    policy: { resolve: async () => ({ ready: false, decisionIds: ['FIN-07-ELIG'] }) } });
  expect((await pending.readOwn({ actor })).decisionIds).toEqual(['FIN-07-ELIG']);
});

test('default app mounts authenticated reads and CSRF-protected fail-closed money commands', async () => {
  const f = await settlementRuntimeFixture(connection, replica.getUri(), 'PET_SITTER');
  await request(f.app).get('/api/v1/settlement-requests').expect(401);
  const response = await request(f.app).get('/api/v1/settlement-requests').set('Cookie', f.cookie).expect(200);
  expect(response.body.data.decisionIds).toContain('FIN-07-ELIG');
  await request(f.app).post('/api/v1/settlement-requests').set('Cookie', f.cookie).send({ earningIds: ['e1'] }).expect(403);
  const blocked = await request(f.app).post('/api/v1/settlement-requests').set('Cookie', f.cookie)
    .set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', f.csrf)
    .set('Idempotency-Key', 'runtime-command').send({ earningIds: ['e1'] }).expect(409);
  expect(blocked.body.error.code).toBe('DECISION_REQUIRED');
  expect(await models.SettlementWeekClaim.countDocuments()).toBe(0);
});
