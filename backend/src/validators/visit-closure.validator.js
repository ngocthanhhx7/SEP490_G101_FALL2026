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

export function visitClosureVerificationInput(value) {
  exact(value, ['expectedVersion', 'reason', 'outcome', 'evidenceReference', 'actualEndedAt', 'reportsComplete'],
    ['expectedVersion', 'reason', 'outcome', 'evidenceReference']);
  const base = visitClosureInput({ expectedVersion: value.expectedVersion, reason: value.reason });
  const evidenceReference = typeof value.evidenceReference === 'string' ? value.evidenceReference.trim() : '';
  if (!['SERVICE_PERFORMED', 'NO_SERVICE'].includes(value.outcome) || !evidenceReference || evidenceReference.length > 160)
    fail('VALIDATION_FAILED', 'Outcome and evidence reference are required');
  if (value.outcome === 'NO_SERVICE') {
    if (value.actualEndedAt !== undefined || value.reportsComplete !== undefined) fail('VALIDATION_FAILED', 'No-service outcome has no worked time');
    return { ...base, outcome: value.outcome, evidenceReference };
  }
  if (typeof value.actualEndedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.actualEndedAt)
    || !Number.isFinite(Date.parse(value.actualEndedAt)) || typeof value.reportsComplete !== 'boolean')
    fail('VALIDATION_FAILED', 'Verified actual end and report status are required');
  return { ...base, outcome: value.outcome, evidenceReference, actualEndedAt: new Date(value.actualEndedAt), reportsComplete: value.reportsComplete };
}
