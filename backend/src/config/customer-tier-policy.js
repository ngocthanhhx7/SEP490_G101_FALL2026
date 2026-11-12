// Unapproved sample for JOB-05; provisioning must never activate these values.
export const INITIAL_CUSTOMER_TIER_POLICY = Object.freeze({
  version: 1,
  state: 'DRAFT',
  thresholds: Object.freeze({ MEMBER: 0, SILVER: 2_000_000, GOLD: 5_000_000 }),
  discountsBps: Object.freeze({ MEMBER: 0, SILVER: 300, GOLD: 500 })
});

export function isApprovedCustomerTierPolicy(policy) {
  return policy?.state === 'APPROVED'
    && policy.approvedAt instanceof Date && Number.isFinite(policy.approvedAt.getTime())
    && typeof policy.approvedBy === 'string' && policy.approvedBy.trim().length > 0
    && typeof policy.approvalReference === 'string' && policy.approvalReference.trim().length > 0;
}
