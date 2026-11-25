import { fail } from '../../validators/pet-care.validator.js';

export const CHECKOUT_POLICY_VERSION = 'PWC-CHECKOUT-2026-10-30-v1';
export const PREPAY_WINDOW_MS = 15 * 60000;

// Largest-remainder allocation keeps both visit-count and customer-tier discounts exact.
// Stable item/visit order resolves ties; no customer fee or disbursement enters commission.
export function checkoutVisitMoney(result) {
  const rows = result.items.flatMap((item, itemIndex) => {
    const base = item.lines.find(line => line.code === 'BASE')?.amountVnd ?? item.lines[0]?.amountVnd;
    if (!Number.isSafeInteger(base) || base < 1 || !Number.isSafeInteger(item.subtotalVnd) || item.subtotalVnd < base || !Number.isSafeInteger(item.visitCount) || item.visitCount < 1)
      fail('QUOTE_REVIEW_REQUIRED', 'Invalid immutable quote basis', 409);
    const divide = (value, index) => Math.floor(value / item.visitCount) + (index < value % item.visitCount ? 1 : 0);
    return Array.from({ length: item.visitCount }, (_, index) => ({ itemIndex,
      baseVnd: divide(base, index), surchargeVnd: divide(item.subtotalVnd - base, index) }));
  });
  const base = rows.reduce((sum, row) => sum + BigInt(row.baseVnd), 0n);
  if (base !== BigInt(result.baseVnd) || !Number.isSafeInteger(result.discountVnd) || result.discountVnd < 0 || BigInt(result.discountVnd) > base)
    fail('QUOTE_REVIEW_REQUIRED', 'Quote discount does not reconcile', 409);
  const amounts = rows.map((row, index) => ({ index, value: BigInt(row.baseVnd) * BigInt(result.discountVnd) / base,
    remainder: BigInt(row.baseVnd) * BigInt(result.discountVnd) % base }));
  let remaining = BigInt(result.discountVnd) - amounts.reduce((sum, row) => sum + row.value, 0n);
  for (const row of [...amounts].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining === 0n) break; row.value++; remaining--;
  }
  const allocated = rows.map((row, index) => ({ ...row, discountVnd: Number(amounts[index].value),
    employeeServiceNetVnd: row.baseVnd + row.surchargeVnd - Number(amounts[index].value) }));
  const subtotal = allocated.reduce((sum, row) => sum + BigInt(row.employeeServiceNetVnd), 0n);
  const tierDiscount = result.tierDiscountVnd ?? 0;
  if (subtotal !== BigInt(result.subtotalVnd) || !Number.isSafeInteger(tierDiscount) || tierDiscount < 0 ||
    BigInt(tierDiscount) > subtotal || BigInt(result.subtotalVnd) - BigInt(tierDiscount) !== BigInt(result.totalVnd))
    fail('QUOTE_REVIEW_REQUIRED', 'Quote total does not reconcile', 409);
  if (tierDiscount === 0) return allocated.map(row => ({ ...row, tierDiscountVnd: 0 }));
  if (subtotal === 0n) fail('QUOTE_REVIEW_REQUIRED', 'Invalid tier discount basis', 409);
  const shares = allocated.map((row, index) => ({ index,
    value: BigInt(row.employeeServiceNetVnd) * BigInt(tierDiscount) / subtotal,
    remainder: BigInt(row.employeeServiceNetVnd) * BigInt(tierDiscount) % subtotal }));
  let left = BigInt(tierDiscount) - shares.reduce((sum, row) => sum + row.value, 0n);
  for (const row of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!left) break;
    row.value++; left--;
  }
  return allocated.map((row, index) => ({
    ...row, tierDiscountVnd: Number(shares[index].value),
    employeeServiceNetVnd: row.employeeServiceNetVnd - Number(shares[index].value)
  }));
}
