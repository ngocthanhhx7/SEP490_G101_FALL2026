import { exact, fail, id } from './pet-care.validator.js';

export function pickupSelection(value) {
  exact(value, ['addressId', 'policyVersion', 'expectedFeeVnd'], ['addressId', 'policyVersion', 'expectedFeeVnd']);
  id(value.addressId);
  if (!Number.isSafeInteger(value.policyVersion) || value.policyVersion < 1 ||
    !Number.isSafeInteger(value.expectedFeeVnd) || value.expectedFeeVnd < 0)
    fail('VALIDATION_FAILED', 'A current pickup quote is required');
  return { addressId: value.addressId, policyVersion: value.policyVersion, expectedFeeVnd: value.expectedFeeVnd };
}
