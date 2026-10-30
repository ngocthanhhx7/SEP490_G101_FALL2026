import { pricingModels } from '../../models/pricing.model.js';
import { leashHandlingPriceRule } from '../../constants/leash-handling-price-rule.js';
import { validatePricingPolicy } from './pricing-calculation.service.js';
import { fail } from '../../validators/pet-care.validator.js';

export const leashHandlingDecision = 'OWNER_LEASH_HANDLING_2026_10_30_V1';

export async function applyLeashHandlingDecision({ connection, apply = false, clock = Date.now }) {
  const { PricingPolicy } = pricingModels(connection), now = new Date(clock());
  const execute = async session => {
    const serviceIds = await PricingPolicy.distinct('serviceId').session(session);
    if (serviceIds.length > 100) fail('PRICING_REVIEW_REQUIRED', 'Review large policy populations before migration', 409);
    let changed = 0, skipped = 0;
    for (const serviceId of serviceIds) {
      const previous = await PricingPolicy.findOne({ serviceId }).sort({ version: -1 }).session(session).lean();
      if (previous.status !== 'APPROVED' || previous.effectiveAt > now || previous.approvedAt > now
        || !previous.approvedAt || (!previous.approvedBy && !previous.approvalSource))
        fail('PRICING_REVIEW_REQUIRED', 'Latest policy must be effective and approved before migration', 409);
      const existing = previous.rules.filter(rule => rule.when?.traitCode === leashHandlingPriceRule.code);
      if (existing.length) {
        if (existing.some(rule => rule.bps !== 0 || rule.flatVnd !== 0))
          fail('PRICING_REVIEW_REQUIRED', 'Existing leash handling fee requires explicit reconciliation', 409);
        skipped++; continue;
      }
      const next = Object.fromEntries(Object.entries(previous).filter(([key]) => !['_id', 'createdAt', 'updatedAt', 'approvedBy'].includes(key)));
      Object.assign(next, { version: previous.version + 1, effectiveAt: now, approvedAt: now,
        approvalSource: leashHandlingDecision,
        reason: `Owner decision: leash handling is a capability requirement with no additional fee; preserves policy version ${previous.version}.`,
        rules: [...previous.rules, { ...leashHandlingPriceRule, when: { ...leashHandlingPriceRule.when } }] });
      validatePricingPolicy(next);
      if (apply) await PricingPolicy.create([next], { session });
      changed++;
    }
    return { state: apply ? 'APPLIED' : 'DRY_RUN', decision: leashHandlingDecision, changed, skipped };
  };
  if (!apply) return execute(null);
  return connection.transaction(execute, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
}
