import { test, expect } from '@jest/globals';
import { parseStockAdjustment, parseAdjustmentQuery, parseAdjustmentProductQuery } from '../../src/validators/stock-adjustment.validator.js';

const body = { productId: '665f1c0e2b7d4a0012345678', type: 'DECREASE', quantity: 1, reason: 'DAMAGED' };
test('AC-33 D-266 validates mandatory reason independently of adjustment direction', () => {
  for (const type of ['INCREASE', 'DECREASE']) for (const reason of ['DAMAGED', 'LOST', 'INTERNAL_USE', 'RECEIPT_CORRECTION']) {
    expect(parseStockAdjustment({ ...body, type, reason })).toEqual({ ...body, type, reason });
  }
  for (const changes of [{ reason: undefined }, { reason: '' }, { reason: 'other' }, { type: undefined }, { quantity: undefined },
    { productId: undefined }, { productId: 'bad' }, { quantity: 0 }, { quantity: -1 }, { quantity: 1.1 }, { quantity: '1' }, { quantity: 100001 }]) {
    expect(() => parseStockAdjustment({ ...body, ...changes })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  }
  for (const value of [null, [], { ...body, stockOnHand: 12 }]) expect(() => parseStockAdjustment(value)).toThrow();
});
test('uses bounded list paging and normalized literal picker search', () => {
  expect(parseAdjustmentQuery()).toEqual({ page: 1, limit: 20 });
  expect(parseAdjustmentProductQuery({ search: '  Hạt   chó ', limit: '10' })).toEqual({ page: 1, limit: 10, search: 'Hạt chó' });
  for (const query of [{ search: [] }, { search: 'x'.repeat(101) }, { search: 'x\u0000' }, { unknown: 'x' }]) {
    expect(() => parseAdjustmentProductQuery(query)).toThrow();
  }
  expect(() => parseAdjustmentQuery({ search: 'x' })).toThrow();
});
