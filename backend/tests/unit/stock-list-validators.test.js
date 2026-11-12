import { test, expect } from '@jest/globals';
import { parseStockQuery, parseStockHistoryQuery, parseStockHistoryPosition } from '../../src/validators/stock-list.validator.js';

test('D-216 parses stock filters and bounded history paging without coercing arrays or objects', () => {
  expect(parseStockQuery()).toEqual({ tab: 'ALL', search: '', page: 1, limit: 20 });
  expect(parseStockQuery({ search: '  Hạt   cho chó ', tab: 'LOW_STOCK', page: '2', limit: '50' }))
    .toEqual({ tab: 'LOW_STOCK', search: 'Hạt cho chó', page: 2, limit: 50 });
  for (const query of [{ search: [] }, { search: 'a\u0000b' }, { tab: ['ALL'] }, { limit: '0' }, { search: 'x'.repeat(101) }]) {
    expect(() => parseStockQuery(query)).toThrow(expect.objectContaining({ status: 422, code: 'VALIDATION_FAILED' }));
  }
  expect(parseStockHistoryQuery()).toEqual({ limit: 20, cursor: undefined });
  expect(parseStockHistoryQuery({ limit: '50', cursor: 'abc_DEF-123' })).toEqual({ limit: 50, cursor: 'abc_DEF-123' });
  for (const query of [{ page: '1' }, { cursor: [] }, { cursor: '' }, { cursor: '!bad' }, { cursor: 'x'.repeat(513) }, { limit: '51' }]) {
    expect(() => parseStockHistoryQuery(query)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  }
});

test('checks the position decoded from a signed history cursor', () => {
  const position = { id: '665f1c0e2b7d4a0012345678', createdAt: '2026-11-08T00:00:00.000Z' };
  expect(parseStockHistoryPosition(position)).toEqual({ ...position, createdAt: new Date(position.createdAt) });
  for (const bad of [null, {}, { ...position, id: 'bad' }, { ...position, createdAt: null }, { ...position, createdAt: 'bad' }]) {
    expect(() => parseStockHistoryPosition(bad)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  }
});
