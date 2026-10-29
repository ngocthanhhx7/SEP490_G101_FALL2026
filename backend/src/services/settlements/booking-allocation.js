import { createHash } from 'node:crypto';

export const BOOKING_ALLOCATION_VERSION = 'PWC-VISIT-SNAPSHOT-ALLOCATION-2026-10-30-v1';
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const money = value => Number.isSafeInteger(value) && value >= 0;

// Exact integer apportionment preserves the confirmed total; ties are stable
// across input order and retries. Unknown tax is never interpreted as zero.
export function allocateBookingReceipt({ bookingId, visits, receipt, assessment }) {
  if (!id(bookingId) || !Array.isArray(visits) || !visits.length || visits.length > 60
    || visits.some(visit => !id(visit?.visitId) || !id(visit.sitterId) || !money(visit.serviceBasisVnd))
    || new Set(visits.map(visit => visit.visitId)).size !== visits.length
    || receipt?.verified !== true || receipt.bookingId !== bookingId || receipt.currency !== 'VND'
    || !id(receipt.id) || !money(receipt.serviceAmountVnd)
    || assessment?.confirmed !== true || assessment.bookingId !== bookingId || !id(assessment.id)
    || !money(assessment.totalTaxVnd)) throw new TypeError('Verified receipt, confirmed tax and immutable visit prices required');
  const ordered = visits.map(visit => ({ ...visit })).sort((a, b) => a.visitId < b.visitId ? -1 : a.visitId > b.visitId ? 1 : 0);
  const total = ordered.reduce((sum, visit) => sum + BigInt(visit.serviceBasisVnd), 0n);
  if (total <= 0n || total > BigInt(Number.MAX_SAFE_INTEGER)
    || total !== BigInt(receipt.serviceAmountVnd) || BigInt(assessment.totalTaxVnd) > total) {
    throw new RangeError('Service allocation must reconcile exactly to its verified receipt');
  }
  const tax = BigInt(assessment.totalTaxVnd);
  const apportioned = ordered.map(visit => {
    const product = BigInt(visit.serviceBasisVnd) * tax;
    return { visit, amount: product / total, remainder: product % total };
  });
  let remaining = tax - apportioned.reduce((sum, row) => sum + row.amount, 0n);
  const priority = [...apportioned].sort((a, b) => a.remainder > b.remainder ? -1
    : a.remainder < b.remainder ? 1 : a.visit.visitId < b.visit.visitId ? -1 : 1);
  for (const row of priority) { if (remaining === 0n) break; row.amount += 1n; remaining -= 1n; }
  const rows = apportioned.map(row => ({ visitId: row.visit.visitId, sitterId: row.visit.sitterId,
    serviceBasisVnd: row.visit.serviceBasisVnd, confirmedTaxVnd: Number(row.amount) }));
  const sitters = new Map();
  for (const row of rows) {
    const current = sitters.get(row.sitterId) ?? { sitterId: row.sitterId, serviceBasisVnd: 0, confirmedTaxVnd: 0, visitIds: [] };
    current.serviceBasisVnd += row.serviceBasisVnd; current.confirmedTaxVnd += row.confirmedTaxVnd; current.visitIds.push(row.visitId);
    sitters.set(row.sitterId, current);
  }
  const payload = { bookingId, paymentReference: receipt.id, assessmentReference: assessment.id,
    policyVersion: BOOKING_ALLOCATION_VERSION, serviceAmountVnd: receipt.serviceAmountVnd,
    totalTaxVnd: assessment.totalTaxVnd, rows, sitters: [...sitters.values()].sort((a, b) => a.sitterId < b.sitterId ? -1 : 1) };
  return { ...payload, sourceHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
