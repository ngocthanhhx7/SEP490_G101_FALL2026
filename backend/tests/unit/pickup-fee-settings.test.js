import { expect, test } from '@jest/globals';
import {
  validatePickupFeePolicy, pickupFeeForDistance
} from '../../src/services/pickup/pickup-fee-settings.service.js';

const policy = {
  maxKm: 10,
  tiers: [
    { fromKm: 0, toKm: 3, feeVnd: 20000 },
    { fromKm: 3, toKm: 7, feeVnd: 40000 },
    { fromKm: 7, toKm: 10, feeVnd: 60000 }
  ]
};
test.each([
  [0, 20000], [2999.99, 20000], [3000, 20000], [3000.01, 40000],
  [7000, 40000], [7000.01, 60000], [10000, 60000]
])('pickup fees include tier upper bounds and one fee for both directions: %s meters', (meters, feeVnd) => {
  expect(pickupFeeForDistance(policy, meters)).toMatchObject({
    allowed: true, distanceMeters: meters, feeVnd,
    maxKm: 10
  });
});
test('pickup 10km max is inclusive, above max fails closed with distance and max only', () => {
  expect(pickupFeeForDistance(policy, 10000).allowed).toBe(true);
  expect(pickupFeeForDistance(policy, 10000.01)).toMatchObject({
    allowed: false, distanceKm: 10.00001, maxKm: 10
  });
  expect(pickupFeeForDistance(policy, 10000.01)).not.toHaveProperty('feeVnd');
});
test.each([
  { ...policy, tiers: [{ fromKm: 1, toKm: 3, feeVnd: 20000 }] },
  { ...policy, maxKm: 11 },
  { ...policy, tiers: [policy.tiers[0], { fromKm: 4, toKm: 7, feeVnd: 40000 }, policy.tiers[2]] },
  { ...policy, tiers: [policy.tiers[0], { fromKm: 2.5, toKm: 7, feeVnd: 40000 }, policy.tiers[2]] },
  { ...policy, tiers: [policy.tiers[0], { fromKm: 3, toKm: 3, feeVnd: 40000 }] },
  { ...policy, tiers: [policy.tiers[0], { fromKm: 3, toKm: 7, feeVnd: 0.5 }, policy.tiers[2]] },
  { ...policy, tiers: [] }
])('rejects gapped/overlapping/invalid pickup fee policies: %#', invalid => {
  expect(() => validatePickupFeePolicy(invalid)).toThrow(expect.objectContaining({
    code: 'VALIDATION_FAILED', status: 422
  }));
});
test.each([-1, NaN, Infinity])('routing distance invalid or unavailable is not priced: %s', meters => {
  expect(() => pickupFeeForDistance(policy, meters)).toThrow(expect.objectContaining({
    code: 'PICKUP_DISTANCE_UNAVAILABLE', status: 503
  }));
});
