import { expect, test } from '@jest/globals';
import { projectEarnings } from '../../src/services/dashboards/earnings.service.js';

const sitterId = 'a'.repeat(24);
const item = (patch = {}) => ({ id: 'b'.repeat(24), bookingId: 'c'.repeat(24), sitterId, bookingState: 'COMPLETED', accrued: 100, pending: 10, available: 20, held: 30, reserved: 40, paid: 0, completedAt: '2026-11-18T00:00:00Z', explanation: 'Synthetic approved earning', ledgerReference: 'ledger-1', ...patch });
const invalid = snapshot => expect(() => projectEarnings(snapshot, { userId: sitterId })).toThrow(expect.objectContaining({ code: 'INVALID_PROJECTION' }));

test('UTCID01 projects a reconciled, owner-scoped booking into VND balances', () => {
  const result = projectEarnings({ items: [item()] }, { userId: sitterId });
  expect(result.items).toHaveLength(1);
  expect(result.metrics.find(metric => metric.key === 'accrued').value).toBe(100);
});
test('UTCID02 excludes a cancelled booking from totals', () => expect(projectEarnings({ items: [item({ bookingState: 'CANCELLED' })] }, { userId: sitterId }).items).toEqual([]));
test.each([
  ['UTCID03', item({ sitterId: 'd'.repeat(24) })], ['UTCID04', item({ available: 21 })],
  ['UTCID05', item({ paid: 1 })], ['UTCID06', item({ explanation: '' })],
  ['UTCID07', item({ bookingState: 'ASSIGNED' })]
])('%s rejects an invalid projection row', (_id, row) => invalid({ items: [row] }));
test('UTCID08 rejects duplicate booking resources even with different earning ids', () => invalid({ items: [item(), item({ id: 'd'.repeat(24) })] }));
test('UTCID09 requires transfer evidence when paid is positive', () => invalid({ items: [item({ available: 19, paid: 1 })] }));
test('UTCID10 accepts recorded transfer evidence and preserves its UTC instant', () => {
  const result = projectEarnings({ items: [item({ available: 19, paid: 1, transferRecordedAt: '2026-11-18T01:00:00Z' })] }, { userId: sitterId });
  expect(result.items[0].transferRecordedAt).toBe('2026-11-18T01:00:00.000Z');
});
