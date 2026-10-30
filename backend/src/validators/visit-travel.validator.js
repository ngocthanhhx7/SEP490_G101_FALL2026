import { exact, fail, instant, number, point } from './pet-care.validator.js';

export function travelCommand(body) {
  exact(body, ['action', 'expectedVersion'], ['action', 'expectedVersion']);
  if (!['START', 'STOP', 'ARRIVED'].includes(body.action)) fail('VALIDATION_FAILED', 'Invalid travel action');
  return { action: body.action, expectedVersion: number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true) };
}
export function travelLocation(body, now) {
  exact(body, ['sessionId', 'coordinates', 'accuracyMeters', 'observedAt'], ['sessionId', 'coordinates', 'accuracyMeters', 'observedAt']);
  if (typeof body.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.sessionId)) fail('VALIDATION_FAILED', 'Invalid travel session');
  const observed = instant(body.observedAt);
  if (observed > now + 10000 || observed < now - 60000) fail('LOCATION_STALE', 'Current location required', 409);
  return { sessionId: body.sessionId, coordinates: point(body.coordinates), accuracyMeters: number(body.accuracyMeters, 0, 100), observedAt: new Date(observed) };
}
