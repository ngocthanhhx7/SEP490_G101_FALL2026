import { expect, test } from '@jest/globals';
import { availabilityInput } from '../../src/validators/employee-scheduling.validator.js';

const valid = () => ({
  zone: 'Asia/Saigon',
  workingWindows: [{ weekday: 1, startLocalTime: '09:00', endLocalTime: '17:00' }],
  effectiveFrom: '2026-11-18',
  expectedVersion: 0,
});
const invalid = value => expect(() => availabilityInput(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

test('UTCID01 accepts a complete availability DTO', () => expect(availabilityInput(valid())).toEqual(valid()));

test.each([
  ['UTCID02', 'zone', undefined],
  ['UTCID03', 'workingWindows', undefined],
  ['UTCID04', 'effectiveFrom', undefined],
  ['UTCID05', 'expectedVersion', undefined],
])('%s rejects an own required field whose value is undefined', (_id, field, value) => {
  const input = { ...valid(), [field]: value };
  invalid(input);
});

test.each([
  ['UTCID06', 'zone'], ['UTCID07', 'workingWindows'], ['UTCID08', 'effectiveFrom'], ['UTCID09', 'expectedVersion']
])('%s rejects a missing required field', (_id, field) => {
  const input = valid();
  delete input[field];
  invalid(input);
});

test.each([
  ['UTCID10', null], ['UTCID11', 'dto'], ['UTCID12', []]
])('%s rejects an invalid DTO container', (_id, input) => invalid(input));

test('UTCID13 rejects an unexpected top-level field', () => invalid({ ...valid(), extra: true }));

test('UTCID14 rejects invalid field values with deep validation', () => {
  const input = { zone: null, workingWindows: 'any', effectiveFrom: false, expectedVersion: -1 };
  invalid(input);
});
