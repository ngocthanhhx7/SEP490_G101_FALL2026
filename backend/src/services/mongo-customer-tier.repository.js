import { isApprovedCustomerTierPolicy } from '../config/customer-tier-policy.js';
import { AppError } from '../utils/app-error.js';
import { Types } from 'mongoose';
import { CUSTOMER_TIER_COLLECTIONS, CUSTOMER_TIER_LEASE_ID } from '../models/customer-tier.model.js';
import { createUnitOfWork } from './unit-of-work.service.js';

const LEASE_MS = 120000;
const MAX_SPEND_ROWS = 10000;
const QUERY_MS = 15000;
const EXCLUDED_ORDER_STATES = ['CANCELLED', 'BEING_RETURNED', 'RETURNED'];
const id = value => new Types.ObjectId(value);

async function boundedRows(cursor) {
  const rows = await cursor.toArray();
  if (rows.length > MAX_SPEND_ROWS) throw new Error('Customer tier source query budget exceeded');
  return rows;
}

export function createMongoCustomerTierRepository(connection) {
  const db = connection.db;
  const col = name => db.collection(name);
  const users = col('users');
  const tiers = col(CUSTOMER_TIER_COLLECTIONS.tiers);
  const policies = col(CUSTOMER_TIER_COLLECTIONS.policies);
  const runs = col(CUSTOMER_TIER_COLLECTIONS.runs);
  const results = col(CUSTOMER_TIER_COLLECTIONS.results);
  const unit = createUnitOfWork(connection);
  const expires = now => new Date(now.getTime() + LEASE_MS);
  const leaseIdentity = lease => ({ _id: CUSTOMER_TIER_LEASE_ID, token: lease.token, fence: lease.fence });

  function fenced(lease, now, work) {
    return unit.run(async session => {
      const renewed = await runs.updateOne(
        { ...leaseIdentity(lease), expiresAt: { $gt: now } },
        { $set: { expiresAt: expires(now) } }, { session }
      );
      if (renewed.matchedCount !== 1) throw new Error('Customer tier lease lost');
      return work(session);
    });
  }

  return Object.freeze({
    async assertStorage() {
      const required = [...Object.values(CUSTOMER_TIER_COLLECTIONS), 'users', 'bookings', 'payments', 'productorders'];
      const registered = await db.listCollections({ name: { $in: required } }, { nameOnly: true }).toArray();
      if (registered.length !== required.length) throw new Error('Customer tier storage or spend source is unavailable');
    },

    async acquireLease(token, now) {
      const lease = await runs.findOneAndUpdate({ _id: CUSTOMER_TIER_LEASE_ID, expiresAt: { $lte: now } },
        { $set: { token, expiresAt: expires(now) }, $inc: { fence: 1 } }, { returnDocument: 'after', writeConcern: { w: 'majority' } });
      if (!lease && !await runs.findOne({ _id: CUSTOMER_TIER_LEASE_ID })) throw new Error('Customer tier lease is not provisioned');
      return lease;
    },

    releaseLease: lease => runs.updateOne(leaseIdentity(lease), { $set: { expiresAt: new Date(0), token: null } }),
    readRun: day => runs.findOne({ _id: day }),
    hasNewerResults: async day => Boolean(await runs.findOne(
      { _id: { $gt: day }, status: { $in: ['READY', 'COMPLETED'] } }, { projection: { _id: 1 } })),
    readPolicy: session => policies.findOne({ _id: 'current' }, { session, maxTimeMS: QUERY_MS }),

    async withSnapshot(work) {
      const session = connection.getClient().startSession({ snapshot: true });
      try { return await work(session); }
      finally { await session.endSession(); }
    },

    async listCustomers(after, limit, session) {
      const rows = await users.find({ roles: ['CUSTOMER'], ...(after ? { _id: { $gt: after } } : {}) },
        { session, maxTimeMS: QUERY_MS, projection: { _id: 1 } }).sort({ _id: 1 }).limit(limit).toArray();
      return rows.map(row => row._id);
    },

    async isCustomer(customerId, session) {
      return Types.ObjectId.isValid(customerId)
        && Boolean(await users.findOne({ _id: id(customerId), roles: ['CUSTOMER'] }, { session, projection: { _id: 1 } }));
    },

    readTiers: (ids, session) => tiers.find({ _id: { $in: ids.map(id) } },
      { session, maxTimeMS: QUERY_MS, projection: { tier: 1 } }).toArray(),

    readReceipts: (ids, { from, asOf }, session) => boundedRows(col('bookings').aggregate([
      { $match: { customerId: { $in: ids }, paymentMode: 'PREPAY' } },
      { $lookup: { from: 'payments', localField: '_id', foreignField: 'bookingId', as: 'receipt', pipeline: [
        { $match: { state: 'VERIFIED', $or: [{ verifiedAt: { $gte: from, $lt: asOf } }, { verifiedAt: { $not: { $type: 'date' } } }] } },
        { $project: { receiptMoney: 1, verifiedAt: 1 } }
      ] } },
      { $unwind: '$receipt' },
      { $limit: MAX_SPEND_ROWS + 1 },
      { $project: { _id: 0, customerId: 1, recordedAt: '$receipt.verifiedAt',
        amountVnd: { $cond: [{ $eq: ['$receipt.receiptMoney.currency', 'VND'] }, '$receipt.receiptMoney.amountVnd', null] } } }
    ], { session, maxTimeMS: QUERY_MS })),

    readOrders: (ids, session) => boundedRows(col('productorders').find({
      customerId: { $in: ids }, paid: true, status: { $nin: EXCLUDED_ORDER_STATES }
    }, { session, maxTimeMS: QUERY_MS, limit: MAX_SPEND_ROWS + 1,
      projection: { customerId: 1, paymentMethod: 1, status: 1, total: 1, deliveredAt: 1, createdAt: 1, 'cashPayment.receivedAt': 1 } })),

    beginRun: (run, lease, now) => fenced(lease, now, session => runs.insertOne({ ...run, status: 'COLLECTING' }, { session })),
    stage: (rows, lease, now) => fenced(lease, now, session => results.insertMany(rows, { session })),
    markReady: (run, lease, now) => fenced(lease, now, session => runs.updateOne({ _id: run._id, status: 'COLLECTING' },
      { $set: { status: 'READY', customers: run.customers, held: run.held, expiresAt: run.expiresAt } }, { session })),
    markFailed: (day, phase, lease, now) => fenced(lease, now, session => runs.updateOne({ _id: day, status: 'COLLECTING' },
      { $set: { status: 'FAILED', failedPhase: phase } }, { session })),

    async assertResults(run) {
      if (run.expiresAt <= new Date(Date.now() + LEASE_MS)
        || await results.countDocuments({ runId: run._id }, { maxTimeMS: QUERY_MS }) !== run.customers) {
        throw new Error('Customer tier results expired or are incomplete');
      }
    },

    listResults: (day, after, limit) => results.find({ runId: day, ...(after ? { customerId: { $gt: after } } : {}) },
      { maxTimeMS: QUERY_MS }).sort({ customerId: 1 }).limit(limit).toArray(),

    applyResults: (run, rows, lease, now) => fenced(lease, now, async session => {
      const policy = await policies.findOne({ _id: 'current' }, { session });
      if (!isApprovedCustomerTierPolicy(policy) || policy.version !== run.policyVersion)
        throw new AppError(503, 'CUSTOMER_TIER_POLICY_UNAPPROVED', 'Staged results require the same approved policy');
      const guarded = await policies.updateOne({ _id: 'current', version: run.policyVersion, state: 'APPROVED' },
        { $inc: { guardVersion: 1 } }, { session });
      if (guarded.matchedCount !== 1) throw new Error('Customer tier policy changed');
      const ids = rows.filter(row => !row.held).map(row => row.customerId);
      const currentCustomers = new Set((await users.find({ _id: { $in: ids }, roles: ['CUSTOMER'] },
        { session, projection: { _id: 1 } }).toArray()).map(row => String(row._id)));
      const currentTiers = new Map((await tiers.find({ _id: { $in: ids } }, { session }).toArray()).map(row => [String(row._id), row]));
      const eligible = rows.filter(row => !row.held && currentCustomers.has(String(row.customerId))
        && !(currentTiers.get(String(row.customerId))?.asOf > run.asOf));
      const writes = eligible.filter(row => currentTiers.get(String(row.customerId))?.asOf?.getTime() !== run.asOf.getTime())
        .map(row => ({ updateOne: { filter: { _id: row.customerId }, upsert: true,
          update: { $set: { tier: row.tier, asOf: run.asOf, policyVersion: run.policyVersion } } } }));
      if (writes.length) await tiers.bulkWrite(writes, { session });
      return eligible.length;
    }),

    complete: (day, summary, lease, now) => fenced(lease, now, session => runs.updateOne({ _id: day, status: 'READY' },
      { $set: { status: 'COMPLETED', summary }, $unset: { expiresAt: '' } }, { session }))
  });
}
