import { describe, expect, test } from '@jest/globals';
import { parseSupplierEmail } from '../../src/validators/supplier-management.validator.js';

describe('SUP-IN-02 parseSupplierEmail (MSG02)', () => {
  test('trims a valid email', () => {
    expect(parseSupplierEmail(' kinhdoanh@minhanpet.vn ')).toEqual({ value: 'kinhdoanh@minhanpet.vn' });
  });

  test.each([undefined, null, '', '  '])('treats absent email %p as empty', (raw) => {
    expect(parseSupplierEmail(raw)).toEqual({ value: '' });
  });

  test.each(['not-an-email', 'a@b', '@example.test', 'a b@example.test', 'a@@example.test', `${'x'.repeat(250)}@example.test`, 7, {}])
    ('rejects invalid email %p', (raw) => {
      expect(parseSupplierEmail(raw)).toEqual({ error: 'INVALID' });
    });
});
