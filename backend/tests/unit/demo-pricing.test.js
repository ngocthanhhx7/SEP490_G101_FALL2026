import { expect, test } from '@jest/globals';
import { demoServiceCatalog, demoPricingPolicy } from '../../src/constants/demo-service-catalog.js';
import { calculateQuote } from '../../src/services/pricing/pricing-calculation.service.js';
const item = code => demoServiceCatalog.find(s => s.code === code);
const pet = { _id: 'synthetic-pet', species: 'DOG', weightKg: 4, traits: [], breedCode: 'mixed' };
const quote = (code, extra = {}, p = pet) => calculateQuote({ baseAmountVnd: item(code).amountVnd, priceVersion: 1,
  policy: demoPricingPolicy(item(code)), pets: [p], durationMinutes: item(code).durationMinutes || 60, ...extra });

test('the thirteen sheet services use per-visit, day, time and metre units', () => {
  expect(demoServiceCatalog).toHaveLength(13);
  expect(quote('pet-bathing', { durationMinutes: 120 }).totalVnd).toBe(99000);
  expect(quote('pet-boarding', { dayCount: 3 }).totalVnd).toBe(742500);
  expect(quote('pet-transport', { distanceMeters: 1250 }).totalVnd).toBe(12375);
  expect(quote('basic-training', { durationMinutes: 90 }).totalVnd).toBe(594000);
  expect(() => quote('pet-boarding')).toThrow();
  expect(() => quote('pet-transport')).toThrow();
  expect(() => quote('pet-bathing', { distanceMeters: 1000 })).toThrow();
});
test.each([
  ['DOG', 4.999, 0], ['DOG', 5, 1000], ['DOG', 15, 1000], ['DOG', 15.001, 2000], ['DOG', 25, 2000], ['DOG', 25.001, 3000],
  ['CAT', 3.999, 0], ['CAT', 4, 1000], ['CAT', 6, 1000], ['CAT', 6.001, 2000], ['CAT', 8, 2000], ['CAT', 8.001, 3000]
])('%s %s kg has one weight surcharge (%s bps)', (species, weightKg, bps) => {
  const result = quote('pet-bathing', {}, { ...pet, species, weightKg });
  expect(result.lines.filter(l => l.code.startsWith(species + '_')).reduce((sum, l) => sum + l.bps, 0)).toBe(bps);
});
test('highest surcharge within each group, additive groups and stable tie-break', () => {
  const result = quote('pet-bathing', {}, { ...pet, weightKg: 5, traits: ['long-coat', 'thick-coat', 'stranger-fear', 'needs-extra-handler'] });
  expect(result.lines.map(l => l.code)).toEqual(expect.arrayContaining(['long-coat', 'stranger-fear', 'DOG_MEDIUM']));
  expect(result.lines.map(l => l.code)).not.toContain('thick-coat');
  expect(result.totalVnd).toBe(154000);
});
test('six visits receive six percent on base only; ten percent cap and prepay', () => {
  expect(quote('pet-bathing', { visitCount: 6 }).totalVnd).toBe(564000);
  const result = quote('pet-bathing', { visitCount: 20 });
  expect(result.totalVnd).toBe(1800000);
  expect(result.paymentMode).toBe('PREPAY');
});
