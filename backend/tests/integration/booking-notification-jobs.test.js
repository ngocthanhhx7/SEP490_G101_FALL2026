import { beforeAll, beforeEach, afterAll, expect, test, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Types } from 'mongoose';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { startRuntime } from '../../src/runtime.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createVisitRemindersService } from '../../src/services/employee-scheduling/visit-reminders.service.js';
import { createPaymentExpiryService } from '../../src/services/booking-proposals/payment-expiry.service.js';

let replica, connection, runtime, now;
const env = { NODE_ENV: 'test', PORT: '0', MONGO_DB: 'pwc_notification_jobs', AUTH_ENABLED: 'true',
  OTP_HMAC_SECRET: 'a'.repeat(32), SESSION_TOKEN_SECRET: 'b'.repeat(32), SESSION_CSRF_SECRET: 'c'.repeat(32),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(32), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32) };
const col = name => connection.db.collection(name);
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri();
  connection = await connectDatabase(loadConfig(env));
  await provisionFinanceSources(connection);
}, 600000);
beforeEach(async () => {
  now = Date.now() + 86400000;
  for (const name of ['visits', 'bookings', 'paymentintents', 'payments', 'notifications']) await col(name).deleteMany({});
});
afterAll(async () => { await runtime?.stop(); await connection?.close(); await replica?.stop(); }, 30000);
async function assigned(minutes = 120) {
  const bookingId = new Types.ObjectId(), customerId = new Types.ObjectId(), sitterId = new Types.ObjectId();
  await col('bookings').insertOne({ _id: bookingId, customerId, state: 'ASSIGNED', paymentState: 'PAID', version: 0 });
  const visit = { _id: new Types.ObjectId(), bookingId, customerId, sitterId, state: 'ASSIGNED', version: 0,
    startAt: new Date(now + minutes * 60000), endAt: new Date(now + (minutes + 60) * 60000),
    snapshots: { serviceAddress: 'Synthetic Hanoi address', pets: [{ name: 'Synthetic pet' }] } };
  await col('visits').insertOne(visit); return visit;
}
async function unpaid(linkState) {
  const booking = { _id: new Types.ObjectId(), customerId: new Types.ObjectId(), state: 'AWAITING_PAYMENT', paymentState: 'UNPAID',
    version: 0, financeGuardVersion: 0, paymentDeadlineAt: new Date(now), paymentSnapshot: { amountVnd: 100000, currency: 'VND' } };
  const intent = { _id: new Types.ObjectId(), bookingId: booking._id, provider: 'PAYOS', state: 'PENDING', version: 0,
    providerReference: String(now + Math.floor(Math.random() * 100000)), amountVnd: 100000, currency: 'VND',
    expiresAt: booking.paymentDeadlineAt, ...(linkState ? { linkState } : {}) };
  await col('bookings').insertOne(booking); await col('paymentintents').insertOne(intent);
  await col('visits').insertOne({ _id: new Types.ObjectId(), bookingId: booking._id, state: 'SCHEDULED', sitterId: null, version: 0 });
  return { booking, intent };
}
test('JOB-01: both recipients get each 120/30 minute reminder once, including concurrent sweeps', async () => {
  const visit = await assigned();
  const a = createVisitRemindersService({ connection, clock: () => now }), b = createVisitRemindersService({ connection, clock: () => now });
  await Promise.all([a.runBatch(), b.runBatch()]);
  expect(await col('notifications').countDocuments()).toBe(2);
  expect((await col('notifications').find({}).toArray()).map(row => row.role).sort()).toEqual(['CUSTOMER', 'PET_SITTER']);
  expect((await col('notifications').findOne({})).message).toContain('Synthetic Hanoi address');
  now += 90 * 60000;
  await a.runBatch(); await a.runBatch();
  expect(await col('notifications').countDocuments()).toBe(4);
  expect((await col('visits').findOne({ _id: visit._id })).state).toBe('ASSIGNED');
});
test('JOB-01: unassigned, cancelled, started and more-than-two-hours-away visits do not get reminders', async () => {
  const visit = await assigned(121);
  const service = createVisitRemindersService({ connection, clock: () => now });
  await service.runBatch();
  await col('visits').updateOne({ _id: visit._id }, { $set: { startAt: new Date(now + 120000), sitterId: null } });
  await service.runBatch();
  await col('visits').updateOne({ _id: visit._id }, { $set: { sitterId: visit.sitterId, state: 'CANCELLED' } });
  await service.runBatch();
  await col('visits').updateOne({ _id: visit._id }, { $set: { state: 'ASSIGNED', startAt: new Date(now) } });
  await service.runBatch();
  expect(await col('notifications').countDocuments()).toBe(0);
});
test('JOB-03 / MSG67: terminal unpaid provider evidence expires booking and frees visits atomically, once', async () => {
  const { booking } = await unpaid('READY');
  const provider = { getPaymentLink: jest.fn(async orderCode => ({ orderCode, amount: 100000, amountPaid: 0, amountRemaining: 100000, providerStatus: 'EXPIRED' })) };
  const service = createPaymentExpiryService({ connection, provider, clock: () => now });
  await Promise.all([service.runBatch(), service.runBatch()]); await service.runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('PAYMENT_EXPIRED');
  expect((await col('visits').findOne({ bookingId: booking._id })).state).toBe('CANCELLED');
  expect(await col('notifications').countDocuments()).toBe(1);
  expect((await col('notifications').findOne({})).metadata.messageCode).toBe('MSG67');
});
test.each(['PAID', 'PENDING', 'PARTIALLY_PAID', 'UNAVAILABLE', 'WRONG_AMOUNT'])('JOB-03: %s never produces a false expiry or MSG67', async status => {
  const { booking } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) {
    if (status === 'UNAVAILABLE') throw new Error('Synthetic outage');
    return { orderCode, amount: status === 'WRONG_AMOUNT' ? 200000 : 100000, amountPaid: status === 'PAID' ? 100000 : status === 'PARTIALLY_PAID' ? 1 : 0,
      amountRemaining: status === 'PAID' ? 0 : 100000, providerStatus: status === 'WRONG_AMOUNT' ? 'EXPIRED' : status };
  } };
  await createPaymentExpiryService({ connection, provider, clock: () => now }).runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect(await col('notifications').countDocuments()).toBe(0);
});
test('JOB-03: signed PAID lookup with a bank reference records one receipt and releases booking to dispatch', async () => {
  const { booking } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) { return { orderCode, amount: 100000, amountPaid: 100000, amountRemaining: 0,
    providerStatus: 'PAID', transactions: [{ reference: 'synthetic-bank-reference-1', amount: 100000 }] }; } };
  const service = createPaymentExpiryService({ connection, provider, clock: () => now });
  await Promise.all([service.runBatch(), service.runBatch()]); await service.runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('DISPATCH_PENDING');
  expect(await col('payments').countDocuments({ state: 'VERIFIED' })).toBe(1);
  expect(await col('notifications').countDocuments({ eventType: 'BOOKING_PAYMENT_EXPIRED' })).toBe(0);
});
test('JOB-03: a webhook committing payment during the provider lookup wins the state guard', async () => {
  const { booking, intent } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) {
    await col('bookings').updateOne({ _id: booking._id }, { $set: { paymentState: 'PAID', state: 'DISPATCH_PENDING' }, $inc: { version: 1 } });
    await col('paymentintents').updateOne({ _id: intent._id }, { $set: { state: 'PAID' }, $inc: { version: 1 } });
    return { orderCode, amount: 100000, amountPaid: 0, amountRemaining: 100000, providerStatus: 'EXPIRED' };
  } };
  await createPaymentExpiryService({ connection, provider, clock: () => now }).runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('DISPATCH_PENDING');
  expect(await col('notifications').countDocuments()).toBe(0);
});
test('server startup runs both jobs with real MongoDB and graceful shutdown awaits them', async () => {
  await assigned(); await unpaid();
  runtime = await startRuntime({ env: { ...env, EMPLOYEE_SCHEDULING_ENABLED: 'true', BOOKING_CHECKOUT_ENABLED: 'true' }, clock: () => now });
  const end = Date.now() + 5000;
  while (await col('notifications').countDocuments() < 3 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  expect(await col('notifications').countDocuments()).toBe(3);
  await runtime.stop(); runtime = null;
});
