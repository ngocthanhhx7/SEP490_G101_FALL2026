import { describe, expect, test } from '@jest/globals';
import { parseUpdateSupplier } from '../../src/validators/supplier-management.validator.js';
import { supplierNameKey } from '../../src/utils/supplier-name.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };

describe('SUP-IN-04 parseUpdateSupplier (AC-30)', () => {
  test('normalizes each editable field and preserves version', () => {
    expect(parseUpdateSupplier({ version: 2, contactName: ' Mới ' })).toEqual({ version: 2, contactName: 'Mới' });
    expect(parseUpdateSupplier({ version: 0, name: 'Hoà Bình' })).toEqual({ version: 0, name: 'Hoà Bình', nameKey: supplierNameKey('Hòa Bình') });
    expect(parseUpdateSupplier({ version: 1, phone: '', email: '', productIds: [] })).toEqual({ version: 1, phone: '', email: '', productIds: [] });
  });

  test.each([{ name: 'A' }, { version: -1, name: 'A' }, { version: 1.5, name: 'A' }, { version: '1', name: 'A' }, { version: 1 },
    { version: 1, status: 'STOPPED' }, { version: 1, nameKey: 'x' }, { version: 1, code: 'x' }])('rejects invalid update DTO %p', (body) => {
    expect(code(() => parseUpdateSupplier(body))).toBe('VALIDATION_FAILED');
  });

  test('collects malformed editable fields', () => {
    expect(fields(() => parseUpdateSupplier({ version: 1, name: ' ', phone: 'x' }))).toEqual({ name: 'REQUIRED', phone: 'INVALID' });
  });
});
