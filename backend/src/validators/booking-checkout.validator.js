import { exact, id, instant, fail } from './pet-care.validator.js';

export function bookingCheckoutInput(value) {
  exact(value, ['quoteId', 'visits', 'acceptServicePolicies'], ['quoteId', 'visits', 'acceptServicePolicies']);
  id(value.quoteId);
  if (value.acceptServicePolicies !== true) fail('SERVICE_POLICY_CONSENT_REQUIRED', 'Accept the quoted service policies');
  if (!Array.isArray(value.visits) || !value.visits.length || value.visits.length > 60) fail('VALIDATION_FAILED', 'One to sixty visits required');
  const visits = value.visits.map(row => {
    exact(row, ['itemIndex', 'startAt', 'location', 'addressId', 'requestedSitterId'], ['itemIndex', 'startAt', 'location']);
    if (row.requestedSitterId !== undefined) id(row.requestedSitterId);
    if (!Number.isSafeInteger(row.itemIndex) || row.itemIndex < 0 || row.itemIndex > 19 || !['HOME', 'FACILITY', 'OUTDOOR'].includes(row.location))
      fail('VALIDATION_FAILED', 'Invalid visit selection');
    if (row.location !== 'FACILITY') id(row.addressId);
    else if (row.addressId !== undefined) fail('VALIDATION_FAILED', 'Facility location is resolved by the server');
    return { ...row, startAt: new Date(instant(row.startAt)) };
  });
  return { quoteId: value.quoteId, visits, acceptServicePolicies: true };
}
