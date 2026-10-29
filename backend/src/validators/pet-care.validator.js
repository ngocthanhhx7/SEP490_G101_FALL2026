import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.js';
export function fail(code, message, status = 422) {
  throw new AppError(status, code, message);
}
export function exact(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    fail('VALIDATION_FAILED', 'Invalid fields');
}
export function id(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value))
    fail('VALIDATION_FAILED', 'Invalid identifier');
  return value;
}
export function number(value, min, max, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail('VALIDATION_FAILED', 'Number outside bounds');
  return value;
}
export function instant(value) {
  const match =
    typeof value === 'string' &&
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (!match) fail('VALIDATION_FAILED', 'Timezone-aware time required');
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    !year ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail('VALIDATION_FAILED', 'Valid calendar date and time required');
  }
  return Date.parse(value);
}
export function point(value) {
  if (!Array.isArray(value) || value.length !== 2)
    fail('VALIDATION_FAILED', 'Coordinates required');
  number(value[0], -180, 180);
  number(value[1], -90, 90);
  return value;
}
export function weights(value) {
  exact(
    value,
    ['fit', 'travel', 'quality', 'reliability', 'workload'],
    ['fit', 'travel', 'quality', 'reliability', 'workload']
  );
  Object.values(value).forEach((x) => number(x, 0, 100));
  if (Math.abs(Object.values(value).reduce((a, b) => a + b, 0) - 100) > 0.00001)
    fail('VALIDATION_FAILED', 'Weights must sum to 100');
  return value;
}

export function digest(value) {
  const stable = (x) =>
    Array.isArray(x)
      ? x.map(stable)
      : x && typeof x === 'object'
        ? x instanceof Date
          ? x.toISOString()
          : Object.fromEntries(
              Object.keys(x)
                .sort()
                .filter((k) => x[k] !== undefined)
                .map((k) => [k, stable(x[k])])
            )
        : x;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

const common = ['serviceId', 'petIds', 'durationMinutes', 'visitCount'];
export function validatePetCareSelection(body) {
  exact(body, common, ['serviceId', 'petIds', 'durationMinutes']);
  id(body.serviceId);
  number(body.durationMinutes, 1, 360, true);
  number(body.visitCount ?? 1, 1, 60, true);
  if (
    !Array.isArray(body.petIds) ||
    !body.petIds.length ||
    body.petIds.length > 10 ||
    new Set(body.petIds).size !== body.petIds.length
  )
    fail('VALIDATION_FAILED', 'One to ten unique owned pets required');
  body.petIds.forEach(id);
  return { ...body, visitCount: body.visitCount ?? 1 };
}
