import { Types } from 'mongoose';
import { isApprovedCustomerTierPolicy } from '../../config/customer-tier-policy.js';
import { CUSTOMER_TIERS, CUSTOMER_TIER_COLLECTIONS } from '../../models/customer-tier.model.js';
import { identityModels } from '../../models/identity.model.js';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';

const DEFAULT_REFUSAL_LIMIT = 2;
const maxTimeMS = 2000;
const guest = Object.freeze({ tierCode: null, tierPolicyVersion: null, discountBps: 0, prepaidOnly: false });

function parseRefusalLimit(value) {
  if (value === undefined) return DEFAULT_REFUSAL_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new TypeError('PRODUCT_REFUSAL_LIMIT must be a non-negative safe integer');
  }
  return Number(value);
}

function readApprovedRate(policy, tierCode) {
  if (!isApprovedCustomerTierPolicy(policy)) return { tierPolicyVersion: null, discountBps: 0 };
  const { version, discountsBps } = policy;
  if (!Number.isSafeInteger(version) || version < 1 || CUSTOMER_TIERS.some(tier => {
    const rate = discountsBps?.[tier];
    return !Number.isSafeInteger(rate) || rate < 0 || rate > 10000;
  })) {
    throw new AppError(503, 'PRODUCT_TIER_POLICY_INVALID', 'The approved product tier policy is invalid');
  }
  return { tierPolicyVersion: version, discountBps: discountsBps[tierCode] };
}

export function createProductPricingEligibility({ connection, refusalLimit = process.env.PRODUCT_REFUSAL_LIMIT }) {
  const limit = parseRefusalLimit(refusalLimit);
  const { ProductCustomerRefusal } = productSalesModels(connection);
  const { Contact } = identityModels(connection);
  const User = userModel(connection);

  async function requiresPrepayment(customerId, { session } = {}) {
    const options = { session, maxTimeMS };
    const countOptions = limit < Number.MAX_SAFE_INTEGER ? { ...options, limit: limit + 1 } : options;
    const refusals = await ProductCustomerRefusal.collection.countDocuments({ customerId: new Types.ObjectId(customerId) }, countOptions);
    return refusals > limit;
  }

  async function read(customerId, { session } = {}) {
    if (!customerId) return guest;
    const id = new Types.ObjectId(customerId);
    const db = connection.db;
    const options = { session, maxTimeMS };
    const tier = await db.collection(CUSTOMER_TIER_COLLECTIONS.tiers)
      .findOne({ _id: id }, { ...options, projection: { tier: 1 } });
    const tierCode = tier?.tier ?? 'MEMBER';
    if (!CUSTOMER_TIERS.includes(tierCode)) {
      throw new AppError(503, 'PRODUCT_TIER_INVALID', 'The stored customer tier is invalid');
    }
    const policy = await db.collection(CUSTOMER_TIER_COLLECTIONS.policies).findOne({ _id: 'current' }, options);
    const rate = readApprovedRate(policy, tierCode);
    const prepaidOnly = await requiresPrepayment(id, { session });
    const overdue = rate.discountBps > 0 && !prepaidOnly && await db.collection('bookings').findOne({
      customerId: id,
      $or: [{ paymentState: 'OVERDUE' }, { state: 'OVERDUE', paymentState: { $ne: 'PAID' } }]
    }, { ...options, projection: { _id: 1 } });
    return { tierCode, ...rate, discountBps: prepaidOnly || overdue ? 0 : rate.discountBps, prepaidOnly };
  }

  return Object.freeze({
    read,
    requiresPrepayment,
    async readCounterCustomer(customerId) {
      if (!customerId) return guest;
      const customer = await User.exists({ _id: customerId, state: 'ACTIVE', roles: 'CUSTOMER' }).maxTimeMS(maxTimeMS);
      const verified = customer && await Contact.exists({
        userId: customerId, state: 'VERIFIED', channel: { $in: ['PHONE', 'EMAIL'] }
      }).maxTimeMS(maxTimeMS);
      if (!verified) throw new AppError(422, 'COUNTER_CUSTOMER_UNAVAILABLE', 'The selected customer is no longer available');
      return read(customerId);
    }
  });
}
