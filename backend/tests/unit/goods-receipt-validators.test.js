import { describe, test, expect } from '@jest/globals';
import {
  parseCreateReceipt, parseReceiptCode, parseRecentReceiptsQuery, parseReceiptProductQuery
} from '../../src/validators/goods-receipt.validator.js';
import { vietnamDate } from '../../src/utils/vietnam-date.js';

const SUPPLIER = 'a'.repeat(24);
const PRODUCT = 'b'.repeat(24);
const one = (over = {}) => ({ productId: PRODUCT, quantityReceived: 10, quantityAccepted: 10, ...over });
const failure = (body) => {
  try { parseCreateReceipt(body); } catch (error) { return error; }
  throw new Error('expected a validation error');
};

describe('parseCreateReceipt', () => {
  test('a good receipt gets its rejected quantity worked out, and a reason only where goods were rejected', () => {
    const parsed = parseCreateReceipt({ supplierId: SUPPLIER, lines: [one(), one({ productId: 'c'.repeat(24), quantityAccepted: 7, rejectReason: '  Bao bì rách  ' })] });
    expect(parsed).toEqual({ supplierId: SUPPLIER, lines: [
      { productId: PRODUCT, quantityReceived: 10, quantityAccepted: 10, quantityRejected: 0, rejectReason: '' },
      { productId: 'c'.repeat(24), quantityReceived: 10, quantityAccepted: 7, quantityRejected: 3, rejectReason: 'Bao bì rách' }
    ] });
  });

  test('a reason on a line that rejects nothing is dropped, even a wrong one', () => {
    expect(parseCreateReceipt({ supplierId: SUPPLIER, lines: [one({ rejectReason: 42 })] }).lines[0].rejectReason).toBe('');
  });

  test('the same product in two lines is DUPLICATE whatever the letter case of the id', () => {
    const error = failure({ supplierId: SUPPLIER, lines: [one({ productId: 'AB'.repeat(12) }), one({ productId: 'ab'.repeat(12) })] });
    expect(error.details.lineFields).toEqual({ 1: { productId: 'DUPLICATE' } });
  });

  test('all wrong fields come back together, by field and by line number', () => {
    const error = failure({ supplierId: 'nope', lines: [one({ quantityReceived: 0 }), one({ productId: 'c'.repeat(24), quantityAccepted: 4 })] });
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual({ fields: { supplierId: 'INVALID' }, lineFields: { 0: { quantityReceived: 'INVALID' }, 1: { rejectReason: 'REQUIRED' } } });
  });

  test('a quantity above the limit is TOO_LARGE, and an accepted quantity above the limit is INVALID', () => {
    const error = failure({ supplierId: SUPPLIER, lines: [one({ quantityReceived: 100001, quantityAccepted: 100001 })] });
    expect(error.details.lineFields[0]).toEqual({ quantityReceived: 'TOO_LARGE', quantityAccepted: 'INVALID' });
  });

  test('a line must be a plain object with only the allowed keys', () => {
    for (const line of [null, 'x', [], 5, { ...one(), quantityRejected: 1 }]) {
      expect(failure({ supplierId: SUPPLIER, lines: [line] }).details.lineFields).toEqual({ 0: { productId: 'INVALID' } });
    }
  });

  test('the body must be an object with only supplierId and lines', () => {
    for (const body of [null, 'x', [], { supplierId: SUPPLIER, lines: [one()], code: 'PN-1' }, { lines: [one()], extra: 1 }]) {
      expect(() => parseCreateReceipt(body)).toThrow(expect.objectContaining({ status: 422 }));
    }
  });
});

describe('queries and codes', () => {
  test('the product search keeps a trimmed search, the page, and at most ten results', () => {
    expect(parseReceiptProductQuery({ search: '  Thức   ăn ', page: '2', limit: '50' })).toEqual({ search: 'Thức ăn', page: 2, limit: 10 });
    expect(parseReceiptProductQuery({})).toEqual({ page: 1, limit: 10 });
    expect(parseReceiptProductQuery({ search: '   ' })).toEqual({ page: 1, limit: 10 });
    expect(parseReceiptProductQuery({ limit: '3' }).limit).toBe(3);
    for (const query of [{ category: 'FOOD' }, { search: 5 }, { search: 'x'.repeat(101) }, { search: 'a\u0000b' }]) {
      expect(() => parseReceiptProductQuery(query)).toThrow(expect.objectContaining({ status: 422 }));
    }
  });

  test('the recent list takes no query', () => {
    expect(() => parseRecentReceiptsQuery()).not.toThrow();
    expect(() => parseRecentReceiptsQuery({})).not.toThrow();
    expect(() => parseRecentReceiptsQuery({ page: '1' })).toThrow(expect.objectContaining({ status: 422 }));
  });

  test('a receipt code has PN- and at least four digits, and nothing else', () => {
    for (const code of ['PN-0001', 'PN-9999', 'PN-10000', 'PN-123456']) expect(parseReceiptCode(code)).toBe(code);
    for (const code of ['PN-1', 'PN-001', 'pn-0001', 'PN-0001 ', 'PN-00a1', 'SP-0012', '', undefined, 7]) expect(parseReceiptCode(code)).toBeNull();
  });
});

describe('vietnamDate', () => {
  test('is the calendar day in Vietnam, which is seven hours ahead of UTC', () => {
    expect(vietnamDate(new Date('2026-11-04T16:59:59Z'))).toBe('2026-11-04');
    expect(vietnamDate(new Date('2026-11-04T17:00:00Z'))).toBe('2026-11-05');
    expect(vietnamDate(Date.parse('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
});
