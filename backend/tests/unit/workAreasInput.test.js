import { expect, test } from '@jest/globals';
import { workAreasInput } from '../../src/validators/employee-scheduling.validator.js';

const valid = () => ({ areas: ['DISTRICT_Q1'], expectedVersion: 0 });
const invalid = value => expect(() => workAreasInput(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

test('UTCID01 accepts a complete work-area DTO', () => expect(workAreasInput(valid())).toEqual(valid()));

test.each([
  ['UTCID02', 'areas'], ['UTCID03', 'expectedVersion']
])('%s rejects a missing required field', (_id, field) => {
  const input = valid();
  delete input[field];
  invalid(input);
});

test.each([
  ['UTCID04', 'areas'], ['UTCID05', 'expectedVersion']
])('%s rejects an own required field whose value is undefined', (_id, field) => {
  const input = { ...valid(), [field]: undefined };
  invalid(input);
});

test.each([
  ['UTCID06', null], ['UTCID07', 'dto'], ['UTCID08', []]
])('%s rejects an invalid DTO container', (_id, input) => invalid(input));

test('UTCID09 rejects an unexpected top-level field', () => invalid({ ...valid(), extra: true }));

test('UTCID10 rejects invalid areas and version values', () => {
  const input = { areas: 'not-an-array', expectedVersion: -1 };
  invalid(input);
});
