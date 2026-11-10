import { afterAll, beforeAll, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { provisionCustomerTierStorage } from '../../src/services/customer-tier-storage.service.js';
import { createMongoCustomerTierRepository } from '../../src/services/mongo-customer-tier.repository.js';
import { createCustomerTierService } from '../../src/services/customer-tier.service.js';

const oid = () => new mongoose.Types.ObjectId();
const at = new Date('2026-11-10T19:00:00Z');
const start = new Date('2025-11-10T19:00:00Z');
const old = new Date(start.getTime() - 1), during = new Date(at.getTime() - 1);
let mongo, connection, db, repository, policy;
const customer = async (role = 'CUSTOMER') => {
  const _id = oid();
  await db.collection('users').insertOne({ _id, roles: [role] });
  return _id;
};
const order = (customerId, fields) => db.collection('productorders').insertOne({
  customerId, paymentMethod: 'COD', status: 'DELIVERED', paid: true,
  total: policy.thresholds.SILVER, deliveredAt: during, ...fields
});
async function receipt(customerId, fields = {}) {
  const bookingId = oid();
  await db.collection('bookings').insertOne({ _id: bookingId, customerId, paymentMode: 'PREPAY' });
  await db.collection('payments').insertOne({ bookingId, state: 'VERIFIED', verifiedAt: during,
    receiptMoney: { amountVnd: policy.thresholds.SILVER, currency: 'VND' }, ...fields });
}
function service(overrides = {}) {
  return createCustomerTierService({ repository, clock: () => at.getTime(), ...overrides });
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(mongo.getUri(), { dbName: 'synthetic_customer_tier' }).asPromise();
  db = connection.db;
  for (const name of ['users', 'bookings', 'payments', 'productorders']) await db.createCollection(name);
  await provisionCustomerTierStorage(connection);
  policy = await db.collection('customer_tier_policies').findOne({ _id: 'current' });
  repository = createMongoCustomerTierRepository(connection);
}, 600000);
afterAll(async () => { await connection?.close(); await mongo?.stop(); }, 30000);

test('JOB-05 GBR-42: isolated spend, window bounds, pickup and both minimum-total branches', async () => {
  const [member, cod, pickup, promote, hold, mixed, late, staff] = await Promise.all([
    customer(), customer(), customer(), customer(), customer(), customer(), customer(), customer('STAFF')
  ]);
  const { SILVER: S, GOLD: G } = policy.thresholds;
  await db.collection('customer_tiers').insertMany([{ _id: hold, tier: 'GOLD', asOf: old }, { _id: promote, tier: 'SILVER', asOf: old }]);
  await Promise.all([
    order(cod, { deliveredAt: start }),
    order(pickup, { paymentMethod: 'PAY_AT_SHOP', status: 'PICKED_UP', createdAt: start }),
    order(promote, { paymentMethod: 'PAY_AT_SHOP', status: 'PICKED_UP', createdAt: old }),
    order(promote, { total: G }),
    order(hold, { paymentMethod: 'PAY_AT_SHOP', status: 'READY', createdAt: old }),
    order(member, { deliveredAt: old }),
    order(member, { status: 'CANCELLED' }), order(member, { status: 'RETURNED' }), order(member, { status: 'BEING_RETURNED' }),
    order(member, { paid: false }), order(staff, { total: G }),
    receipt(mixed), order(mixed, { total: G - S }),
    receipt(member, { state: 'RECONCILIATION_REQUIRED' }), receipt(late, { verifiedAt: at })
  ]);
  await db.collection('bookings').insertOne({ customerId: mixed, paymentMode: 'POSTPAY', paymentState: 'OVERDUE' });
  const job = service();
  expect(await job.read(staff)).toBeNull();
  expect(await job.read(member)).toMatchObject({ tier: 'MEMBER', discountBps: 0 });
  const result = await job.run();
  expect(result).toMatchObject({ status: 'COMPLETED', held: 1, applied: 6 });
  for (const [id, tier] of [[member, 'MEMBER'], [cod, 'SILVER'], [pickup, 'SILVER'], [promote, 'GOLD'], [hold, 'GOLD'], [mixed, 'GOLD'], [late, 'MEMBER']]) {
    expect(await job.read(id)).toEqual({ tier, discountBps: policy.discountsBps[tier] });
  }
  await order(late, { total: G });
  expect(await job.run()).toEqual(result);
  expect(await job.read(late)).toMatchObject({ tier: 'MEMBER' });
  const nextDay = service({ clock: () => at.getTime() + 86400000 });
  expect(await nextDay.run()).toMatchObject({ status: 'COMPLETED' });
  expect(await nextDay.read(late)).toMatchObject({ tier: 'GOLD' });
});

test('JOB-05 GBR-42: a snapshot excludes pickup payment during the run and lease rejects a second worker', async () => {
  const id = await customer();
  const pending = await order(id, { paymentMethod: 'PAY_AT_SHOP', status: 'READY', createdAt: during, paid: false });
  const nextDay = new Date(at.getTime() + 2 * 86400000);
  const options = { clock: () => nextDay.getTime() };
  const contender = service(options);
  const job = service({ ...options, additionalSources: [async () => {
    await db.collection('productorders').updateOne({ _id: pending.insertedId }, { $set: { paid: true } });
    expect(await contender.run()).toMatchObject({ status: 'BUSY' });
    return [];
  }] });
  expect(await job.run()).toMatchObject({ status: 'COMPLETED' });
  expect(await job.read(id)).toMatchObject({ tier: 'MEMBER' });
  expect(await service({ clock: () => nextDay.getTime() + 86400000 }).run()).toMatchObject({ status: 'COMPLETED' });
  expect(await job.read(id)).toMatchObject({ tier: 'SILVER' });
});

test('JOB-05 GBR-42: a database read failure saves no tiers from incomplete spend', async () => {
  const id = await customer();
  await db.collection('customer_tiers').insertOne({ _id: id, tier: 'GOLD', asOf: old });
  const before = await db.collection('customer_tiers').countDocuments();
  const job = service({ clock: () => at.getTime() + 4 * 86400000,
    repository: { ...repository, readOrders: async () => { throw new Error('synthetic database error'); } } });
  await expect(job.run()).rejects.toThrow('synthetic database error');
  expect(await job.run()).toMatchObject({ status: 'FAILED' });
  expect(await db.collection('customer_tiers').countDocuments()).toBe(before);
  expect(await job.read(id)).toMatchObject({ tier: 'GOLD' });
});

test('JOB-05 GBR-42: an interrupted apply keeps prior writes and resumes with the same cutoff and totals', async () => {
  const ids = Array.from({ length: 105 }, oid);
  await db.collection('users').insertMany(ids.map(_id => ({ _id, roles: ['CUSTOMER'] })));
  const [first] = ids, last = ids.at(-1);
  const { GOLD: G } = policy.thresholds;
  await order(first, { total: G });
  await db.collection('customer_tiers').insertOne({ _id: last, tier: 'SILVER', asOf: old });
  const clock = () => at.getTime() + 5 * 86400000;
  let batches = 0;
  const interrupted = service({ clock, repository: { ...repository, applyResults: async (...args) => {
    if (++batches === 2) throw new Error('synthetic write failure');
    return repository.applyResults(...args);
  } } });
  await expect(interrupted.run()).rejects.toThrow('synthetic write failure');
  expect(await interrupted.read(first)).toMatchObject({ tier: 'GOLD' });
  expect(await interrupted.read(last)).toMatchObject({ tier: 'SILVER' });
  await order(last, { total: G });
  const retry = service({ clock });
  expect(await retry.run()).toMatchObject({ status: 'READY' });
  const completed = await retry.run({ resume: true });
  expect(completed).toMatchObject({ status: 'COMPLETED', asOf: new Date(clock()).toISOString() });
  expect(await retry.read(last)).toMatchObject({ tier: 'MEMBER' });
  expect(await retry.run({ resume: true })).toEqual(completed);
});

test('JOB-05: a worker whose lease expired cannot write after another worker takes over', async () => {
  const time = new Date(at.getTime() + 6 * 86400000);
  const first = await repository.acquireLease('first', time);
  const later = new Date(time.getTime() + 120001);
  const second = await repository.acquireLease('second', later);
  expect(second.fence).toBeGreaterThan(first.fence);
  await expect(repository.beginRun({ _id: 'stale-run' }, first, later)).rejects.toThrow('lease lost');
  await repository.releaseLease(first);
  expect(await repository.acquireLease('third', later)).toBeNull();
  await repository.releaseLease(second);
});
