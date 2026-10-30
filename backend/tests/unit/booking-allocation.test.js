import { expect, test } from '@jest/globals';
import { allocateBookingReceipt } from '../../src/services/settlements/booking-allocation.js';

const fixture = () => ({ bookingId: 'booking-one', visits: [
  { visitId: 'v1', sitterId: 's1', serviceBasisVnd: 100000 },
  { visitId: 'v2', sitterId: 's2', serviceBasisVnd: 200000 }
], receipt: { id: 'receipt-one', bookingId: 'booking-one', verified: true, currency: 'VND', serviceAmountVnd: 300000 },
assessment: { id: 'assessment-one', bookingId: 'booking-one', confirmed: true, totalTaxVnd: 10000 } });

test('allocates the approved 1:2 visit prices, preserves tax exactly and is input-order independent', () => {
  const input = fixture();
  const result = allocateBookingReceipt(input);
  expect(result.rows.map(row => row.confirmedTaxVnd)).toEqual([3333, 6667]);
  expect(result.sitters).toEqual([
    { sitterId: 's1', serviceBasisVnd: 100000, confirmedTaxVnd: 3333, sitterTaxCostVnd: 1667, platformTaxCostVnd: 1666, visitIds: ['v1'] },
    { sitterId: 's2', serviceBasisVnd: 200000, confirmedTaxVnd: 6667, sitterTaxCostVnd: 3333, platformTaxCostVnd: 3334, visitIds: ['v2'] }
  ]);
  expect(allocateBookingReceipt({ ...input, visits: [...input.visits].reverse() })).toEqual(result);
});

test('stable visit-id tie break assigns the odd VND and aggregates one sitter once per booking', () => {
  const input = fixture();
  input.visits = [{ visitId: 'b', sitterId: 's1', serviceBasisVnd: 1 }, { visitId: 'a', sitterId: 's1', serviceBasisVnd: 1 }];
  input.receipt.serviceAmountVnd = 2; input.assessment.totalTaxVnd = 1;
  const result = allocateBookingReceipt(input);
  expect(result.rows.map(row => row.confirmedTaxVnd)).toEqual([1, 0]);
  expect(result.sitters).toEqual([{ sitterId: 's1', serviceBasisVnd: 2, confirmedTaxVnd: 1,
    sitterTaxCostVnd: 0, platformTaxCostVnd: 1, visitIds: ['a', 'b'] }]);
});

test('booking tax costs are split before allocation, including an odd total and many price combinations', () => {
  for (let a = 1; a <= 7; a++) for (let b = 1; b <= 7; b++) for (let tax = 0; tax <= a + b; tax++) {
    const input = fixture();
    input.visits[0].serviceBasisVnd = a; input.visits[1].serviceBasisVnd = b;
    input.receipt.serviceAmountVnd = a + b; input.assessment.totalTaxVnd = tax;
    const result = allocateBookingReceipt(input);
    expect(result.sitters.reduce((sum, sitter) => sum + sitter.sitterTaxCostVnd, 0)).toBe(Math.floor(tax / 2));
    expect(result.sitters.reduce((sum, sitter) => sum + sitter.platformTaxCostVnd, 0)).toBe(tax - Math.floor(tax / 2));
    expect(result.rows.every(row => row.confirmedTaxVnd === row.sitterTaxCostVnd + row.platformTaxCostVnd)).toBe(true);
  }
});

test('up to 60 visits conserve both booking tax shares with zero prices and repeated sitters', () => {
  let seed = 490;
  const next = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let count = 1; count <= 60; count++) for (let sample = 0; sample < 10; sample++) {
    const input = fixture();
    input.visits = Array.from({ length: count }, (_, index) => ({ visitId: `visit-${index}`,
      sitterId: `sitter-${index % 4}`, serviceBasisVnd: index === 0 ? next(100000) + 1 : next(100000) }));
    if (count > 1) input.visits[1].serviceBasisVnd = 0;
    input.receipt.serviceAmountVnd = input.visits.reduce((sum, visit) => sum + visit.serviceBasisVnd, 0);
    input.assessment.totalTaxVnd = next(input.receipt.serviceAmountVnd + 1);
    const result = allocateBookingReceipt(input);
    for (const [field, total] of [['confirmedTaxVnd', input.assessment.totalTaxVnd],
      ['sitterTaxCostVnd', Math.floor(input.assessment.totalTaxVnd / 2)],
      ['platformTaxCostVnd', Math.ceil(input.assessment.totalTaxVnd / 2)]]) {
      expect(result.rows.reduce((sum, row) => sum + row[field], 0)).toBe(total);
      expect(result.sitters.reduce((sum, row) => sum + row[field], 0)).toBe(total);
    }
    expect(result.rows.every(row => row.sitterTaxCostVnd >= 0 && row.platformTaxCostVnd >= 0
      && row.sitterTaxCostVnd + row.platformTaxCostVnd === row.confirmedTaxVnd)).toBe(true);
    expect(result.rows.filter(row => row.serviceBasisVnd === 0).every(row => row.confirmedTaxVnd === 0)).toBe(true);
    expect(allocateBookingReceipt({ ...input, visits: [...input.visits].reverse() })).toEqual(result);
  }
});

test('missing tax, unverified payment, mismatched receipt and duplicate visits are blocked', () => {
  for (const patch of [input => { input.assessment.totalTaxVnd = undefined; },
    input => { input.receipt.verified = false; }, input => { input.receipt.serviceAmountVnd = 299999; },
    input => { input.visits[1].visitId = 'v1'; }, input => { input.assessment.bookingId = 'other'; }]) {
    const input = fixture(); patch(input); expect(() => allocateBookingReceipt(input)).toThrow();
  }
});

test('BigInt apportionment preserves safe-integer maxima without intermediate rounding loss', () => {
  const input = fixture();
  input.visits = [{ visitId: 'a', sitterId: 's1', serviceBasisVnd: Number.MAX_SAFE_INTEGER - 1 },
    { visitId: 'b', sitterId: 's2', serviceBasisVnd: 1 }];
  input.receipt.serviceAmountVnd = Number.MAX_SAFE_INTEGER; input.assessment.totalTaxVnd = Number.MAX_SAFE_INTEGER;
  const result = allocateBookingReceipt(input);
  expect(result.rows.reduce((sum, row) => sum + BigInt(row.confirmedTaxVnd), 0n)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
});
