import { exact, number } from './pet-care.validator.js';
export function carePlanInput(value) {
  const keys = ['expectedVersion', 'shiftMinutes'];
  exact(value, keys, keys); number(value.expectedVersion, 0, 1000000, true); number(value.shiftMinutes, 60, 480, true);
  return value;
}
