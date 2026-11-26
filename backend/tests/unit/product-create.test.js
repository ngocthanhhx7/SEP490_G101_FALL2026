import { describe, expect, test } from '@jest/globals';
import { parseCreateProduct } from '../../src/validators/product-management.validator.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };
const body = (over = {}) => ({ name: '  Vòng cổ  ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: '60.000', ...over });

describe('PRODUCT-IN-01 parseCreateProduct', () => {
  test('accepts required fields, trims name and defaults description', () => {
    expect(parseCreateProduct(body())).toEqual({ name: 'Vòng cổ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 60000, description: '' });
  });
  test('normalizes a multiline description and grouped VND price', () => {
    expect(parseCreateProduct(body({ description: ' Dòng 1\r\nDòng 2 ' }))).toEqual({ name: 'Vòng cổ', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 60000, description: 'Dòng 1\nDòng 2' });
  });
  test('accepts published upper boundaries', () => {
    expect(parseCreateProduct(body({ name: 'n'.repeat(200), description: 'd'.repeat(4000), sellingPrice: 100000000 }))).toMatchObject({ sellingPrice: 100000000 });
  });
  test('collects missing required product fields', () => {
    expect(fields(() => parseCreateProduct({}))).toEqual({ name: 'REQUIRED', category: 'REQUIRED', petType: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' });
  });
  test('collects invalid category, pet type and price fields', () => {
    expect(fields(() => parseCreateProduct(body({ category: 'TOYS', petType: 'BIRD', sellingPrice: 0 })))).toEqual({ category: 'INVALID', petType: 'INVALID', sellingPrice: 'WHOLE_NUMBER' });
  });
  test('collects invalid name and description types', () => {
    expect(fields(() => parseCreateProduct(body({ name: 1, description: 1 })))).toEqual({ name: 'INVALID', description: 'INVALID' });
  });
  test('rejects prices that are non-positive, fractional or non-numeric', () => {
    for (const sellingPrice of [0, -1, 1.5, '1.5', '250,000']) expect(fields(() => parseCreateProduct(body({ sellingPrice })))).toEqual({ sellingPrice: 'WHOLE_NUMBER' });
  });
  test('collects fields that exceed documented lengths or price maximum', () => {
    expect(fields(() => parseCreateProduct(body({ name: 'n'.repeat(201), description: 'd'.repeat(4001), sellingPrice: 100000001 })))).toEqual({ name: 'TOO_LONG', sellingPrice: 'TOO_LARGE', description: 'TOO_LONG' });
  });
  test('rejects a client-supplied product code', () => {
    expect(code(() => parseCreateProduct(body({ code: 'SP-0001' })))).toBe('VALIDATION_FAILED');
  });
  test('rejects a client-supplied stock value', () => {
    expect(code(() => parseCreateProduct(body({ stockOnHand: 1 })))).toBe('VALIDATION_FAILED');
  });
  test.each([{ visible: true }, { version: 0 }, { supplierId: 'x' }])('rejects other unknown fields %p', (extra) => {
    expect(code(() => parseCreateProduct(body(extra)))).toBe('VALIDATION_FAILED');
  });
  test.each([undefined, null, [], 'body'])('rejects a non-object body %p', (input) => {
    expect(code(() => parseCreateProduct(input))).toBe('VALIDATION_FAILED');
  });
});
