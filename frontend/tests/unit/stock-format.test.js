import { formatStockQuantity, formatStockDelta } from '../../src/utils/stock-format.js';

test('formats whole stock quantities and signed history deltas including +0', () => {
  expect(formatStockQuantity(1234)).toBe('1.234');
  expect(formatStockDelta(0)).toBe('+0');
  expect(formatStockDelta(12)).toBe('+12');
  expect(formatStockDelta(-2)).toBe('-2');
});
