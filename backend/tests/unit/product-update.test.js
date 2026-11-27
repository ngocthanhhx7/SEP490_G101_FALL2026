import { describe, expect, test } from '@jest/globals';
import { parseUpdateProduct } from '../../src/validators/product-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };

describe('PRODUCT-IN-02 parseUpdateProduct', () => {
  test('normalizes one editable text field', () => {
    expect(parseUpdateProduct({ version: 2, name: ' Vòng cổ ' })).toEqual({ version: 2, name: 'Vòng cổ' });
  });
  test('normalizes formatted price and empty description', () => {
    expect(parseUpdateProduct({ version: 1, sellingPrice: '250.000', description: '' })).toEqual({ version: 1, sellingPrice: 250000, description: '' });
  });
  test('accepts several editable fields together', () => {
    expect(parseUpdateProduct({ version: 1, category: 'FOOD', petType: 'DOG', visible: true })).toEqual({ version: 1, category: 'FOOD', petType: 'DOG', visible: true });
  });
  test('accepts version zero and visible false', () => {
    expect(parseUpdateProduct({ version: 0, visible: false })).toEqual({ version: 0, visible: false });
  });
  test.each([{ name: 'A' }, { version: undefined, name: 'A' }])('rejects missing version %p', (body) => {
    expect(code(() => parseUpdateProduct(body))).toBe('VALIDATION_FAILED');
  });
  test.each([-1, 1.5, '1', null])('rejects invalid version %p', (version) => {
    expect(code(() => parseUpdateProduct({ version, name: 'A' }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a DTO with no changes', () => {
    expect(code(() => parseUpdateProduct({ version: 1 }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a client-supplied product code', () => {
    expect(code(() => parseUpdateProduct({ version: 1, code: 'SP-0001' }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a client-supplied stock value', () => {
    expect(code(() => parseUpdateProduct({ version: 1, stockOnHand: 3 }))).toBe('VALIDATION_FAILED');
  });
  test('rejects an unknown field', () => {
    expect(code(() => parseUpdateProduct({ version: 1, name: 'A', supplierId: 'x' }))).toBe('VALIDATION_FAILED');
  });
  test('rejects a non-boolean visible field', () => {
    expect(code(() => parseUpdateProduct({ version: 1, visible: 'true' }))).toBe('VALIDATION_FAILED');
  });
  test('collects invalid editable fields', () => {
    expect(fields(() => parseUpdateProduct({ version: 1, name: ' ', sellingPrice: 0 }))).toEqual({ name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' });
  });
});
