// Temporary values for JOB-05 while the team surveys spending and discounts.
export const INITIAL_CUSTOMER_TIER_POLICY = Object.freeze({
  version: 1,
  thresholds: Object.freeze({ MEMBER: 0, SILVER: 2_000_000, GOLD: 5_000_000 }),
  discountsBps: Object.freeze({ MEMBER: 0, SILVER: 300, GOLD: 500 })
});
