import { createHash } from 'node:crypto';
import { pricingModels } from '../../models/pricing.model.js';
import { careTraitPriceRules, careTraitPricingDecision } from '../../constants/care-trait-price-rules.js';
import { validatePricingPolicy } from './pricing-calculation.service.js';
import { AppError } from '../../utils/app-error.js';

const review = message => { throw new AppError(409, 'PRICING_REVIEW_REQUIRED', message); };
// Explicit additive migration only. Existing prices, policy versions and quote/booking snapshots are immutable.
export async function applyCareTraitDecision({ connection, apply = false, expectedPlanHash, clock = Date.now }) {
  const { PricingPolicy } = pricingModels(connection), now = new Date(clock());
  if (apply && !/^[a-f0-9]{64}$/.test(expectedPlanHash ?? '')) review('A reviewed dry-run plan hash is required');
  async function execute(session) {
    const serviceIds = (await PricingPolicy.distinct('serviceId').session(session)).sort((a,b) => String(a).localeCompare(String(b)));
    if (!serviceIds.length || serviceIds.length > 100) review('Review the pricing population before migration');
    const source = [], updates = [], records = []; let skipped = 0;
    for (const serviceId of serviceIds) {
      const previous = await PricingPolicy.findOne({ serviceId }).sort({ version: -1 }).session(session).lean();
      if (previous.status !== 'APPROVED' || !previous.approvedAt || previous.approvedAt > now || previous.effectiveAt > now
        || (!previous.approvedBy && !previous.approvalSource)) review('Latest policy must be effective and approved');
      source.push(previous);
      const missing = [];
      for (const rule of careTraitPriceRules) {
        const existing = previous.rules.filter(r => r.when?.traitCode === rule.code);
        if (!existing.length) { missing.push(rule); continue; }
        if (existing.length !== 1 || existing[0].bps !== 0 || existing[0].flatVnd !== 0 || existing[0].scope !== 'PET'
          || Object.keys(existing[0].when).some(key => key !== 'traitCode')) review('Existing care-trait pricing needs explicit reconciliation');
      }
      if (!missing.length) { skipped++; continue; }
      const next = Object.fromEntries(Object.entries(previous).filter(([key]) => !['_id','createdAt','updatedAt','approvedBy'].includes(key)));
      Object.assign(next, { version: previous.version + 1, effectiveAt: now, approvedAt: now, approvalSource: careTraitPricingDecision,
        reason: `Owner decision 2026-11-05: capability traits have no surcharge; play stays within selected billed duration. Preserves policy version ${previous.version}.`,
        rules: [...previous.rules, ...missing.map(rule => ({ ...rule, when: { ...rule.when } }))] });
      validatePricingPolicy(next); records.push(next);
      updates.push({ serviceId: String(serviceId), fromVersion: previous.version, toVersion: next.version, added: missing.map(r => r.code) });
    }
    const planHash = createHash('sha256').update(JSON.stringify(source)).digest('hex');
    if (apply && planHash !== expectedPlanHash) review('Pricing changed since dry-run; review a fresh plan');
    if (apply && records.length) await PricingPolicy.create(records, { session, ordered: true });
    return { state: apply ? 'APPLIED' : 'DRY_RUN', decision: careTraitPricingDecision, planHash, changed: records.length, skipped, updates };
  }
  return apply ? connection.transaction(execute, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }) : execute(null);
}
