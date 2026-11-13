import { Types } from 'mongoose';
import { productSalesModels } from '../../models/product.model.js';
import { GROOMING_DEFAULT_REFUSAL_LIMIT } from '../../constants/grooming.js';

const maxTimeMS = 2000;

function parseRefusalLimit(value) {
  if (value === undefined || value === '') return GROOMING_DEFAULT_REFUSAL_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new TypeError('PRODUCT_REFUSAL_LIMIT must be a non-negative safe integer');
  }
  return Number(value);
}

// GBR-42: a customer with an overdue bill, or who may only pay in advance, keeps the tier but gets no tier discount.
// This copies the rule of the product checkout (PR #358: createProductPricingEligibility). Replace this file with that
// module once it is merged. It only reads: overdue state and refusals are created elsewhere.
export function createGroomingDiscountHold({ connection, refusalLimit }) {
  const limit = parseRefusalLimit(refusalLimit);
  const { ProductCustomerRefusal } = productSalesModels(connection);
  return {
    // Resolves to 'PREPAID_ONLY', 'OVERDUE' or null.
    async read(customerId) {
      const id = new Types.ObjectId(String(customerId));
      const countOptions = { maxTimeMS, ...(limit < Number.MAX_SAFE_INTEGER ? { limit: limit + 1 } : {}) };
      if (await ProductCustomerRefusal.collection.countDocuments({ customerId: id }, countOptions) > limit) return 'PREPAID_ONLY';
      const overdue = await connection.db.collection('bookings').findOne({
        customerId: id, $or: [{ paymentState: 'OVERDUE' }, { state: 'OVERDUE', paymentState: { $ne: 'PAID' } }]
      }, { maxTimeMS, projection: { _id: 1 } });
      return overdue ? 'OVERDUE' : null;
    }
  };
}
