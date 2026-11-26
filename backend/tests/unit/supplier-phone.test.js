import { describe, expect, test } from '@jest/globals';
import { parseSupplierPhone } from '../../src/validators/supplier-management.validator.js';

describe('SUP-IN-01 parseSupplierPhone (MSG03)', () => {
  test.each([
    ['0936452118', '0936452118'],
    ['0936 452 118', '0936452118'],
    [' 0936.452.118 ', '0936452118'],
    ['0936-452-118', '0936452118'],
    ['0 9 3 6 4 5 2 1 1 8', '0936452118'],
    ['0243825123', '0243825123']
  ])('normalizes valid phone %s', (raw, value) => {
    expect(parseSupplierPhone(raw)).toEqual({ value });
  });

  test.each(['+84936452118', '+84 936 452 118', '84936452118', '936452118', '09364521180', '024 3825 1234',
    '02438251234', '1936452118', '0936 452 11a', 'abc', '(0936) 452 118', '0936/452/118', '0936,452,118', 5, true, {}, []])
    ('rejects invalid phone %p', (raw) => {
      expect(parseSupplierPhone(raw)).toEqual({ error: 'INVALID' });
    });

  test.each([undefined, null, '', '   '])('treats absent phone %p as empty', (raw) => {
    expect(parseSupplierPhone(raw)).toEqual({ value: '' });
  });
});
