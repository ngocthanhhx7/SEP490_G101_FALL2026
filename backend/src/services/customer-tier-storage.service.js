import { INITIAL_CUSTOMER_TIER_POLICY } from '../config/customer-tier-policy.js';
import { CUSTOMER_TIER_COLLECTIONS, CUSTOMER_TIER_LEASE_ID } from '../models/customer-tier.model.js';

export async function provisionCustomerTierStorage(connection) {
  const db = connection.db;
  for (const name of Object.values(CUSTOMER_TIER_COLLECTIONS)) {
    if (!(await db.listCollections({ name }, { nameOnly: true }).hasNext())) await db.createCollection(name);
  }
  const results = db.collection(CUSTOMER_TIER_COLLECTIONS.results);
  await results.createIndex({ runId: 1, customerId: 1 }, { unique: true, name: 'customer_tier_run_customer' });
  await results.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'customer_tier_result_expiry' });
  await db.collection(CUSTOMER_TIER_COLLECTIONS.policies).updateOne({ _id: 'current' },
    { $setOnInsert: INITIAL_CUSTOMER_TIER_POLICY }, { upsert: true });
  await db.collection(CUSTOMER_TIER_COLLECTIONS.runs).updateOne({ _id: CUSTOMER_TIER_LEASE_ID },
    { $setOnInsert: { token: null, fence: 0, expiresAt: new Date(0) } }, { upsert: true });
}
