import { formatCashTime } from '../../src/utils/counter-sale-format.js';
test('cash time uses Vietnam time independently of browser timezone and rejects invalid dates', () => {
  expect(formatCashTime('2026-11-08T03:20:00Z')).toBe('10:20');
  expect(formatCashTime('bad')).toBe('');
});
