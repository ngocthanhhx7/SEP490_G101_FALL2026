import { describe, expect, test } from '@jest/globals';
import { parseSupplierVersion } from '../../src/validators/supplier-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };

describe('SUP-IN-05 parseSupplierVersion', () => {
  test.each([0, 3, Number.MAX_SAFE_INTEGER])('accepts non-negative safe integer version %p', (version) => {
    expect(parseSupplierVersion({ version })).toBe(version);
  });

  test.each([undefined, null, {}, { version: -1 }, { version: 1.5 }, { version: '1' }, { version: 1, name: 'A' }, { version: Number.MAX_SAFE_INTEGER + 1 }])
    ('rejects invalid version DTO %p', (body) => {
      expect(code(() => parseSupplierVersion(body))).toBe('VALIDATION_FAILED');
    });
});
