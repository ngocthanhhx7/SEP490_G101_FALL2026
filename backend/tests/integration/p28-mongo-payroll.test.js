import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createMongoPayrollRepository } from '../../src/services/dashboards/mongo-payroll.repository.js';
import { createPayrollService } from '../../src/services/dashboards/payroll.service.js';

let replica, connection, service;
const actor = { userId: 'synthetic-admin', state: 'ACTIVE', roles: ['ADMIN'],
  expiresAt: Date.now() + 3600000 };
const sitterId = new mongoose.Types.ObjectId();
const userUpdatedAt = new Date('2026-10-15T05:00:00Z');
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_p28_payroll' }).asPromise();
  await connection.collection('users').insertOne({ _id: sitterId, roles: ['PET_SITTER'],
    displayName: 'Synthetic sitter', updatedAt: userUpdatedAt, privateContact: 'PRIVATE' });
  await connection.collection('settlementrequests').insertMany([0, 1, 2].map(index => ({
    id: `synthetic-request-${index}`, sitterId: sitterId.toString(), status: index === 0 ? 'PAID' : 'APPROVED',
    amountVnd: 10000, requestWeekKey: '2026-10-12',
    submittedAt: new Date(`2026-10-${index === 2 ? '16' : '15'}T${index === 0 ? '01' : '02'}:00:00Z`),
    updatedAt: new Date('2026-10-15T03:00:00Z'), policyVersion: 'synthetic-policy-v1',
    decisionVersion: 'synthetic-decision-v1',
    transfer: index === 0 ? { paidAt: new Date('2026-10-15T04:00:00Z'), evidenceReference: 'PRIVATE' } : null
  })));
  service = createPayrollService({ repository: createMongoPayrollRepository({ connection,
    cursorSecret: 'synthetic-test-secret-for-payroll-0001' }) });
});
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('real Mongo snapshot joins, Vietnam dates and cursor pagination preserve persisted amounts', async () => {
  const query = { from: '2026-10-15', to: '2026-10-15', limit: '1' };
  const first = await service.read({ actor, query });
  expect(first.data.asOf).toBe(userUpdatedAt.toISOString());
  expect(first.data.items).toEqual([{ id: 'synthetic-request-1', displayName: 'Synthetic sitter',
    state: 'APPROVED', amountVnd: 10000, requestWeekKey: '2026-10-12', transferRecordedAt: null }]);
  expect(first.data.nextCursor).toBeTruthy();
  const second = await service.read({ actor, query: { ...query, cursor: first.data.nextCursor } });
  expect(second.data.items[0]).toMatchObject({ id: 'synthetic-request-0', state: 'PAID',
    amountVnd: 10000, transferRecordedAt: '2026-10-15T04:00:00.000Z' });
  expect(second.data.nextCursor).toBeNull();
  expect(JSON.stringify([first, second])).not.toContain('PRIVATE');
  await expect(service.read({ actor, query: { ...query, from: '2026-10-14', cursor: first.data.nextCursor } }))
    .rejects.toMatchObject({ status: 422 });
});

test('missing joined sitter remains pending against the actual collection', async () => {
  await connection.collection('users').deleteOne({ _id: sitterId });
  await expect(service.read({ actor })).resolves.toMatchObject({ pending: true });
});
