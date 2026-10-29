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
    { sitterId: 's1', serviceBasisVnd: 100000, confirmedTaxVnd: 3333, visitIds: ['v1'] },
    { sitterId: 's2', serviceBasisVnd: 200000, confirmedTaxVnd: 6667, visitIds: ['v2'] }
  ]);
  expect(allocateBookingReceipt({ ...input, visits: [...input.visits].reverse() })).toEqual(result);
});

test('stable visit-id tie break assigns the odd VND and aggregates one sitter once per booking', () => {
  const input = fixture();
  input.visits = [{ visitId: 'b', sitterId: 's1', serviceBasisVnd: 1 }, { visitId: 'a', sitterId: 's1', serviceBasisVnd: 1 }];
  input.receipt.serviceAmountVnd = 2; input.assessment.totalTaxVnd = 1;
  const result = allocateBookingReceipt(input);
  expect(result.rows.map(row => row.confirmedTaxVnd)).toEqual([1, 0]);
  expect(result.sitters).toEqual([{ sitterId: 's1', serviceBasisVnd: 2, confirmedTaxVnd: 1, visitIds: ['a', 'b'] }]);
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
