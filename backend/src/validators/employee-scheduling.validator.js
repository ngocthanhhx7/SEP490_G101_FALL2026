import { AppError } from '../utils/app-error.js';
import { exact, id, number, fail, instant } from './pet-care.validator.js';
import { VISIT_WITHDRAWAL_REASONS } from '../constants/visit-withdrawal.js';

export function withdrawalInput(value) {
  exact(value, ['expectedVersion', 'expectedMode', 'reasonCode', 'note'], ['expectedVersion', 'expectedMode', 'reasonCode']);
  number(value.expectedVersion, 0, 1000000, true);
  if (!['EARLY', 'LATE'].includes(value.expectedMode) || !VISIT_WITHDRAWAL_REASONS.includes(value.reasonCode))
    fail('VALIDATION_FAILED', 'Withdrawal mode and reason are required');
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.trim().length > 1000))
    fail('VALIDATION_FAILED', 'Withdrawal note must be no more than 1000 characters');
  const { expectedVersion, expectedMode, reasonCode } = value;
  const note = value.note?.trim();
  return { expectedVersion, expectedMode, reasonCode, ...(note ? { note } : {}) };
}
export function availabilityInput(value) {
  exact(value, ['zone', 'workingWindows', 'effectiveFrom', 'expectedVersion'], ['zone', 'workingWindows', 'effectiveFrom', 'expectedVersion']);
  return value;
}
export function workAreasInput(value) {
  exact(value, ['areas', 'expectedVersion'], ['areas', 'expectedVersion']); return value;
}
export function invitationInput(value) {
  exact(value, ['expectedVersion', 'sitterId'], ['expectedVersion']);
  number(value.expectedVersion, 0, 1000000, true); if (value.sitterId !== undefined) id(value.sitterId);
  return value;
}
export function decisionInput(value) {
  exact(value, ['expectedVersion'], ['expectedVersion']); number(value.expectedVersion, 0, 1000000, true); return value;
}
export function declineInput(value) {
  exact(value, ['expectedVersion', 'reasonCode', 'note'], ['expectedVersion']);
  number(value.expectedVersion, 0, 1000000, true);
  if (value.reasonCode === undefined || value.reasonCode === null || (typeof value.reasonCode === 'string' && !value.reasonCode.trim())) {
    throw new AppError(422, 'VALIDATION_FAILED', 'This field is required.', {
      fieldErrors: { reasonCode: 'This field is required.' },
      messageCode: 'MSG01'
    });
  }
  if (!VISIT_WITHDRAWAL_REASONS.includes(value.reasonCode)) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Decline reason is invalid', {
      fieldErrors: { reasonCode: 'Decline reason is invalid' }
    });
  }
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.trim().length > 1000)) {
    fail('VALIDATION_FAILED', 'Decline note must be no more than 1000 characters');
  }
  const note = value.note?.trim();
  return { expectedVersion: value.expectedVersion, reasonCode: value.reasonCode, ...(note ? { note } : {}) };
}
export function proposalConfirmationInput(value) {
  exact(value, ['expectedVersion', 'selectedSlot'], ['expectedVersion', 'selectedSlot']);
  number(value.expectedVersion, 0, 1000000, true);
  exact(value.selectedSlot, ['startAt', 'endAt'], ['startAt', 'endAt']);
  instant(value.selectedSlot.startAt); instant(value.selectedSlot.endAt);
  return value;
}
export function schedulingKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) fail('VALIDATION_FAILED', 'Idempotency key required');
  return value;
}
export const REASSIGNMENT_REASON_MAX = 1000;
export function reassignmentInput(value) {
  exact(value, ['expectedVersion', 'sitterId', 'reason'], ['expectedVersion', 'sitterId', 'reason']);
  number(value.expectedVersion, 0, 1000000, true); id(value.sitterId);
  if (typeof value.reason !== 'string' || !value.reason.trim()) fail('REASON_REQUIRED', 'Reason is required');
  if (value.reason.trim().length > REASSIGNMENT_REASON_MAX) fail('VALIDATION_FAILED', 'Reason must be no more than 1000 characters');
  return { expectedVersion: value.expectedVersion, sitterId: value.sitterId, reason: value.reason.trim() };
}
