import { expect, test } from '@jest/globals';
import { invitationInput } from '../../src/validators/employee-scheduling.validator.js';

const sitterId = '507f1f77bcf86cd799439011';
const invalid = value => expect(() => invitationInput(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

test('UTCID01 accepts a DTO with only the required expectedVersion', () => {
  expect(invitationInput({ expectedVersion: 0 })).toEqual({ expectedVersion: 0 });
});
test('UTCID02 accepts an optional valid sitterId', () => {
  expect(invitationInput({ expectedVersion: 1_000_000, sitterId })).toEqual({ expectedVersion: 1_000_000, sitterId });
});

test.each([
  ['UTCID03', null], ['UTCID04', 'dto'], ['UTCID05', []]
])('%s rejects an invalid DTO container', (_id, value) => invalid(value));

test.each([
  ['UTCID06', {}], ['UTCID07', { expectedVersion: undefined }]
])('%s rejects missing or undefined expectedVersion', (_id, value) => invalid(value));

test.each([
  ['UTCID08', null], ['UTCID09', -1], ['UTCID10', 1.5], ['UTCID11', '0'], ['UTCID12', 1_000_001]
])('%s rejects an invalid expectedVersion value', (_id, expectedVersion) => invalid({ expectedVersion }));

test('UTCID13 rejects an unexpected top-level field', () => invalid({ expectedVersion: 0, extra: true }));

test('UTCID14 accepts a missing optional sitterId', () => expect(invitationInput({ expectedVersion: 0 })).toEqual({ expectedVersion: 0 }));
test('UTCID15 accepts an undefined optional sitterId', () => {
  const input = { expectedVersion: 0, sitterId: undefined };
  expect(invitationInput(input)).toBe(input);
});

test.each([
  ['UTCID16', null], ['UTCID17', ''], ['UTCID18', 'not-an-object-id'], ['UTCID19', 42], ['UTCID20', []]
])('%s rejects an invalid sitterId value', (_id, sitterId) => invalid({ expectedVersion: 0, sitterId }));

test('UTCID21 accepts the expectedVersion upper boundary', () => {
  expect(invitationInput({ expectedVersion: 1_000_000 })).toEqual({ expectedVersion: 1_000_000 });
});

test('UTCID22 rejects a non-safe integer expectedVersion', () => invalid({ expectedVersion: Number.MAX_SAFE_INTEGER + 1 }));
