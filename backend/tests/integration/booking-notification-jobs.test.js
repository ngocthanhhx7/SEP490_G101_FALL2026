import { beforeAll, beforeEach, afterAll, expect, test, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Types } from 'mongoose';
import { createHmac } from 'node:crypto';
import { connectDatabase } from '../../src/config/database.js';
import { loadConfig } from '../../src/config/environment.js';
import { startRuntime } from '../../src/runtime.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createVisitRemindersService } from '../../src/services/employee-scheduling/visit-reminders.service.js';
import { createPaymentExpiryService } from '../../src/services/booking-proposals/payment-expiry.service.js';
import { createBookingPaymentExpiryService } from '../../src/services/booking-proposals/booking-payment-expiry.service.js';

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
  const visitId = new Types.ObjectId();
  booking.visitIds = [visitId];
  await col('bookings').insertOne(booking); await col('paymentintents').insertOne(intent);
  await col('visits').insertOne({ _id: visitId, bookingId: booking._id, state: 'SCHEDULED', sitterId: null, version: 0 });
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

test.each([120, 30])('JOB-01: reassignment at the same start sends the %i minute reminder to B without repeating the customer reminder', async lead => {
  const visit = await assigned(lead), replacementId = new Types.ObjectId();
  const run = () => createVisitRemindersService({ connection, clock: () => now }).runBatch();
  await run();
  await col('visits').updateOne({ _id: visit._id }, { $set: { sitterId: replacementId, assignedAt: new Date(now) },
    $inc: { version: 1, assignmentVersion: 1 } });
  await Promise.all([run(), run()]);
  const notifications = () => col('notifications').find({ 'metadata.visitId': String(visit._id), 'metadata.leadMinutes': lead }).toArray();
  expect((await notifications()).filter(row => row.role === 'CUSTOMER')).toHaveLength(1);
  expect((await notifications()).filter(row => row.recipientId === String(visit.sitterId))).toHaveLength(1);
  expect((await notifications()).filter(row => row.recipientId === String(replacementId))).toHaveLength(1);
  // Unrelated writes and a fresh service instance must not become a new assignment.
  await col('visits').updateOne({ _id: visit._id }, { $inc: { version: 1 } });
  await run();
  expect(await notifications()).toHaveLength(3);
});

test('JOB-01: assigning A again at the same clock time creates a new sitter reminder, not a new customer reminder', async () => {
  const visit = await assigned(120), replacementId = new Types.ObjectId();
  const run = () => createVisitRemindersService({ connection, clock: () => now }).runBatch();
  await col('visits').updateOne({ _id: visit._id }, { $set: { assignedAt: new Date(now), assignmentVersion: 1 } });
  await run();
  for (const sitterId of [replacementId, visit.sitterId]) {
    await col('visits').updateOne({ _id: visit._id }, { $set: { sitterId, assignedAt: new Date(now) },
      $inc: { version: 1, assignmentVersion: 1 } });
    await run();
  }
  expect(await col('notifications').countDocuments({ recipientId: String(visit.sitterId) })).toBe(2);
  expect(await col('notifications').countDocuments({ role: 'CUSTOMER' })).toBe(1);
  expect(await col('notifications').countDocuments({ recipientId: String(replacementId) })).toBe(1);
});

test('JOB-01: legacy markers retain both delivered reminders, then notify only the replacement sitter', async () => {
  const visit = await assigned(120);
  const run = () => createVisitRemindersService({ connection, clock: () => now }).runBatch();
  await run();
  // Match the deployed v1 marker shape: startAt/notifiedAt only.
  await col('visits').updateOne({ _id: visit._id }, { $unset: { 'startReminders.m120.sitter': '', 'startReminders.m120.customerId': '' } });
  await run();
  expect(await col('notifications').countDocuments()).toBe(2);
  const replacementId = new Types.ObjectId();
  await col('visits').updateOne({ _id: visit._id }, { $set: { sitterId: replacementId, assignedAt: new Date(now) },
    $inc: { version: 1, assignmentVersion: 1 } });
  await run();
  expect(await col('notifications').countDocuments({ role: 'CUSTOMER' })).toBe(1);
  expect(await col('notifications').countDocuments({ recipientId: String(replacementId) })).toBe(1);
  expect(await col('notifications').countDocuments()).toBe(3);
});

test('JOB-01: a genuinely changed start creates new schedule reminders for both recipients', async () => {
  const visit = await assigned(120);
  const run = () => createVisitRemindersService({ connection, clock: () => now }).runBatch();
  await run();
  now += 60000;
  await col('visits').updateOne({ _id: visit._id }, { $set: { startAt: new Date(now + 120 * 60000) }, $inc: { version: 1 } });
  await run(); await run();
  expect(await col('notifications').countDocuments({ role: 'CUSTOMER' })).toBe(2);
  expect(await col('notifications').countDocuments({ role: 'PET_SITTER' })).toBe(2);
});

test('JOB-01: failed replacement delivery rolls back its marker, then retries without repeating the customer', async () => {
  const visit = await assigned(120), replacementId = new Types.ObjectId();
  const run = () => createVisitRemindersService({ connection, clock: () => now }).runBatch();
  await run();
  await col('visits').updateOne({ _id: visit._id }, { $set: { sitterId: replacementId, assignedAt: new Date(now) },
    $inc: { version: 1, assignmentVersion: 1 } });
  await connection.db.command({ collMod: 'notifications', validator: { $jsonSchema: { required: ['syntheticNeverPresent'] } } });
  try {
    expect(await run()).toMatchObject({ failed: 1 });
    expect(String((await col('visits').findOne({ _id: visit._id })).startReminders.m120.sitter.recipientId)).toBe(String(visit.sitterId));
  } finally {
    await connection.db.command({ collMod: 'notifications', validator: {} });
  }
  await run(); await run();
  expect(await col('notifications').countDocuments({ role: 'CUSTOMER' })).toBe(1);
  expect(await col('notifications').countDocuments({ recipientId: String(replacementId) })).toBe(1);
});

test.each(['PENDING', 'CANCELLED', 'EXPIRED', 'FAILED'])('JOB-03 regression: an older %s attempt has money at payOS, so the newer unpaid link cannot expire the booking', async state => {
  const { booking, intent } = await unpaid('READY');
  const older = { ...intent, _id: new Types.ObjectId(), providerReference: String(Number(intent.providerReference) + 1), state };
  await col('paymentintents').insertOne(older);
  const provider = { getPaymentLink: jest.fn(async orderCode => ({ orderCode, amount: intent.amountVnd,
    amountPaid: orderCode === Number(older.providerReference) ? intent.amountVnd : 0,
    amountRemaining: orderCode === Number(older.providerReference) ? 0 : intent.amountVnd,
    providerStatus: orderCode === Number(older.providerReference) ? 'PAID' : 'EXPIRED' })) };
  await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect((await col('visits').findOne({ bookingId: booking._id })).state).toBe('SCHEDULED');
  expect(await col('notifications').countDocuments()).toBe(0);
  expect(await col('payments').countDocuments()).toBe(0);
  // Once any attempt has money, the sweep can stop without checking the rest.
  expect(provider.getPaymentLink).toHaveBeenCalledWith(Number(older.providerReference));
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
test('JOB-03 rolls back booking, visits and event when MSG67 cannot be stored, then retries once', async () => {
  const { booking, intent } = await unpaid();
  const provider = { getPaymentLink: jest.fn() };
  const service = createBookingPaymentExpiryService({ connection, provider, clock: () => now });
  await connection.db.command({ collMod: 'notifications', validator: { $jsonSchema: { required: ['syntheticNeverPresent'] } } });
  try {
    expect(await service.runBatch()).toMatchObject({ expired: 0, deferred: 1 });
    expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
    expect((await col('visits').findOne({ bookingId: booking._id })).state).toBe('SCHEDULED');
    expect((await col('paymentintents').findOne({ _id: intent._id })).state).toBe('PENDING');
    expect(await col('financesourceevents').countDocuments({ _id: `booking-payment-expired:${booking._id}` })).toBe(0);
  } finally {
    await connection.db.command({ collMod: 'notifications', validator: {} });
  }
  expect(await service.runBatch()).toMatchObject({ expired: 1 });
  await service.runBatch();
  expect(await col('notifications').countDocuments({ 'metadata.messageCode': 'MSG67' })).toBe(1);
  expect(provider.getPaymentLink).not.toHaveBeenCalled();
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
test('JOB-03: signed PAID lookup defers to webhook/reconciliation and never creates a second payment path', async () => {
  const { booking } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) { return { orderCode, amount: 100000, amountPaid: 100000, amountRemaining: 0,
    providerStatus: 'PAID', transactions: [{ reference: 'synthetic-bank-reference-1', amount: 100000 }] }; } };
  const service = createPaymentExpiryService({ connection, provider, clock: () => now });
  await Promise.all([service.runBatch(), service.runBatch()]); await service.runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect(await col('payments').countDocuments()).toBe(0);
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
test('server startup keeps reminders active but does not expire payments without a payOS provider', async () => {
  await assigned(); const { booking } = await unpaid();
  runtime = await startRuntime({ env: { ...env, EMPLOYEE_SCHEDULING_ENABLED: 'true', BOOKING_CHECKOUT_ENABLED: 'true' }, clock: () => now });
  const end = Date.now() + 5000;
  while (await col('notifications').countDocuments() < 2 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
  expect(await col('notifications').countDocuments()).toBe(2);
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  await runtime.stop(); runtime = null;
});

test('server startup schedules exactly one JOB-03 alongside reminders and shutdown stops it', async () => {
  await assigned(); const { intent } = await unpaid('READY');
  const checksumKey = 'synthetic-job03-checksum', originalFetch = globalThis.fetch;
  const fetchImpl = jest.fn(async () => {
    const data = { orderCode: Number(intent.providerReference), amount: intent.amountVnd,
      amountPaid: 0, amountRemaining: intent.amountVnd, status: 'EXPIRED' };
    const canonical = Object.keys(data).sort().map(key => `${key}=${data[key]}`).join('&');
    return { ok: true, status: 200, json: async () => ({ code: '00', data,
      signature: createHmac('sha256', checksumKey).update(canonical).digest('hex') }) };
  });
  globalThis.fetch = fetchImpl;
  try {
    runtime = await startRuntime({ env: { ...env, EMPLOYEE_SCHEDULING_ENABLED: 'true', BOOKING_CHECKOUT_ENABLED: 'true',
      PAYOS_ENABLED: 'true', PAYOS_CLIENT_ID: 'synthetic-client', PAYOS_API_KEY: 'synthetic-key', PAYOS_CHECKSUM_KEY: checksumKey }, clock: () => now });
    const end = Date.now() + 5000;
    while (await col('notifications').countDocuments() < 3 && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 20));
    await runtime.stop(); runtime = null;
    expect(await col('notifications').countDocuments()).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api-merchant.payos.vn/v2/payment-requests/${intent.providerReference}`);
  } finally { await runtime?.stop(); runtime = null; globalThis.fetch = originalFetch; }
});

test('JOB-03 checks all replaced attempts and atomically expires only an entirely unpaid booking once', async () => {
  const { booking, intent } = await unpaid('READY');
  const old = { ...intent, _id: new Types.ObjectId(), providerReference: String(Number(intent.providerReference) + 1), state: 'CANCELLED' };
  await col('paymentintents').insertOne(old);
  const provider = { getPaymentLink: jest.fn(async orderCode => ({ orderCode, amount: intent.amountVnd, amountPaid: 0,
    amountRemaining: intent.amountVnd, providerStatus: 'EXPIRED' })) };
  const service = createBookingPaymentExpiryService({ connection, provider, clock: () => now });
  await Promise.all([service.runBatch(), service.runBatch()]); await service.runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('PAYMENT_EXPIRED');
  expect((await col('paymentintents').findOne({ _id: old._id })).state).toBe('CANCELLED');
  expect((await col('paymentintents').findOne({ _id: intent._id })).state).toBe('EXPIRED');
  expect(await col('notifications').countDocuments({ 'metadata.messageCode': 'MSG67' })).toBe(1);
  expect(await col('financesourceevents').countDocuments({ _id: `booking-payment-expired:${booking._id}` })).toBe(1);
});

test.each(['PARTIAL', 'PENDING', 'UNAVAILABLE'])('JOB-03 defers when an older replaced attempt is %s, even with a terminal unpaid current intent', async status => {
  const { booking, intent } = await unpaid('READY');
  const older = { ...intent, _id: new Types.ObjectId(), providerReference: String(Number(intent.providerReference) + 1), state: 'CANCELLED' };
  await col('paymentintents').insertOne(older);
  const provider = { async getPaymentLink(orderCode) {
    if (orderCode === Number(older.providerReference) && status === 'UNAVAILABLE') throw new Error('Synthetic outage');
    return { orderCode, amount: intent.amountVnd, amountPaid: orderCode === Number(older.providerReference) && status === 'PARTIAL' ? 1 : 0,
      providerStatus: orderCode === Number(older.providerReference) && status === 'PENDING' ? 'PENDING' : 'EXPIRED' };
  } };
  await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect(await col('notifications').countDocuments()).toBe(0);
});

test('JOB-03 defers if a new attempt appears while collecting provider evidence', async () => {
  const { booking, intent } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) {
    await col('paymentintents').insertOne({ ...intent, _id: new Types.ObjectId(), providerReference: String(orderCode + 1) });
    return { orderCode, amount: intent.amountVnd, amountPaid: 0, providerStatus: 'EXPIRED' };
  } };
  expect(await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch()).toMatchObject({ expired: 0, deferred: 1 });
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect(await col('notifications').countDocuments()).toBe(0);
});

test('JOB-03 rechecks provider-binding fields even when legacy code did not increment intent version', async () => {
  const { booking, intent } = await unpaid('READY');
  const provider = { async getPaymentLink(orderCode) {
    await col('paymentintents').updateOne({ _id: intent._id }, { $set: { providerReference: String(orderCode + 1) } });
    return { orderCode, amount: intent.amountVnd, amountPaid: 0, providerStatus: 'EXPIRED' };
  } };
  expect(await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch()).toMatchObject({ expired: 0, deferred: 1 });
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
});

test('JOB-03 preserves a booking that already has a receipt requiring reconciliation', async () => {
  const { booking } = await unpaid('READY');
  await col('payments').insertOne({ bookingId: booking._id, state: 'RECONCILIATION_REQUIRED' });
  const provider = { async getPaymentLink(orderCode) { return { orderCode, amount: 100000, amountPaid: 0, providerStatus: 'EXPIRED' }; } };
  expect(await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch()).toMatchObject({ expired: 0, deferred: 1 });
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
});

test('JOB-03 defers an over-limit booking rather than accepting only the first twenty unpaid attempts', async () => {
  const { booking, intent } = await unpaid('READY');
  await col('paymentintents').insertMany(Array.from({ length: 20 }, (_, index) => ({ ...intent,
    _id: new Types.ObjectId(), providerReference: String(Number(intent.providerReference) + index + 1), state: 'CANCELLED' })));
  const provider = { getPaymentLink: jest.fn() };
  expect(await createBookingPaymentExpiryService({ connection, provider, clock: () => now }).runBatch()).toMatchObject({ expired: 0, deferred: 1 });
  expect(provider.getPaymentLink).not.toHaveBeenCalled();
  expect((await col('bookings').findOne({ _id: booking._id })).state).toBe('AWAITING_PAYMENT');
  expect(await col('notifications').countDocuments()).toBe(0);
});
