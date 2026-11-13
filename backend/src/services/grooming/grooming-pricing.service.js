import { Types } from 'mongoose';
import { petCareModels } from '../../models/pet-care.model.js';
import { createPricingRepository } from '../pricing/pricing.repository.js';
import { calculateQuote } from '../pricing/pricing-calculation.service.js';
import { GROOMING_BLOCKING_BITE_ANSWER } from '../../constants/grooming.js';
import { AppError } from '../../utils/app-error.js';
import { fail } from '../../validators/pet-care.validator.js';

const SPECIES = { DOG: 'chó', CAT: 'mèo' };

// The weight rule of the approved pricing policy that applies to the pet, as a readable size ("chó 5–15 kg").
export function groomingSizeLabel(pet, policy) {
  const weightRules = policy.rules.filter(rule => rule.exclusiveGroup === 'WEIGHT' && rule.when?.species === pet.species);
  const species = SPECIES[pet.species] ?? '';
  const matched = weightRules.find(rule => {
    const { minWeightKg: min, maxWeightKg: max, minWeightExclusive, maxWeightInclusive } = rule.when;
    return (min === undefined || (minWeightExclusive ? pet.weightKg > min : pet.weightKg >= min))
      && (max === undefined || (maxWeightInclusive ? pet.weightKg <= max : pet.weightKg < max));
  });
  if (matched) {
    const { minWeightKg: min, maxWeightKg: max } = matched.when;
    if (min !== undefined && max !== undefined) return `${species} ${min}–${max} kg`;
    if (min !== undefined) return `${species} trên ${min} kg`;
    if (max !== undefined) return `${species} dưới ${max} kg`;
  }
  const lowest = weightRules.map(rule => rule.when.minWeightKg).filter(Number.isFinite).sort((a, b) => a - b)[0];
  return lowest === undefined ? null : `${species} dưới ${lowest} kg`;
}

const discountOf = (subtotalVnd, bps) => Number(BigInt(subtotalVnd) * BigInt(bps) / 10000n);

// Price of every pet at booking time (GBR-40): approved pricing policy by pet size, one pet and one service at a time,
// with order-level adjustments off and no care traits (surcharges for a different pet are agreed at check-in).
export function createGroomingPricing({ connection, clock = Date.now, shopServices, tierService, discountHold, hotline = null }) {
  const { Pet } = petCareModels(connection);
  const repository = createPricingRepository(connection, clock);

  async function readTier(customerId) {
    let code = null, discountBps = 0, blockedReason = null;
    try {
      const read = await tierService.read(customerId);
      if (read) ({ tier: code, discountBps } = read);
    } catch (error) {
      if (error?.code !== 'CUSTOMER_TIER_POLICY_UNAPPROVED') throw error;
      blockedReason = 'POLICY_UNAPPROVED';
    }
    if (!blockedReason && discountBps > 0) blockedReason = await discountHold.read(customerId);
    return { code, discountBps: blockedReason ? 0 : discountBps, blockedReason };
  }

  async function price(customerId, input) {
    const shop = await shopServices.resolve(input.pets.flatMap(row => row.serviceIds));
    const ids = input.pets.map(row => new Types.ObjectId(row.petId));
    const pets = await Pet.find({ _id: { $in: ids }, ownerId: customerId, state: 'ACTIVE' }).lean();
    if (pets.length !== ids.length) fail('RESOURCE_NOT_FOUND', 'Owned pet unavailable', 404);
    const priced = [];
    for (const row of input.pets) {
      const pet = pets.find(item => String(item._id) === row.petId);
      if (row.answers.biteOrScratch === GROOMING_BLOCKING_BITE_ANSWER) {
        throw new AppError(422, 'GROOMING_PET_REFERRAL_REQUIRED', 'This pet can only be booked by calling the shop', { petId: row.petId, petName: pet.name, hotline });
      }
      priced.push({ pet, row });
    }
    const results = [];
    for (const { pet, row } of priced) {
      const lines = [];
      for (const serviceId of row.serviceIds) {
        const context = await repository.context(customerId, { serviceId, petIds: [row.petId] });
        const service = shop.get(serviceId);
        const quote = calculateQuote({ baseAmountVnd: context.price.amountVnd, priceVersion: context.price.version, policy: context.policy,
          pets: [{ ...context.pets[0], traits: [] }], durationMinutes: service.durationMinutes, visitCount: 1, deferOrderAdjustments: true });
        lines.push({ serviceId, label: service.name, sizeLabel: groomingSizeLabel(pet, context.policy), amountVnd: quote.subtotalVnd,
          durationMinutes: service.durationMinutes, serviceVersion: context.version.version, priceVersion: context.price.version, policyVersion: context.policy.version });
      }
      results.push({ pet, answers: row.answers, lines, priceVnd: lines.reduce((sum, line) => sum + line.amountVnd, 0),
        durationMinutes: lines.reduce((sum, line) => sum + line.durationMinutes, 0) });
    }
    const subtotalVnd = results.reduce((sum, row) => sum + row.priceVnd, 0);
    if (!Number.isSafeInteger(subtotalVnd)) fail('PRICE_OVERFLOW', 'Price exceeds supported range');
    const tier = await readTier(customerId);
    const tierDiscountVnd = discountOf(subtotalVnd, tier.discountBps);
    return { pets: results, subtotalVnd, tier, tierDiscountVnd, totalVnd: subtotalVnd - tierDiscountVnd };
  }

  return {
    price,
    async quote(customerId, input) {
      const priced = await price(customerId, input);
      return {
        currency: 'VND',
        pets: priced.pets.map(row => ({ petId: String(row.pet._id), name: row.pet.name, priceVnd: row.priceVnd,
          lines: row.lines.map(({ serviceId, label, sizeLabel, amountVnd }) => ({ serviceId, label, sizeLabel, amountVnd })) })),
        subtotalVnd: priced.subtotalVnd,
        tier: { code: priced.tier.code, discountBps: priced.tier.discountBps, discountVnd: priced.tierDiscountVnd,
          applied: priced.tierDiscountVnd > 0, blockedReason: priced.tier.blockedReason },
        totalVnd: priced.totalVnd
      };
    }
  };
}
