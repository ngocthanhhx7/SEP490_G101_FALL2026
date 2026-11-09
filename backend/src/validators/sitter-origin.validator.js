import { exact, number, instant, point, fail } from './pet-care.validator.js';
export function sitterOriginInput(body, now) {
  exact(body, ['expectedVersion', 'localDate', 'coordinates', 'availableFrom', 'availableUntil'], ['expectedVersion', 'localDate', 'coordinates', 'availableFrom', 'availableUntil']);
  number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true); point(body.coordinates);
  const start = instant(body.availableFrom), end = instant(body.availableUntil);
  const day = at => new Date(at + 7 * 3600000).toISOString().slice(0, 10);
  if (typeof body.localDate !== 'string' || day(start) !== body.localDate || day(end - 1) !== body.localDate || start >= end || end <= now || start > now + 31 * 86400000) fail('VALIDATION_FAILED', 'Choose a future interval in the same local day within 31 days');
  return body;
}
