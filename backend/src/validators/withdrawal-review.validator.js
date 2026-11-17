import { exact, number, fail } from './pet-care.validator.js';

export function withdrawalReviewInput(value) {
  exact(value, ['expectedVersion', 'decision', 'reason'], ['expectedVersion', 'decision', 'reason']);
  number(value.expectedVersion, 0, 1000000, true);
  if (!['RELEASE', 'REJECT'].includes(value.decision) || typeof value.reason !== 'string'
    || !value.reason.trim() || value.reason.trim().length > 1000) fail('VALIDATION_FAILED', 'Decision and reason required');
  return { expectedVersion: value.expectedVersion, decision: value.decision, reason: value.reason.trim() };
}
