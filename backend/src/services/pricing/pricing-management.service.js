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
    async readCombo(serviceId) {
      id(serviceId);
      const rows = await models.PricingPolicy.find({ serviceId }).sort({ version: -1 }).limit(50).lean();
      if (!rows.length) fail('PRICING_POLICY_UNAVAILABLE', 'Approve pricing policy first', 409);
      return { latestVersion: rows[0].version, policies: rows.map(row => ({ version: row.version, status: row.status,
        effectiveAt: row.effectiveAt.toISOString(), comboPerVisitBps: row.comboPerVisitBps ?? 0,
        comboMaxBps: row.comboMaxBps ?? 0, reason: row.reason })) };
    },
    async updateCombo(actor, serviceId, body) {
      id(serviceId);
      exact(body, ['expectedVersion', 'effectiveAt', 'reason', 'comboPerVisitBps', 'comboMaxBps'],
        ['expectedVersion', 'effectiveAt', 'reason', 'comboPerVisitBps', 'comboMaxBps']);
      number(body.expectedVersion, 1, 1000000, true); instant(body.effectiveAt); text(body.reason, 2000);
      number(body.comboPerVisitBps, 0, 1000, true); number(body.comboMaxBps, 0, 1000, true);
      if (body.comboPerVisitBps > body.comboMaxBps) fail('VALIDATION_FAILED', 'Discount per visit exceeds maximum');
      return repository.connection.transaction(async session => {
        const previous = await models.PricingPolicy.findOne({ serviceId }).sort({ version: -1 }).session(session).lean();
        if (!previous || previous.version !== body.expectedVersion) fail('VERSION_CONFLICT', 'Reload pricing policy', 409);
        if (previous.status !== 'APPROVED' || (!previous.approvedBy && !previous.approvalSource)) {
          fail('PRICING_POLICY_UNAVAILABLE', 'Latest policy requires approval', 409);
        }
        const policy = Object.fromEntries(Object.entries(previous).filter(([key]) => !['_id', 'createdAt', 'updatedAt', 'approvalSource'].includes(key)));
        const next = { ...policy, version: previous.version + 1, effectiveAt: new Date(body.effectiveAt),
          reason: body.reason.trim(), comboPerVisitBps: body.comboPerVisitBps, comboMaxBps: body.comboMaxBps,
          approvedBy: actor.userId, approvedAt: new Date(clock()) };
        validatePricingPolicy(next);
        await models.PricingPolicy.create([next], { session });
        return { serviceId, version: next.version };
      }).catch(error => {
        if (error.code === 11000) fail('VERSION_CONFLICT', 'Reload pricing policy', 409);
        throw error;
      });
    },
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
