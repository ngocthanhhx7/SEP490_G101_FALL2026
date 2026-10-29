import {
  id,
  fail,
  digest,
  exact
} from '../../validators/pet-care.validator.js';
import { validatePricingSelection } from '../../validators/pricing-selection.validator.js';
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
  async function calculate(ownerId, body, deferOrderAdjustments = false) {
    const input = validatePricingSelection(body),
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
      visitCount: input.visitCount,
      dayCount: input.dayCount,
      distanceMeters: input.distanceMeters,
      deferOrderAdjustments
    });
    return { input, context, result };
  }
  async function quote(ownerId, body) {
    const { input, context, result } = await calculate(ownerId, body);
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
  async function basket(ownerId, body) {
    exact(body, ['items'], ['items']);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 20)
      fail('VALIDATION_FAILED', 'One to twenty service items required');
    const computed = [];
    for (const item of body.items) computed.push(await calculate(ownerId, item, true));
    const policies = computed.map(item => item.context.policy), policy = policies[0];
    const common = ['comboPerVisitBps', 'comboMaxBps', 'orderStepVnd', 'orderStepBps', 'maxOrderTierBps'];
    if (policies.some(p => common.some(key => (p[key] ?? 0) !== (policy[key] ?? 0))))
      fail('PRICING_REVIEW_REQUIRED', 'Incompatible basket policies', 409);
    const visits = computed.reduce((sum, item) => sum + item.input.visitCount, 0);
    if (visits > 60) fail('VALIDATION_FAILED', 'Basket supports at most sixty visits');
    const safe = n => { if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) fail('PRICE_OVERFLOW', 'Unsupported basket total'); return Number(n); };
    const fee = (base, bps) => safe((BigInt(base) * BigInt(bps) + 5000n) / 10000n);
    const base = safe(computed.reduce((sum, item) => sum + BigInt(item.result.lines[0].amountVnd), 0n));
    const gross = safe(computed.reduce((sum, item) => sum + BigInt(item.result.subtotalVnd), 0n));
    const comboBps = Math.min(visits * (policy.comboPerVisitBps ?? 0), policy.comboMaxBps ?? 0);
    const discountVnd = fee(base, comboBps), subtotalVnd = gross - discountVnd;
    const tierBps = Math.floor(subtotalVnd / policy.orderStepVnd) * policy.orderStepBps;
    if (tierBps > policy.maxOrderTierBps) fail('ORDER_TIER_REVIEW_REQUIRED', 'Basket requires review', 409);
    const orderFeeVnd = fee(subtotalVnd, tierBps);
    const result = { currency: 'VND', kind: 'ESTIMATE', baseVnd: base, surchargeVnd: gross - base, discountVnd, comboBps,
      subtotalVnd, orderFeeVnd, totalVnd: safe(BigInt(subtotalVnd) + BigInt(orderFeeVnd)), visitCount: visits,
      paymentMode: visits > 1 || computed.some(item => item.input.dayCount > 1) ? 'PREPAY' : 'POSTPAY', rounding: 'HALF_UP_VND_PER_LINE',
      items: computed.map(({ input, result, context }) => ({ serviceId: input.serviceId, ...result,
        serviceVersion: context.version.version, servicePolicyVersion: context.servicePolicy.version,
        servicePolicy: { title: context.servicePolicy.title, body: context.servicePolicy.body },
        petVersions: context.pets.map(p => ({ id: String(p._id), version: p.version })) })) };
    const decision = await save(ownerId, 'QUOTE', body, { input: body, result }, 10 * 60000);
    return { ...result, quoteId: decision.id, expiresAt: decision.expiresAt };
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

  return { quote, basket, readDecision };
}
