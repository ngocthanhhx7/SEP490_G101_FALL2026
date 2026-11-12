import { parseAcceptedInput, parseReceivedInput, rejectedOf, validateReceiptForm } from '../../src/utils/goods-receipt-validation.js';
import { formatDay } from '../../src/utils/product-format.js';

test('MSG113: a quantity received is a whole number from 1 to the limit', () => {
  expect(parseReceivedInput('10')).toEqual({ value: 10 });
  expect(parseReceivedInput(' 100000 ')).toEqual({ value: 100000 });
  for (const typed of ['0', '-1', '1.5', '1,5', 'abc', '', '  ', undefined, null, '+5', '1e3']) expect(parseReceivedInput(typed)).toEqual({ error: 'INVALID' });
  expect(parseReceivedInput('100001')).toEqual({ error: 'TOO_LARGE' });
});

test('MSG119: a quantity taken into the shop is a whole number from 0 to the quantity received; empty is wrong', () => {
  expect(parseAcceptedInput('0', 10)).toEqual({ value: 0 });
  expect(parseAcceptedInput('10', 10)).toEqual({ value: 10 });
  expect(parseAcceptedInput('7')).toEqual({ value: 7 });
  for (const typed of ['11', '-1', '2.5', 'x', '', ' ', undefined]) expect(parseAcceptedInput(typed, 10)).toEqual({ error: 'INVALID' });
  expect(parseAcceptedInput('100001')).toEqual({ error: 'INVALID' });
});

test('the rejected quantity is worked out, and unknown while a number is not valid yet', () => {
  expect(rejectedOf({ received: '12', accepted: '10' })).toBe(2);
  expect(rejectedOf({ received: '12', accepted: '12' })).toBe(0);
  expect(rejectedOf({ received: '8', accepted: '0' })).toBe(8);
  for (const line of [{ received: '', accepted: '1' }, { received: '5', accepted: '' }, { received: '5', accepted: '6' }, { received: '0', accepted: '0' }]) {
    expect(rejectedOf(line)).toBeUndefined();
  }
});

describe('validateReceiptForm', () => {
  const supplierId = 's1';
  const ok = { product: { id: 'p1' }, received: '10', accepted: '10', reason: '' };

  test('a good form has no errors, and a reason is not needed where nothing is rejected', () => {
    expect(validateReceiptForm({ supplierId, lines: [ok, { ...ok, accepted: '7', reason: 'Hỏng' }] })).toEqual({ fields: {}, lineFields: {} });
  });

  test('reports the supplier and the lines as a whole', () => {
    expect(validateReceiptForm({ supplierId: '', lines: [ok] }).fields).toEqual({ supplierId: 'REQUIRED' });
    expect(validateReceiptForm({ supplierId, lines: [] }).fields).toEqual({ lines: 'REQUIRED' });
    expect(validateReceiptForm({ supplierId, lines: Array.from({ length: 51 }, () => ok) }).fields).toEqual({ lines: 'TOO_MANY' });
  });

  test('reports each wrong line by number: MSG113, MSG119, MSG120', () => {
    const found = validateReceiptForm({ supplierId, lines: [
      ok, { ...ok, received: '0', accepted: '' }, { ...ok, accepted: '11' }, { ...ok, accepted: '4', reason: '  ' }, { ...ok, received: '100001', accepted: '1' }
    ] });
    expect(found.lineFields).toEqual({
      1: { quantityReceived: 'INVALID', quantityAccepted: 'INVALID' },
      2: { quantityAccepted: 'INVALID' },
      3: { rejectReason: 'REQUIRED' },
      4: { quantityReceived: 'TOO_LARGE' }
    });
  });
});

test('formatDay writes a stored day as dd/mm/yyyy and leaves anything else as it was', () => {
  expect(formatDay('2026-11-04')).toBe('04/11/2026');
  expect(formatDay('hôm nay')).toBe('hôm nay');
  expect(formatDay(undefined)).toBe('');
  expect(formatDay(5)).toBe('');
});
