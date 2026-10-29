import {
  id,
  fail,
  digest,
  validatePetCareSelection
} from '../../validators/pet-care.validator.js';
import { calculateQuote } from './pricing-calculation.service.js';
export function createPricingService({ repository, clock = Date.now }) {
  async function save(ownerId, kind, input, snapshot, ttl) {
    const [decision] = await repository.models.DecisionSnapshot.create([
      {
        ownerId,
        kind,
        requestHash: digest(input),
        expiresAt: new Date(clock() + ttl),
        snapshot
      }
    ]);
    return {
      id: String(decision._id),
      expiresAt: decision.expiresAt.toISOString()
    };
  }
  async function quote(ownerId, body) {
    const input = validatePetCareSelection(body),
      context = await repository.context(ownerId, input);
    if (
      context.pets.some(
        (p) =>
          p.traits.length &&
          !p.traits.every((t) =>
            context.policy.rules.some((rule) => rule.when?.traitCode === t)
          )
      )
    )
      fail(
        'PRICING_REVIEW_REQUIRED',
        'Special-care trait has no approved price rule',
        409
      );
    const result = calculateQuote({
      baseAmountVnd: context.price.amountVnd,
      priceVersion: context.price.version,
      policy: context.policy,
      pets: context.pets,
      durationMinutes: input.durationMinutes,
      visitCount: input.visitCount
    });
    const decision = await save(
      ownerId,
      'QUOTE',
      input,
      {
        input,
        result,
        petVersions: context.pets.map((p) => ({
          id: p._id,
          version: p.version
        })),
        serviceVersion: context.version.version
      },
      10 * 60000
    );
    return {
      ...result,
      quoteId: decision.id,
      expiresAt: decision.expiresAt,
      explanation:
        'Báo giá dự kiến theo bảng giá đã duyệt; chưa tạo booking, chưa thu tiền. Cần xác nhận lại phiên bản và điều kiện khi đặt lịch.'
    };
  }
  async function readDecision(ownerId, decisionId) {
    id(decisionId);
    const record = await repository.models.DecisionSnapshot.findOne({
      _id: decisionId,
      kind: 'QUOTE',
      ownerId,
      expiresAt: { $gt: new Date(clock()) }
    })
      .select('+snapshot')
      .lean();
    if (!record)
      fail('RESOURCE_NOT_FOUND', 'Decision unavailable or expired', 404);
    return {
      id: String(record._id),
      kind: record.kind,
      expiresAt: record.expiresAt,
      ...record.snapshot.result
    };
  }

  return { quote, readDecision };
}
