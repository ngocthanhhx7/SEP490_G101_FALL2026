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
function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === value;
}
export function availabilityInput(value) {
  exact(value, ['zone', 'workingWindows', 'effectiveFrom', 'expectedVersion'], ['zone', 'workingWindows', 'effectiveFrom', 'expectedVersion']);
  if (typeof value.zone !== 'string' || !['Asia/Saigon', 'Asia/Ho_Chi_Minh'].includes(value.zone)) {
    fail('VALIDATION_FAILED', 'Supported Vietnam timezone required');
  }
  if (!Array.isArray(value.workingWindows)) fail('VALIDATION_FAILED', 'workingWindows must be an array');
  for (const win of value.workingWindows) {
    exact(win, ['weekday', 'startLocalTime', 'endLocalTime'], ['weekday', 'startLocalTime', 'endLocalTime']);
    number(win.weekday, 1, 7, true);
    if (typeof win.startLocalTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(win.startLocalTime)
      || typeof win.endLocalTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(win.endLocalTime)) {
      fail('VALIDATION_FAILED', 'Invalid working window time');
    }
  }
  if (!validCalendarDate(value.effectiveFrom)) fail('VALIDATION_FAILED', 'Valid effectiveFrom calendar date required');
  number(value.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
  return value;
}
export function workAreasInput(value) {
  exact(value, ['areas', 'expectedVersion'], ['areas', 'expectedVersion']);
  if (!Array.isArray(value.areas) || value.areas.some(code => typeof code !== 'string' || !code.trim())) {
    fail('VALIDATION_FAILED', 'areas must be an array of non-empty strings');
  }
  number(value.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
  return value;
}
export function invitationInput(value) {
  exact(value, ['expectedVersion', 'sitterId'], ['expectedVersion']);
  number(value.expectedVersion, 0, 1000000, true); if (value.sitterId !== undefined) id(value.sitterId);
  return value;
}
export function decisionInput(value) {
  exact(value, ['expectedVersion'], ['expectedVersion']); number(value.expectedVersion, 0, 1000000, true); return value;
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
