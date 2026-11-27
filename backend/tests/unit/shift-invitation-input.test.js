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
  ['UTCID03 rejects null DTO', null],
  ['UTCID04 rejects array DTO', []],
  ['UTCID05 rejects missing expectedVersion', {}],
  ['UTCID06 rejects an unexpected field', { expectedVersion: 0, extra: true }],
  ['UTCID07 rejects null expectedVersion', { expectedVersion: null }],
  ['UTCID08 rejects negative expectedVersion', { expectedVersion: -1 }],
  ['UTCID09 rejects decimal expectedVersion', { expectedVersion: 1.5 }],
  ['UTCID10 rejects string expectedVersion', { expectedVersion: '0' }],
  ['UTCID11 rejects expectedVersion above the maximum', { expectedVersion: 1_000_001 }],
  ['UTCID12 rejects null sitterId', { expectedVersion: 0, sitterId: null }],
  ['UTCID13 rejects empty sitterId', { expectedVersion: 0, sitterId: '' }],
  ['UTCID14 rejects malformed sitterId', { expectedVersion: 0, sitterId: 'not-an-object-id' }],
  ['UTCID15 rejects numeric sitterId', { expectedVersion: 0, sitterId: 42 }],
])('%s', (_name, value) => invalid(value));
