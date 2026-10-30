import { exact, id, number, fail, instant } from './pet-care.validator.js';
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
