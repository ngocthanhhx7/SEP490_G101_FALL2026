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
  if (
    typeof value !== 'string' ||
    !/(Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail('VALIDATION_FAILED', 'Timezone-aware time required');
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
