import { vietnamRequestWeek } from './week.js';

// Commission tiers approved by the user on 2026-10-16. This pure calculator
// consumes complete, authoritative completed-booking snapshots for ONE sitter.
// It does not discover completions, determine taxes or create available earnings.
export const WEEKLY_COMMISSION_VERSION = 'PWC-WEEKLY-COMMISSION-2026-10-16-v1';
const tiers = Object.freeze([
  Object.freeze({ firstBooking: 1, basisPoints: 1000 }),
  Object.freeze({ firstBooking: 6, basisPoints: 900 }),
  Object.freeze({ firstBooking: 11, basisPoints: 800 }),
  Object.freeze({ firstBooking: 21, basisPoints: 700 })
]);
export const WEEKLY_COMMISSION_TIERS = tiers;
const money = value => Number.isSafeInteger(value) && value >= 0;
function checked(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('Money total exceeds safe VND range');
  }
  return Number(value);
}

export function calculateWeeklyCommission({ sitterId, bookings }) {
  if (typeof sitterId !== 'string' || !sitterId || !Array.isArray(bookings) || bookings.length > 1000) {
    throw new TypeError('A sitter and bounded complete booking snapshots are required');
  }
  const seen = new Set();
  const ordered = bookings.map(booking => {
    if (!booking || typeof booking.bookingId !== 'string' || !booking.bookingId
      || booking.bookingId.length > 128 || booking.sitterId !== sitterId
      || seen.has(booking.bookingId) || !money(booking.serviceBasisVnd)
      || typeof booking.completedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(booking.completedAt)) {
      throw new TypeError('Invalid completed booking snapshot');
    }
    const at = new Date(booking.completedAt);
    if (!Number.isFinite(at.getTime()) || at.toISOString() !== booking.completedAt) {
      throw new TypeError('Invalid booking completion instant');
    }
    seen.add(booking.bookingId);
    return { ...booking, weekKey: vietnamRequestWeek(at).requestWeekKey };
  }).sort((a, b) => a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1
    : a.bookingId < b.bookingId ? -1 : a.bookingId > b.bookingId ? 1 : 0);
  const counts = new Map();
  let basisTotal = 0n, commissionTotal = 0n;
  const rows = ordered.map(booking => {
    const ordinal = (counts.get(booking.weekKey) ?? 0) + 1;
    counts.set(booking.weekKey, ordinal);
    const bps = tiers.filter(tier => ordinal >= tier.firstBooking).at(-1).basisPoints;
    // User-approved whole-VND half-up rounding, using BigInt for exact arithmetic.
    const numerator = BigInt(booking.serviceBasisVnd) * BigInt(bps);
    const rounded = (numerator + 5000n) / 10000n;
    const commissionVnd = checked(rounded);
    basisTotal += BigInt(booking.serviceBasisVnd);
    commissionTotal += rounded;
    return { bookingId: booking.bookingId, sitterId, completedAt: booking.completedAt,
      weekKey: booking.weekKey, ordinal, serviceBasisVnd: booking.serviceBasisVnd,
      feeBasisPoints: bps, commissionVnd, commissionNumerator: numerator.toString(),
      commissionDenominator: 10000, policyVersion: WEEKLY_COMMISSION_VERSION,
      rounding: 'HALF_UP_VND', decisionIds: [] };
  });
  return { policyVersion: WEEKLY_COMMISSION_VERSION, unit: 'COMPLETED_BOOKING',
    rows, serviceBasisVnd: checked(basisTotal),
    commissionVnd: checked(commissionTotal),
    // Amount calculation alone cannot establish payment, holds or release readiness.
    earningEligibilityVerified: false };
}

export function previewEqualTaxCostSplit({ serviceBasisVnd, commissionVnd, confirmedTaxVnd }) {
  if (!money(serviceBasisVnd) || !money(commissionVnd) || commissionVnd > serviceBasisVnd
    || !money(confirmedTaxVnd) || confirmedTaxVnd > serviceBasisVnd) {
    throw new TypeError('Confirmed whole-VND basis, commission and tax are required');
  }
  const sitterTax = Math.floor(confirmedTaxVnd / 2);
  const platformTax = confirmedTaxVnd - sitterTax;
  const sitterVnd = serviceBasisVnd - commissionVnd - sitterTax;
  const platformVnd = commissionVnd - platformTax;
  if (sitterVnd < 0) throw new RangeError('Tax cost split requires negative sitter funds');
  return { payable: false, decisionIds: ['FIN-07-TAX-REGIME', 'FIN-07-ELIG'],
    totalTaxVnd: confirmedTaxVnd, sitterTaxCostVnd: sitterTax, platformTaxCostVnd: platformTax,
    sitterVnd, platformVnd, requiresPlatformFunding: platformVnd < 0 };
}
