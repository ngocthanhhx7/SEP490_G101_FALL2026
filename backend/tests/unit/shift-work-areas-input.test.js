import { expect, test } from '@jest/globals';
import { workAreasInput } from '../../src/validators/employee-scheduling.validator.js';

const valid = () => ({ areas: ['DISTRICT_Q1'], expectedVersion: 0 });
const invalid = value => expect(() => workAreasInput(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

test('UTCID01 accepts a complete work-area DTO', () => {
  expect(workAreasInput(valid())).toEqual(valid());
});

test('UTCID02 accepts an explicit empty selection', () => {
  expect(workAreasInput({ areas: [], expectedVersion: 0 })).toEqual({ areas: [], expectedVersion: 0 });
});

test('UTCID03 accepts duplicate codes for downstream canonicalization', () => {
  const value = { areas: ['DISTRICT_Q1', 'DISTRICT_Q1'], expectedVersion: 0 };
  expect(workAreasInput(value)).toEqual(value);
});

test.each([
  ['UTCID04 rejects null DTO', null],
  ['UTCID05 rejects array DTO', []],
  ['UTCID06 rejects missing areas', { expectedVersion: 0 }],
  ['UTCID07 rejects missing expectedVersion', { areas: ['DISTRICT_Q1'] }],
  ['UTCID08 rejects an unexpected field', { ...valid(), extra: true }],
  ['UTCID09 rejects null areas', { ...valid(), areas: null }],
  ['UTCID10 rejects object areas', { ...valid(), areas: {} }],
  ['UTCID11 rejects string areas', { ...valid(), areas: 'DISTRICT_Q1' }],
  ['UTCID12 rejects numeric area code', { ...valid(), areas: [42] }],
  ['UTCID13 rejects empty area code', { ...valid(), areas: [''] }],
  ['UTCID14 rejects null expectedVersion', { ...valid(), expectedVersion: null }],
  ['UTCID15 rejects negative expectedVersion', { ...valid(), expectedVersion: -1 }],
  ['UTCID16 rejects decimal expectedVersion', { ...valid(), expectedVersion: 1.5 }],
  ['UTCID17 rejects string expectedVersion', { ...valid(), expectedVersion: '0' }],
])('%s', (_name, value) => invalid(value));

test('UTCID18 accepts the largest safe expectedVersion because no upper bound is specified', () => {
  const value = { ...valid(), expectedVersion: Number.MAX_SAFE_INTEGER };
  expect(workAreasInput(value)).toEqual(value);
});
