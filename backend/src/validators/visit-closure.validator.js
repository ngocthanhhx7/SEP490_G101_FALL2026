import { exact, number, fail } from './pet-care.validator.js';

export const CLOSURE_REASON_MAX_LENGTH = 1000;

// Staff must explain why a visit was closed without a check-out (GBR-24). The reason is free text.
export function visitClosureInput(value) {
  exact(value, ['expectedVersion', 'reason'], ['expectedVersion', 'reason']);
  number(value.expectedVersion, 0, 1000000, true);
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  if (!reason) fail('VALIDATION_FAILED', 'A reason is required to close a visit');
  if (reason.length > CLOSURE_REASON_MAX_LENGTH)
    fail('VALIDATION_FAILED', `The reason must be at most ${CLOSURE_REASON_MAX_LENGTH} characters`);
  return { expectedVersion: value.expectedVersion, reason };
}
