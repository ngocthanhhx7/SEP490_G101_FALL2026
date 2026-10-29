import { describe, expect, test } from '@jest/globals';
import { calculateWeeklyCommission, previewEqualTaxCostSplit } from '../../src/services/settlements/weekly-commission.js';
const booking = (n, overrides = {}) => ({ bookingId: `booking-${String(n).padStart(3, '0')}`,
  sitterId: 'sitter-a', serviceBasisVnd: 200000, completedAt: '2026-10-16T00:00:00.000Z', ...overrides });
const calculate = bookings => calculateWeeklyCommission({ sitterId: 'sitter-a', bookings });

describe('approved weekly progressive booking commission, separated from earning eligibility', () => {
  test('25 completed bookings charge 420000 of 5000000; boundaries do not reprice earlier bookings', () => {
    const result = calculate(Array.from({ length: 25 }, (_, i) => booking(i + 1)).reverse());
    expect([0, 4, 5, 9, 10, 19, 20, 24].map(i => result.rows[i].feeBasisPoints))
      .toEqual([1000, 1000, 900, 900, 800, 800, 700, 700]);
    expect(result).toMatchObject({ serviceBasisVnd: 5000000, commissionVnd: 420000,
      unit: 'COMPLETED_BOOKING', earningEligibilityVerified: false });
    expect(calculate([booking(1)]).rows[0].commissionVnd).toBe(result.rows[0].commissionVnd);
  });
  test('resets exactly Monday midnight Vietnam, independent of payout week', () => {
    const result = calculate([
      ...Array.from({ length: 5 }, (_, i) => booking(i, { completedAt: '2026-10-18T16:59:59.999Z' })),
      booking(6, { completedAt: '2026-10-18T17:00:00.000Z' })
    ]);
    expect(result.rows[4]).toMatchObject({ weekKey: '2026-10-12', ordinal: 5 });
    expect(result.rows[5]).toMatchObject({ weekKey: '2026-10-19', ordinal: 1, feeBasisPoints: 1000 });
  });
  test('rejects duplicate bookings, mixed sitters, invalid time, floats and oversized totals', () => {
    for (const rows of [[booking(1), booking(1)], [booking(1, { sitterId: 'other' })],
      [booking(1, { completedAt: '2026-02-30T00:00:00.000Z' })], [booking(1, { serviceBasisVnd: 1.1 })],
      [booking(1, { completedAt: '2026-10-16T07:00:00+07:00' })]]) expect(() => calculate(rows)).toThrow();
    expect(() => calculate([booking(1, { serviceBasisVnd: Number.MAX_SAFE_INTEGER }),
      booking(2, { serviceBasisVnd: Number.MAX_SAFE_INTEGER })])).toThrow(RangeError);
  });
  test('rounds half-up by booking in exact integer arithmetic and preserves the calculation basis', () => {
    const result = calculate([booking(1, { serviceBasisVnd: 100001 }), booking(2, { serviceBasisVnd: 100005 })]);
    expect(result.commissionVnd).toBe(20001);
    expect(result.rows[0]).toMatchObject({ commissionNumerator: '100001000', commissionDenominator: 10000,
      commissionVnd: 10000, rounding: 'HALF_UP_VND', decisionIds: [] });
    expect(result.rows[1].commissionVnd).toBe(10001);
    expect(calculate([booking(1, { serviceBasisVnd: Number.MAX_SAFE_INTEGER })]).commissionVnd)
      .toBe(Number((BigInt(Number.MAX_SAFE_INTEGER) * 1000n + 5000n) / 10000n));
  });
  test('confirmed tax cost split conserves money but does not turn into statutory withholding or payout approval', () => {
    const split = previewEqualTaxCostSplit({ serviceBasisVnd: 1000000, commissionVnd: 100000, confirmedTaxVnd: 60000 });
    expect(split).toMatchObject({ sitterVnd: 870000, platformVnd: 70000, totalTaxVnd: 60000, payable: false });
    expect(split.sitterVnd + split.platformVnd + split.totalTaxVnd).toBe(1000000);
    expect(previewEqualTaxCostSplit({ serviceBasisVnd: 1000000, commissionVnd: 70000,
      confirmedTaxVnd: 200000 }).requiresPlatformFunding).toBe(true);
    expect(previewEqualTaxCostSplit({ serviceBasisVnd: 1000, commissionVnd: 100,
      confirmedTaxVnd: 1 })).toMatchObject({ sitterVnd: 900, platformVnd: 99,
        sitterTaxCostVnd: 0, platformTaxCostVnd: 1 });
    expect(() => previewEqualTaxCostSplit({ serviceBasisVnd: 1000, commissionVnd: 100 })).toThrow();
    expect(() => previewEqualTaxCostSplit({ serviceBasisVnd: 1000, commissionVnd: 900, confirmedTaxVnd: 1000 })).toThrow(RangeError);
    expect(previewEqualTaxCostSplit({ serviceBasisVnd: 1000, commissionVnd: 100, confirmedTaxVnd: 0 }))
      .toMatchObject({ sitterVnd: 900, platformVnd: 100, totalTaxVnd: 0 });
  });
});
