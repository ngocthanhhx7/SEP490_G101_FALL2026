import { createProjectionReader, ID, fail, integer, date, text } from './read-projection.js';

const BALANCES = ['pending', 'available', 'held', 'reserved', 'paid'];
export function projectEarnings(snapshot, scope) {
  const totals = Object.fromEntries(['accrued', ...BALANCES].map(key => [key, 0]));
  const items = [];
  const seen = new Set();
  for (const row of snapshot.items) {
    if (row.sitterId !== scope.userId || !ID.test(row.visitId ?? '')
      || !ID.test(row.id ?? '') || seen.has(row.visitId)) fail(503, 'INVALID_PROJECTION');
    seen.add(row.visitId);
    // A cancelled visit is never included in earned income or these page subtotals.
    if (row.visitState === 'CANCELLED' || row.visitState === 'Cancelled') continue;
    if (!['COMPLETED', 'Completed', 'STAFF_CLOSED', 'StaffClosed'].includes(row.visitState)) fail(503, 'INVALID_PROJECTION');
    const balances = Object.fromEntries(['accrued', ...BALANCES].map(key => [key, integer(row[key])]));
    const allocated = BALANCES.reduce((sum, key) => sum + balances[key], 0);
    if (!Number.isSafeInteger(allocated) || allocated !== balances.accrued
      || !text(row.explanation, 500) || !row.explanation || !text(row.ledgerReference, 128)
      || !row.ledgerReference || (balances.paid > 0 && !row.transferRecordedAt)) fail(503, 'INVALID_PROJECTION');
    for (const key of Object.keys(totals)) totals[key] = integer(totals[key] + balances[key]);
    items.push({ id: row.id, visitId: row.visitId, state: row.visitState, ...balances,
      completedAt: date(row.completedAt), explanation: row.explanation, ledgerReference: row.ledgerReference,
      transferRecordedAt: row.transferRecordedAt ? date(row.transferRecordedAt) : null });
  }
  return { items, metrics: Object.entries(totals).map(([key, value]) => ({ key, value,
    label: { accrued: 'Đã kiếm được', pending: 'Chờ đủ điều kiện', available: 'Khả dụng',
      held: 'Đang giữ', reserved: 'Đã dành tất toán', paid: 'Đã quyết toán' }[key], currency: 'VND' })),
    totalsScope: 'PAGE' };
}
export function createEarningsService({ repository } = {}) {
  return createProjectionReader({ kind: 'earnings', roles: ['PET_SITTER'], repository,
    financial: true, project: projectEarnings });
}
