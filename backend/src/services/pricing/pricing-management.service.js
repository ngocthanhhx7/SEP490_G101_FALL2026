import {
  exact,
  fail,
  id,
  instant,
  number
} from '../../validators/pet-care.validator.js';
import { validatePricingPolicy } from '../pricing/pricing-calculation.service.js';

const text = (value, max = 100) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    fail('VALIDATION_FAILED', 'Invalid text');
  return value.trim();
};

export function createPricingManagement({ repository, clock = Date.now }) {
  const { models } = repository;
  return {
    async pricing(actor, body) {
      exact(
        body,
        [
          'serviceId',
          'version',
          'status',
          'effectiveAt',
          'reason',
          'billingMode',
          'groupStrategy',
          'comboPerVisitBps',
          'comboMaxBps',
          'unitMinutes',
          'maxPets',
          'extraPetBps',
          'maxSurchargeBps',
          'orderStepVnd',
          'orderStepBps',
          'maxOrderTierBps',
          'rules'
        ],
        [
          'serviceId',
          'version',
          'status',
          'effectiveAt',
          'reason',
          'billingMode',
          'unitMinutes',
          'maxPets',
          'extraPetBps',
          'maxSurchargeBps',
          'orderStepVnd',
          'orderStepBps',
          'maxOrderTierBps',
          'rules'
        ]
      );
      id(body.serviceId);
      number(body.version, 1, 1000000, true);
      instant(body.effectiveAt);
      text(body.reason, 2000);
      if (!['DRAFT', 'APPROVED'].includes(body.status))
        fail('VALIDATION_FAILED', 'Invalid policy status');
      validatePricingPolicy(body);
      const doc = await models.PricingPolicy.create({
        ...body,
        approvedBy: body.status === 'APPROVED' ? actor.userId : null,
        approvedAt: body.status === 'APPROVED' ? new Date(clock()) : null
      });
      return { id: String(doc._id), version: doc.version, status: doc.status };
    }
  };
}
