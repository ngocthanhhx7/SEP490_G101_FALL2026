import { describe, test, expect } from '@jest/globals';
import {
  parseAdminProductQuery, parseCreateProduct, parseUpdateProduct, parseSellingPrice
} from '../../src/validators/product-management.validator.js';
import { parsePageQuery, PAGE_QUERY_KEYS } from '../../src/validators/pagination.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };

describe('parsePageQuery (shared by the paged Admin lists)', () => {
  test('starts at page 1 with 20 items and accepts up to 50', () => {
    expect(parsePageQuery({})).toEqual({ page: 1, limit: 20 });
    expect(parsePageQuery({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
    expect(PAGE_QUERY_KEYS).toEqual(['page', 'limit']);
  });

  test('rejects a page or limit that is not a whole number in range', () => {
    for (const query of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'x' }, { page: 2 }, { page: '1000000' },
      { limit: '0' }, { limit: '51' }, { limit: 'x' }, { limit: 20 }]) {
      expect(code(() => parsePageQuery(query))).toBe('VALIDATION_FAILED');
    }
  });

  test('a list can set its own default and maximum', () => {
    expect(parsePageQuery({}, { defaultLimit: 10, maxLimit: 25 })).toEqual({ page: 1, limit: 10 });
    expect(code(() => parsePageQuery({ limit: '26' }, { defaultLimit: 10, maxLimit: 25 }))).toBe('VALIDATION_FAILED');
  });
});

describe('parseAdminProductQuery', () => {
  test('normalises the search text and keeps the filters and page', () => {
    expect(parseAdminProductQuery({})).toEqual({ page: 1, limit: 20 });
    expect(parseAdminProductQuery({ search: '  Dây   dắt ', category: 'ACCESSORY', petType: 'DOG', page: '2', limit: '10' }))
      .toEqual({ search: 'Dây dắt', category: 'ACCESSORY', petType: 'DOG', page: 2, limit: 10 });
    expect(parseAdminProductQuery({ search: '   ' })).toEqual({ page: 1, limit: 20 });
  });

  test('rejects unknown keys and values', () => {
    for (const query of [{ visible: 'true' }, { category: 'TOYS' }, { petType: 'BIRD' }, { search: ['a'] }, { search: 'a'.repeat(101) }, { search: 'a\u0007' }]) {
      expect(code(() => parseAdminProductQuery(query))).toBe('VALIDATION_FAILED');
    }
  });
});

describe('parseSellingPrice (AC-29)', () => {
  test('takes a whole number above 0 as a number or as 250000 or 250.000', () => {
    for (const [raw, value] of [[250000, 250000], ['250000', 250000], ['250.000', 250000], [' 1.000.000 ', 1000000], [1, 1], ['999', 999], [100000000, 100000000]]) {
      expect(parseSellingPrice(raw)).toEqual({ value });
    }
  });

  test('anything else is MSG113 (WHOLE_NUMBER)', () => {
    for (const raw of [undefined, null, '', ' ', 0, '0', -1, '-1', 1.5, '1.5', '12.5', '1.00', '1.0000', '.500', '1..000', '250,000', 'abc', 'e5', '0250', true, {}, []]) {
      expect(parseSellingPrice(raw)).toEqual({ error: 'WHOLE_NUMBER' });
    }
  });

  test('above 100.000.000 is TOO_LARGE, not MSG113', () => {
    for (const raw of [100000001, '100000001', '100.000.001', '1000000000000000', Number.MAX_SAFE_INTEGER]) {
      expect(parseSellingPrice(raw)).toEqual({ error: 'TOO_LARGE' });
    }
  });
});

describe('parseCreateProduct (AC-29)', () => {
  const body = (over = {}) => ({ name: ' Vòng cổ ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: '60.000', ...over });

  test('trims, normalises the price and defaults an empty description', () => {
    expect(parseCreateProduct(body())).toEqual({ name: 'Vòng cổ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 60000, description: '' });
    expect(parseCreateProduct(body({ description: ' Dòng 1\r\nDòng 2 ' })).description).toBe('Dòng 1\nDòng 2');
  });

  test('reports every wrong field at once, with the reason that picks the message', () => {
    expect(fields(() => parseCreateProduct({ sellingPrice: 'x', petType: 'BIRD' })))
      .toEqual({ name: 'REQUIRED', category: 'REQUIRED', petType: 'INVALID', sellingPrice: 'WHOLE_NUMBER' });
    expect(fields(() => parseCreateProduct(body({ name: 'x'.repeat(201), description: 'y'.repeat(4001) })))).toEqual({ name: 'TOO_LONG', description: 'TOO_LONG' });
    expect(fields(() => parseCreateProduct(body({ name: 5, description: 5 })))).toEqual({ name: 'INVALID', description: 'INVALID' });
  });

  test('refuses a code, stock, Hidden state or any other key', () => {
    for (const extra of [{ code: 'SP-1' }, { stockOnHand: 1 }, { visible: true }, { version: 0 }]) {
      expect(code(() => parseCreateProduct(body(extra)))).toBe('VALIDATION_FAILED');
    }
    for (const bad of [undefined, null, [], 'x']) expect(code(() => parseCreateProduct(bad))).toBe('VALIDATION_FAILED');
  });
});

describe('parseUpdateProduct (AC-29)', () => {
  test('needs the version and takes any editable field, leaving the others out', () => {
    expect(parseUpdateProduct({ version: 2, name: ' Mới ' })).toEqual({ version: 2, name: 'Mới' });
    expect(parseUpdateProduct({ version: 0, visible: false })).toEqual({ version: 0, visible: false });
    expect(parseUpdateProduct({ version: 1, sellingPrice: '250.000', description: '' })).toEqual({ version: 1, sellingPrice: 250000, description: '' });
  });

  test('rejects a missing or bad version, nothing to change, other keys and wrong values', () => {
    for (const bad of [{ name: 'A' }, { version: -1, name: 'A' }, { version: 1.5, name: 'A' }, { version: '1', name: 'A' }, { version: 1 },
      { version: 1, code: 'SP-1' }, { version: 1, stockOnHand: 3 }, { version: 1, visible: 'yes' }]) {
      expect(code(() => parseUpdateProduct(bad))).toBe('VALIDATION_FAILED');
    }
    expect(fields(() => parseUpdateProduct({ version: 1, name: ' ', sellingPrice: 0 }))).toEqual({ name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' });
  });
});
