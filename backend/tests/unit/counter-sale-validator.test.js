import { test, expect } from '@jest/globals';
import { parseCounterCreate, parseCounterPreview, parseCounterPage, parseCounterProductQuery, parseCounterContact } from '../../src/validators/counter-sale.validator.js';
const id = 'ABCDEF0123456789ABCDEF01';
test('normalizes product and customer identifiers and allows an empty preview only', () => {
  expect(parseCounterCreate({ lines: [{ productId: id, quantity: 99 }], customerId: id })).toEqual({ lines: [{ productId: id.toLowerCase(), quantity: 99 }], customerId: id.toLowerCase() });
  expect(parseCounterPreview({ lines: [] })).toEqual({ lines: [] });
  expect(() => parseCounterCreate({ lines: [] })).toThrow();
});
test.each([null, [], { lines: null }, { lines: [{ productId: id, quantity: 1, unitPrice: 1 }] },
  { lines: [{ productId: id, quantity: 1 }, { productId: id.toLowerCase(), quantity: 2 }] }])('rejects malformed and duplicate draft %j', body => {
  expect(() => parseCounterCreate(body)).toThrow();
});
test('bounds page, search and contact without echoing private input', () => {
  expect(parseCounterPage({})).toEqual({ page: 1, limit: 20 });
  expect(parseCounterProductQuery({ search: '  Dây   dắt ', limit: '50' })).toEqual({ page: 1, limit: 50, search: 'Dây dắt' });
  for (const q of [{ unknown: 1 }, { search: [] }, { search: '\u0000private' }, { search: 'x'.repeat(101) }]) expect(() => parseCounterProductQuery(q)).toThrow();
  expect(() => parseCounterPage({ search: 'private' })).toThrow();
  expect(parseCounterContact({ contact: ' example@example.test ' })).toBe('example@example.test');
  for (const contact of ['', null, 'x'.repeat(255), 'private\u0000']) expect(() => parseCounterContact({ contact })).toThrow();
});
