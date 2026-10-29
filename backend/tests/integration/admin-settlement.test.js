import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { settlementModels } from '../../src/models/settlement.model.js';
import { createMongoSettlementRepository } from '../../src/services/settlements/mongo-settlement.repository.js';
import { createAdminSettlementService } from '../../src/services/settlements/admin-settlement.service.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import request from 'supertest';
import { settlementRuntimeFixture } from '../fixtures/settlement-runtime.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';

let replica, connection, models, repository, service;
const actor = { userId: 'admin', state: 'ACTIVE', roles: ['ADMIN'] };
const base = { actor, requestId: 'r1', expectedVersion: 1, reference: 'bank1', evidenceReference: 'evidence1', idempotencyKey: 'transfer-one' };
const confirmed = { ...base, outcome: 'CONFIRMED', amountVnd: 100, paidAt: '2026-10-15T02:00:00Z' };
const policy = { resolve: async () => ({ ready: true, policyVersion: 'synthetic', decisionVersion: 'synthetic', decisionIds: [] }) };

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'admin_settlement_regression', autoIndex: false }).asPromise();
  models = settlementModels(connection);
  await provisionSettlementStorage(connection);
  repository = createMongoSettlementRepository({ connection });
  service = createAdminSettlementService({ repository, unitOfWork: createUnitOfWork(connection), policy,
    clock: () => new Date('2026-10-15T03:00:00Z') });
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(models).map(model => model.deleteMany({})));
  await models.Earning.create({ earningId: 'e1', sitterId: 'sitter', visitId: 'v1', earningPeriodKey: 'old', accruedVnd: 100,
    availableVnd: 0, reservedVnd: 100, state: 'RESERVED', version: 1, reservation: { requestId: 'r1', reservedAt: new Date() } });
  await models.SettlementRequest.create({ id: 'r1', sitterId: 'sitter', requestWeekKey: '2026-10-12',
    startsAt: '2026-10-11T17:00:00Z', endsAt: '2026-10-18T17:00:00Z', submittedAt: '2026-10-12T03:00:00Z',
    earningIds: ['e1'], amountVnd: 100, status: 'APPROVED', version: 1, policyVersion: 'synthetic', decisionVersion: 'synthetic' });
  await repository.registerEvidence({ requestId: 'r1', ownerActorId: 'admin', evidenceReference: 'evidence1', mediaId: 'synthetic' });
  await models.EarningLedgerEntry.create({ lineId: 'origin', operationId: 'origin', earningId: 'e1', sitterId: 'sitter',
    toBucket: 'RESERVED', amountVnd: 100, occurredAt: new Date() });
});

test('durable transfer persists required recordedAt and pays reservation exactly once', async () => {
  expect((await service.recordTransfer(confirmed)).status).toBe('PAID');
  expect((await service.recordTransfer(confirmed)).status).toBe('PAID');
  const request = await models.SettlementRequest.findOne({ id: 'r1' }).lean();
  expect(request.transfer.recordedAt.toISOString()).toBe('2026-10-15T03:00:00.000Z');
  expect(await models.SettlementTransfer.countDocuments()).toBe(1);
  expect((await models.Earning.findOne({ earningId: 'e1' })).paidVnd).toBe(100);
});

test('concurrent transfer retries return one committed result and ledger debit', async () => {
  const results = await Promise.all([service.recordTransfer(confirmed), service.recordTransfer(confirmed)]);
  expect(results[0]).toEqual(results[1]);
  expect(await models.SettlementTransfer.countDocuments()).toBe(1);
  expect(await models.EarningLedgerEntry.countDocuments({ toBucket: 'PAID' })).toBe(1);
});

test('case hold committed after approval reads forces recheck and prevents approval', async () => {
  await models.SettlementRequest.updateOne({ id: 'r1' }, { $set: { status: 'SUBMITTED', version: 0 } });
  let release, readComplete;
  const resume = new Promise(resolve => { release = resolve; });
  const observed = new Promise(resolve => { readComplete = resolve; });
  let pause = true;
  const findOne = models.FinancialLock.findOne;
  models.FinancialLock.findOne = function (...args) {
    const query = findOne.apply(this, args);
    const exec = query.exec.bind(query);
    query.exec = async () => {
      const result = await exec();
      if (pause) { pause = false; readComplete(); await resume; }
      return result;
    };
    return query;
  };
  try {
    const decision = service.decide({ actor, requestId: 'r1', expectedVersion: 0, decision: 'APPROVE',
      reason: 'Synthetic evidence', idempotencyKey: 'hold-race-command' });
    const outcome = decision.then(value => ({ value }), error => ({ error }));
    await observed;
    await createUnitOfWork(connection).run(transaction => repository.lockEarning({
      earningId: 'e1', lockType: 'CASE', reference: 'new-case' }, transaction));
    release();
    expect((await outcome).error).toMatchObject({ code: 'RESERVATION_CONFLICT' });
    expect((await models.SettlementRequest.findOne({ id: 'r1' })).status).toBe('SUBMITTED');
  } finally { release(); models.FinancialLock.findOne = findOne; }
});

test('unknown transfer reconciles using same references while retaining both audit attempts', async () => {
  expect((await service.recordTransfer({ ...base, outcome: 'UNKNOWN' })).status).toBe('TRANSFER_PENDING');
  expect((await service.recordTransfer({ ...confirmed, expectedVersion: 2, idempotencyKey: 'transfer-two' })).status).toBe('PAID');
  expect(await models.SettlementTransfer.countDocuments()).toBe(2);
  expect(await models.SettlementTransferClaim.countDocuments()).toBe(2);
  expect(await models.EarningLedgerEntry.countDocuments({ toBucket: 'PAID' })).toBe(1);
});

test('bank reference already claimed by another request rolls back all changes', async () => {
  await models.SettlementTransferClaim.create({ kind: 'TRANSFER', reference: 'bank1', requestId: 'someone-else' });
  await expect(service.recordTransfer(confirmed)).rejects.toMatchObject({ code: 'RESERVATION_CONFLICT' });
  expect((await models.SettlementRequest.findOne({ id: 'r1' })).status).toBe('APPROVED');
  expect((await models.Earning.findOne({ earningId: 'e1' })).reservedVnd).toBe(100);
  expect(await models.SettlementTransfer.countDocuments()).toBe(0);
});

test('missing request is a deliberate 404 and read policy remains visible', async () => {
  await expect(service.recordTransfer({ ...confirmed, requestId: 'missing' })).rejects.toMatchObject({ status: 404 });
  const pending = createAdminSettlementService({ repository, unitOfWork: createUnitOfWork(connection),
    policy: { resolve: async () => ({ ready: false, decisionIds: ['FIN-08-EDIT'] }) } });
  expect((await pending.list({ actor })).decisionIds).toEqual(['FIN-08-EDIT']);
  await expect(service.list({ actor, cursor: 'malformed' })).rejects.toMatchObject({ status: 422 });
});

test('default app mounts Admin payroll with real session and blocks unresolved writes', async () => {
  const f = await settlementRuntimeFixture(connection, replica.getUri(), 'ADMIN');
  await request(f.app).get('/api/v1/admin/settlements').expect(401);
  const response = await request(f.app).get('/api/v1/admin/settlements').set('Cookie', f.cookie).expect(200);
  expect(response.body.data.decisionIds).toContain('FIN-08-EDIT');
  await request(f.app).post('/api/v1/admin/settlements/r1/transfer-records').set('Cookie', f.cookie).send({}).expect(403);
  const blocked = await request(f.app).post('/api/v1/admin/settlements/r1/transfer-records').set('Cookie', f.cookie)
    .set('Host', '127.0.0.1').set('Origin', 'http://127.0.0.1').set('X-CSRF-Token', f.csrf)
    .set('Idempotency-Key', 'runtime-command').send({ expectedVersion: 1, outcome: 'UNKNOWN', reference: 'bank1', evidenceReference: 'evidence1' }).expect(409);
  expect(blocked.body.error.code).toBe('DECISION_REQUIRED');
  expect(await models.SettlementTransfer.countDocuments()).toBe(0);
});
