import { exact, fail, number } from '../../validators/pet-care.validator.js';
export function validatePricingPolicy(policy) {
  if (
    policy.billingMode !== undefined &&
    !['PER_UNIT', 'PER_VISIT', 'PER_DAY', 'PER_KM'].includes(policy.billingMode)
  )
    fail('VALIDATION_FAILED', 'Invalid billing mode');
  number(policy.unitMinutes, 1, 1440, true);
  number(policy.maxPets, 1, 10, true);
  number(policy.extraPetBps, 0, 20000, true);
  number(policy.maxSurchargeBps, 0, 50000, true);
  number(policy.orderStepVnd, 1, Number.MAX_SAFE_INTEGER, true);
  number(policy.orderStepBps, 0, 10000, true);
  number(policy.maxOrderTierBps, 0, 50000, true);
  if (policy.groupStrategy !== undefined && !['REJECT', 'MAX'].includes(policy.groupStrategy))
    fail('VALIDATION_FAILED', 'Invalid group strategy');
  number(policy.comboPerVisitBps ?? 0, 0, 1000, true);
  number(policy.comboMaxBps ?? 0, 0, 1000, true);
  if (
    !Array.isArray(policy.rules) ||
    policy.rules.length > 50 ||
    new Set(policy.rules.map((r) => r.code)).size !== policy.rules.length
  )
    fail('VALIDATION_FAILED', 'Rules must have unique codes');
  for (const rule of policy.rules) {
    exact(
      rule,
      [
        'code',
        'label',
        'explanation',
        'scope',
        'bps',
        'flatVnd',
        'exclusiveGroup',
        'when'
      ],
      ['code', 'label', 'explanation', 'scope', 'bps', 'flatVnd', 'when']
    );
    for (const key of ['code', 'label', 'explanation'])
      if (
        typeof rule[key] !== 'string' ||
        !rule[key].trim() ||
        rule[key].length > 1000
      )
        fail('VALIDATION_FAILED', 'Rule explanation required');
    if (!['PET', 'VISIT'].includes(rule.scope))
      fail('VALIDATION_FAILED', 'Invalid scope');
    number(rule.bps, 0, 20000, true);
    number(rule.flatVnd, 0, Number.MAX_SAFE_INTEGER, true);
    exact(rule.when, [
      'species',
      'breedCodes',
      'traitCode',
      'minWeightKg',
      'maxWeightKg',
      'minWeightExclusive',
      'maxWeightInclusive'
    ]);
    if (rule.when.species && !['DOG', 'CAT'].includes(rule.when.species))
      fail('VALIDATION_FAILED', 'Invalid species');
    if (
      rule.when.breedCodes &&
      (!Array.isArray(rule.when.breedCodes) ||
        !rule.when.breedCodes.length ||
        rule.when.breedCodes.length > 100 ||
        rule.when.breedCodes.some(
          (x) => typeof x !== 'string' || x.length > 80
        ))
    )
      fail('VALIDATION_FAILED', 'Invalid breed filter');
    if (
      rule.when.traitCode &&
      (typeof rule.when.traitCode !== 'string' ||
        rule.when.traitCode.length > 80)
    )
      fail('VALIDATION_FAILED', 'Invalid trait');
    if (rule.when.minWeightKg !== undefined)
      number(rule.when.minWeightKg, 0, 150);
    if (rule.when.maxWeightKg !== undefined)
      number(rule.when.maxWeightKg, 0, 150);
    for (const key of ['minWeightExclusive', 'maxWeightInclusive'])
      if (rule.when[key] !== undefined && typeof rule.when[key] !== 'boolean')
        fail('VALIDATION_FAILED', 'Invalid weight boundary');
    if (
      rule.when.minWeightKg !== undefined &&
      rule.when.maxWeightKg !== undefined &&
      rule.when.maxWeightKg <= rule.when.minWeightKg
    )
      fail('VALIDATION_FAILED', 'Invalid weight interval');
  }
  return policy;
}
const safe = (value) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    fail('PRICE_OVERFLOW', 'Price exceeds supported range');
  return Number(value);
};
const fee = (base, bps) => safe((BigInt(base) * BigInt(bps) + 5000n) / 10000n);
function matches(pet, when) {
  return (
    (!when.species || pet.species === when.species) &&
    (!when.breedCodes?.length || when.breedCodes.includes(pet.breedCode)) &&
    (!when.traitCode || pet.traits.includes(when.traitCode)) &&
    (when.minWeightKg === undefined || (when.minWeightExclusive ? pet.weightKg > when.minWeightKg : pet.weightKg >= when.minWeightKg)) &&
    (when.maxWeightKg === undefined || (when.maxWeightInclusive ? pet.weightKg <= when.maxWeightKg : pet.weightKg < when.maxWeightKg))
  );
}
export function calculateQuote({
  baseAmountVnd,
  priceVersion,
  policy,
  pets,
  durationMinutes,
  visitCount = 1,
  dayCount,
  distanceMeters,
  deferOrderAdjustments = false
}) {
  validatePricingPolicy(policy);
  number(baseAmountVnd, 1, Number.MAX_SAFE_INTEGER, true);
  number(durationMinutes, 1, 1440, true);
  number(visitCount, 1, 60, true);
  if (policy.billingMode === 'PER_DAY') number(dayCount, 1, 60, true);
  else if (dayCount !== undefined) fail('VALIDATION_FAILED', 'Days only apply to daily services');
  if (policy.billingMode === 'PER_KM') number(distanceMeters, 1, 1000000, true);
  else if (distanceMeters !== undefined) fail('VALIDATION_FAILED', 'Distance only applies to transport');
  if (!Array.isArray(pets) || !pets.length || pets.length > policy.maxPets)
    fail('PET_LIMIT', 'Unsupported pet count');
  const units =
    policy.billingMode === 'PER_DAY' ? dayCount : policy.billingMode === 'PER_KM' ? distanceMeters : policy.billingMode === 'PER_VISIT'
      ? 1
      : Math.ceil(durationMinutes / policy.unitMinutes);
  const visitBase = safe(policy.billingMode === 'PER_KM'
    ? (BigInt(baseAmountVnd) * BigInt(distanceMeters) + 500n) / 1000n
    : BigInt(baseAmountVnd) * BigInt(units));
  const base = safe(BigInt(visitBase) * BigInt(visitCount));
  const lines = [
    {
      code: 'BASE',
      amountVnd: base,
      basisVnd: base,
      explanation: policy.billingMode === 'PER_KM' ? `${visitCount} lượt × ${distanceMeters} mét × ${baseAmountVnd} VND/km.`
        : policy.billingMode === 'PER_DAY' ? `${visitCount} lượt × ${dayCount} ngày × ${baseAmountVnd} VND/ngày.`
        : policy.billingMode === 'PER_VISIT' ? `${visitCount} lượt × ${baseAmountVnd} VND/lượt.`
        : `${visitCount} lượt × ${units} đơn vị thời lượng × ${baseAmountVnd} VND; làm tròn lên theo đơn vị ${policy.unitMinutes} phút.`
    }
  ];
  const extraBps = policy.extraPetBps * (pets.length - 1);
  if (extraBps)
    lines.push({
      code: 'ADDITIONAL_PETS',
      bps: extraBps,
      basisVnd: base,
      amountVnd: fee(base, extraBps),
      explanation: 'Công chăm sóc pet bổ sung theo chính sách dịch vụ.'
    });
  let totalBps = extraBps;
  const groups = new Map(), candidates = [];
  for (const rule of policy.rules) {
    const matching = pets.filter((p) => matches(p, rule.when));
    const targets =
      rule.scope === 'VISIT'
        ? matching.length
          ? [{ _id: 'VISIT' }]
          : []
        : matching;
    for (const pet of targets) {
      const group = rule.exclusiveGroup && `${pet._id}:${rule.exclusiveGroup}`;
      if (group && groups.has(group) && policy.groupStrategy !== 'MAX')
        fail(
          'PRICING_RULE_CONFLICT',
          'Overlapping exclusive surcharge rules',
          409
        );
      const fixed = safe(BigInt(rule.flatVnd) * BigInt(visitCount));
      const line = {
        code: rule.code,
        petId: rule.scope === 'PET' ? String(pet._id) : undefined,
        label: rule.label,
        bps: rule.bps,
        basisVnd: base,
        amountVnd: safe(BigInt(fee(base, rule.bps)) + BigInt(fixed)),
        explanation: rule.explanation
      };
      if (group) {
        const prior = groups.get(group);
        if (!prior || line.amountVnd > prior.amountVnd || (line.amountVnd === prior.amountVnd && line.code < prior.code)) groups.set(group, line);
      } else candidates.push(line);
    }
  }
  for (const line of [...candidates, ...groups.values()]) { lines.push(line); totalBps += line.bps; }
  if (totalBps > policy.maxSurchargeBps)
    fail(
      'SURCHARGE_REVIEW_REQUIRED',
      'Surcharges exceed automatic quote cap',
      409
    );
  const grossSubtotal = safe(
    lines.reduce((sum, line) => sum + BigInt(line.amountVnd), 0n)
  );
  const comboBps = deferOrderAdjustments ? 0 : Math.min(visitCount * (policy.comboPerVisitBps ?? 0), policy.comboMaxBps ?? 0);
  const discount = fee(base, comboBps);
  if (comboBps) lines.push({ code: 'COMBO_DISCOUNT', bps: comboBps, basisVnd: base, amountVnd: -discount,
    explanation: 'Giảm theo tổng lượt dịch vụ, tối đa 10%, trên tiền dịch vụ trước phụ phí.' });
  const subtotal = grossSubtotal - discount;
  const tiers = Math.floor(subtotal / policy.orderStepVnd),
    tierBps = deferOrderAdjustments ? 0 : tiers * policy.orderStepBps;
  if (tierBps > policy.maxOrderTierBps)
    fail('ORDER_TIER_REVIEW_REQUIRED', 'Order tier exceeds approved cap', 409);
  const orderFee = fee(subtotal, tierBps);
  lines.push({
    code: 'ORDER_VALUE_TIER',
    tiers,
    bps: tierBps,
    basisVnd: subtotal,
    amountVnd: orderFee,
    explanation: `Mỗi ${policy.orderStepVnd} VND trọn bậc của tổng dịch vụ và phụ phí đặc điểm, trước phí bậc giá, cộng ${policy.orderStepBps / 100}%; không tính lặp trên chính phụ phí này.`
  });
  return {
    currency: 'VND',
    totalVnd: safe(BigInt(subtotal) + BigInt(orderFee)),
    subtotalVnd: subtotal,
    lines,
    priceVersion,
    policyVersion: policy.version,
    rounding: 'HALF_UP_VND_PER_LINE',
    durationUnits: policy.billingMode === 'PER_KM' ? undefined : units,
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    ...(dayCount !== undefined ? { dayCount } : {}),
    visitCount,
    kind: 'ESTIMATE',
    paymentMode: visitCount === 1 ? 'POSTPAY' : 'PREPAY',
    exclusions: ['VETERINARY_BILLS', 'UNAPPROVED_EXTRA_WORK'],
    method: 'APPROVED_RULES'
  };
}
