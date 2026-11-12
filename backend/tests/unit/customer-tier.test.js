import { expect, jest, test } from '@jest/globals';
import { chooseCustomerTier, customerTierWindow } from '../../src/services/customer-tier.service.js';
import { nextCustomerTierRun, startCustomerTierWorker } from '../../src/jobs/customer-tier.job.js';

test('JOB-05: a disabled worker never constructs the service', () => {
  const createService = jest.fn();
  expect(startCustomerTierWorker({ enabled: false, createService })).toBeNull();
  expect(createService).not.toHaveBeenCalled();
});

const S = 200, G = 500;
const policy = { thresholds: { MEMBER: 0, SILVER: S, GOLD: G } };

test.each([[0, 'MEMBER'], [S - 1, 'MEMBER'], [S, 'SILVER'], [S + 1, 'SILVER'], [G, 'GOLD']])(
  'JOB-05 GBR-42: {S} and {G} are inclusive, including a zero total',
  (totalVnd, tier) => expect(chooseCustomerTier({ totalVnd, currentTier: 'GOLD', policy })).toEqual({ tier, held: false })
);

test('JOB-05 GBR-42: incomplete timestamps permit a proven upgrade but prevent a downgrade', () => {
  expect(chooseCustomerTier({ totalVnd: G, currentTier: 'SILVER', incomplete: true, policy })).toEqual({ tier: 'GOLD', held: false });
  expect(chooseCustomerTier({ totalVnd: 0, currentTier: 'GOLD', incomplete: true, policy })).toEqual({ tier: 'GOLD', held: true });
  expect(chooseCustomerTier({ totalVnd: G, currentTier: 'GOLD', incomplete: true, policy })).toEqual({ tier: 'GOLD', held: true });
});

test('JOB-05 GBR-42: the lower bound clamps the calendar day in Vietnam', () => {
  const asOf = new Date('2024-02-28T19:00:00Z');
  expect(customerTierWindow(asOf).from.toISOString()).toBe('2023-02-27T19:00:00.000Z');
  expect(nextCustomerTierRun(new Date('2026-11-10T18:59:59Z')).toISOString()).toBe('2026-11-10T19:00:00.000Z');
  expect(nextCustomerTierRun(new Date('2026-11-10T19:00:00Z')).toISOString()).toBe('2026-11-11T19:00:00.000Z');
});
