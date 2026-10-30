import { afterAll, beforeAll, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { assertPayrollStorage } from '../../src/services/payroll/payroll-storage.service.js';
import { assertFinanceSourceStorage } from '../../src/services/settlements/source-provisioning.js';
import { assertEmployeeSchedulingStorage } from '../../src/services/employee-scheduling/scheduling-storage.service.js';

jest.setTimeout(120000);
let replica;
const connections = [];
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
}, 600000);
afterAll(async () => {
  for (const connection of connections) await connection.close();
  await replica?.stop();
}, 30000);

async function runtime(name, enabled = true) {
  const env = {
    NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: name,
    AUTH_ENABLED: 'true', OTP_HMAC_SECRET: 'synthetic-otp-secret-for-storage-test',
    SESSION_TOKEN_SECRET: 'synthetic-token-secret-for-storage-test',
    SESSION_CSRF_SECRET: 'synthetic-csrf-secret-for-storage-test',
    CONTACT_LOOKUP_SECRET: 'synthetic-lookup-secret-for-storage-test',
    CONTACT_ENCRYPTION_KEY: '12345678901234567890123456789012',
    FINANCE_SOURCES_ENABLED: String(enabled), EMPLOYEE_SCHEDULING_ENABLED: String(enabled)
  };
  const connection = await mongoose.createConnection(replica.getUri(), {
    dbName: name, autoIndex: false, autoCreate: false, bufferCommands: false
  }).asPromise();
  connections.push(connection);
  createApp({ config: loadConfig(env), connection, env, lifecycle: { draining: false } });
  return { connection, env };
}

test('provisions enabled production storage repeatedly and preserves existing records', async () => {
  const context = await runtime('synthetic_deployment');
  const { connection } = context;
  const existing = { _id: new mongoose.Types.ObjectId(), state: 'SYNTHETIC_EXISTING_BOOKING', amountVnd: 123456 };
  await connection.collection('bookings').insertOne(existing);
  expect((await provisionDeploymentStorage(context)).state).toBe('INDEXES_READY');
  await assertPayrollStorage(connection);
  await assertFinanceSourceStorage(connection);
  await assertEmployeeSchedulingStorage(connection);
  const indexes = await connection.db.collection('payments').listIndexes().toArray();
  expect(indexes.some(index => index.name === 'one_verified_booking_receipt' && index.unique)).toBe(true);
  const locationIndexes = await connection.models.EmployeeVisitTravel.collection.listIndexes().toArray();
  expect(locationIndexes.some(index => typeof index.expireAfterSeconds === 'number')).toBe(true);
  const names = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
  await provisionDeploymentStorage(context);
  expect(await connection.collection('bookings').findOne({ _id: existing._id })).toEqual(existing);
  for (const name of names.filter(name => name !== 'bookings')) expect(await connection.collection(name).countDocuments()).toBe(0);
  await connection.collection('payments').insertOne({ provider: 'SYNTHETIC', providerEventId: 'same-event' });
  await expect(connection.collection('payments').insertOne({ provider: 'SYNTHETIC', providerEventId: 'same-event' })).rejects.toMatchObject({ code: 11000 });
});

test('leaves disabled raw modules absent while provisioning registered payroll models', async () => {
  const context = await runtime('synthetic_deployment_disabled', false);
  await provisionDeploymentStorage(context);
  await assertPayrollStorage(context.connection);
  const names = (await context.connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
  expect(names).not.toContain('payments');
  expect(names).not.toContain('paymentintents');
  expect(names).not.toContain('employeevisitoffers');
});

test('refuses obsolete payroll indexes without dropping them or rewriting records', async () => {
  const context = await runtime('synthetic_deployment_legacy', false);
  const statements = context.connection.models.PayrollStatement.collection;
  await context.connection.models.PayrollStatement.createCollection();
  await statements.createIndex({ employeeId: 1, periodStart: 1, periodEnd: 1 }, { unique: true });
  await expect(provisionDeploymentStorage(context)).rejects.toMatchObject({ code: 'PAYROLL_STORAGE_NOT_READY' });
  expect((await statements.listIndexes().toArray()).some(index => index.name === 'employeeId_1_periodStart_1_periodEnd_1')).toBe(true);
});

test('fails deployment on conflicting finance indexes and preserves existing data', async () => {
  const context = await runtime('synthetic_deployment_conflict');
  const payments = context.connection.db.collection('payments');
  await payments.insertOne({ _id: 'synthetic-receipt', provider: 'SYNTHETIC', providerEventId: 'one' });
  await payments.createIndex({ provider: 1, providerEventId: 1 }, { name: 'verified_provider_event' });
  await expect(provisionDeploymentStorage(context)).rejects.toMatchObject({ code: 86 });
  expect(await payments.countDocuments()).toBe(1);
  expect((await payments.listIndexes().toArray()).find(index => index.name === 'verified_provider_event').unique).not.toBe(true);
});
