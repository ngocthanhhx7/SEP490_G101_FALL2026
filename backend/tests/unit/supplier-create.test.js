import { describe, expect, test } from '@jest/globals';
import { parseCreateSupplier } from '../../src/validators/supplier-management.validator.js';
import { supplierNameKey } from '../../src/utils/supplier-name.js';

const ID = '665f1c0e2b7d4a0012345678';
const OTHER_ID = '665f1c0e2b7d4a0012345679';
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };
const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const body = (over = {}) => ({ name: ' Công  ty  Hoà Bình ', contactName: ' Lương Thị Hoa ', phone: '0904 778 120', email: 'a@example.test', ...over });

describe('SUP-IN-03 parseCreateSupplier (AC-30)', () => {
  test('normalizes a complete DTO', () => {
    expect(parseCreateSupplier(body())).toEqual({ name: 'Công ty Hoà Bình', nameKey: supplierNameKey('Công ty Hòa Bình'), contactName: 'Lương Thị Hoa',
      phone: '0904778120', email: 'a@example.test', productIds: [] });
  });

  test.each([{ name: 'A', phone: '0904778120' }, { name: 'A', email: 'a@example.test' }])('accepts either contact %p', (input) => {
    expect(parseCreateSupplier(input)).toMatchObject({ name: 'A' });
  });

  test('collects invalid fields and applies MSG125 only when contacts are absent', () => {
    expect(fields(() => parseCreateSupplier({ name: ' ', phone: 'x', email: 'y', contactName: 'z'.repeat(101) })))
      .toEqual({ name: 'REQUIRED', contactName: 'TOO_LONG', phone: 'INVALID', email: 'INVALID' });
    expect(fields(() => parseCreateSupplier({ name: 'A' }))).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    expect(fields(() => parseCreateSupplier({ name: 'A', phone: '', email: 'bad' }))).toEqual({ email: 'INVALID' });
  });

  test('deduplicates products and rejects malformed or excessive product IDs', () => {
    expect(parseCreateSupplier(body({ productIds: [ID, OTHER_ID, ID] })).productIds).toEqual([ID, OTHER_ID]);
    for (const productIds of [['x'], [5], 'x']) expect(fields(() => parseCreateSupplier(body({ productIds })))).toEqual({ productIds: 'INVALID' });
    expect(fields(() => parseCreateSupplier(body({ productIds: new Array(201).fill(ID) })))).toEqual({ productIds: 'TOO_MANY' });
  });

  test('enforces name boundary and refuses system or non-object fields', () => {
    expect(parseCreateSupplier(body({ name: 'x'.repeat(200) })).name).toHaveLength(200);
    expect(fields(() => parseCreateSupplier(body({ name: 'x'.repeat(201) })))).toEqual({ name: 'TOO_LONG' });
    for (const extra of [{ status: 'STOPPED' }, { version: 0 }, { nameKey: 'x' }, { id: 'x' }, undefined, null, [], 'x']) {
      expect(code(() => parseCreateSupplier(extra === undefined || extra === null || Array.isArray(extra) || typeof extra === 'string' ? extra : body(extra)))).toBe('VALIDATION_FAILED');
    }
  });
});
