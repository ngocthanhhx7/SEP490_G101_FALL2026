import { expect, test } from '@jest/globals';
import { validateServiceLocations } from '../../src/services/counter-booking/service-location-management.service.js';

const valid = { expectedVersion: 1, reason: 'Change allowed locations', locations: ['HOME', 'FACILITY'] };
test('Admin service location update accepts one or more supported unique locations', () => {
  expect(validateServiceLocations(valid)).toEqual(valid);
  expect(validateServiceLocations({ ...valid, locations: ['OUTDOOR'] }).locations).toEqual(['OUTDOOR']);
});
test.each([
  { locations: [] },
  { locations: ['HOME', 'HOME'] },
  { locations: ['UNKNOWN'] },
  { locations: ['FACILITY', 'HOME', 'OUTDOOR', 'HOME'] }
])('Admin service location update rejects invalid set: $locations', ({ locations }) => {
  expect(() => validateServiceLocations({ ...valid, locations })).toThrow(
    expect.objectContaining({ code: 'VALIDATION_FAILED', status: 422 })
  );
});
test('Admin service location update requires version, reason and exact supported keys', () => {
  for (const input of [
    { ...valid, expectedVersion: -1 },
    { ...valid, reason: 'a' },
    { ...valid, priceVnd: 100000 },
    { locations: ['HOME'], reason: 'Change locations' }
  ]) expect(() => validateServiceLocations(input)).toThrow();
});
