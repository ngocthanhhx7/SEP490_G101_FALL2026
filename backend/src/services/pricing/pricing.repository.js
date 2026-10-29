import { createPetCareContext } from '../pet-care-context.service.js';
import { pricingModels } from '../../models/pricing.model.js';
import { petCareModels } from '../../models/pet-care.model.js';
import { decisionSnapshotModels } from '../../models/decision-snapshot.model.js';
import { servicePriceVersionModel } from '../../models/service-price-version.model.js';
import { fail } from '../../validators/pet-care.validator.js';
export function createPricingRepository(connection, clock = Date.now) {
  const models = {
      ...pricingModels(connection),
      ...petCareModels(connection),
      ...decisionSnapshotModels(connection)
    },
    Price = servicePriceVersionModel(connection),
    context = createPetCareContext(connection, clock);
  return {
    models,
    connection,
    async context(ownerId, input) {
      const base = await context.context(ownerId, input),
        now = new Date(clock());
      const [price, policy] = await Promise.all([
        Price.findOne({
          serviceId: base.service._id,
          effectiveAt: { $lte: now }
        })
          .sort({ effectiveAt: -1, version: -1 })
          .lean(),
        models.PricingPolicy.findOne({
          serviceId: base.service._id,
          status: 'APPROVED',
          approvedAt: { $lte: now, $ne: null },
          effectiveAt: { $lte: now }
        })
          .sort({ version: -1 })
          .lean()
      ]);
      if (!price) fail('SERVICE_UNAVAILABLE', 'Service price unavailable', 409);
      if (!policy || (!policy.approvedBy && !policy.approvalSource))
        fail('PRICING_POLICY_UNAVAILABLE', 'Approve pricing policy first', 409);
      return { ...base, price, policy };
    }
  };
}
