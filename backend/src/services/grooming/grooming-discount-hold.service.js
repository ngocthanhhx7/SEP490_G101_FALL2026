import { createProductPricingEligibility } from '../product-sales/product-pricing-eligibility.service.js';

// Compatibility entry point; the approved common checkout eligibility owns the rule.
export function createGroomingDiscountHold({ connection, refusalLimit }) {
  const eligibility = createProductPricingEligibility({ connection, refusalLimit: refusalLimit === '' ? undefined : refusalLimit });
  return { read: (customerId, options) => eligibility.readDiscountHold(customerId, options) };
}
