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

test('UTCID02 accepts an overnight working window', () => {
  const value = { ...valid(), workingWindows: [{ weekday: 1, startLocalTime: '22:00', endLocalTime: '02:00' }] };
  expect(availabilityInput(value)).toEqual(value);
});

test.each([
  ['UTCID03 rejects null DTO', null],
  ['UTCID04 rejects array DTO', []],
  ['UTCID05 rejects missing zone', { ...valid(), zone: undefined }],
  ['UTCID06 rejects missing workingWindows', { ...valid(), workingWindows: undefined }],
  ['UTCID07 rejects missing effectiveFrom', { ...valid(), effectiveFrom: undefined }],
  ['UTCID08 rejects missing expectedVersion', { ...valid(), expectedVersion: undefined }],
  ['UTCID09 rejects an unexpected field', { ...valid(), extra: true }],
  ['UTCID10 rejects empty zone', { ...valid(), zone: '' }],
  ['UTCID11 rejects null zone', { ...valid(), zone: null }],
  ['UTCID12 rejects numeric zone', { ...valid(), zone: 42 }],
  ['UTCID13 rejects unsupported zone', { ...valid(), zone: 'UTC' }],
  ['UTCID14 rejects null workingWindows', { ...valid(), workingWindows: null }],
  ['UTCID15 rejects object workingWindows', { ...valid(), workingWindows: {} }],
  ['UTCID16 rejects string workingWindows', { ...valid(), workingWindows: 'weekday' }],
  ['UTCID17 rejects weekday below range', { ...valid(), workingWindows: [{ weekday: 0, startLocalTime: '09:00', endLocalTime: '17:00' }] }],
  ['UTCID18 rejects null effectiveFrom', { ...valid(), effectiveFrom: null }],
  ['UTCID19 rejects numeric effectiveFrom', { ...valid(), effectiveFrom: 42 }],
  ['UTCID20 rejects impossible effectiveFrom date', { ...valid(), effectiveFrom: '2026-02-30' }],
  ['UTCID21 rejects wrongly formatted effectiveFrom', { ...valid(), effectiveFrom: '18/11/2026' }],
  ['UTCID22 rejects null expectedVersion', { ...valid(), expectedVersion: null }],
  ['UTCID23 rejects negative expectedVersion', { ...valid(), expectedVersion: -1 }],
  ['UTCID24 rejects decimal expectedVersion', { ...valid(), expectedVersion: 1.5 }],
  ['UTCID25 rejects string expectedVersion', { ...valid(), expectedVersion: '0' }],
])('%s', (_name, value) => invalid(value));

test('UTCID26 accepts the largest safe expectedVersion because no upper bound is specified', () => {
  const value = { ...valid(), expectedVersion: Number.MAX_SAFE_INTEGER };
  expect(availabilityInput(value)).toEqual(value);
});
