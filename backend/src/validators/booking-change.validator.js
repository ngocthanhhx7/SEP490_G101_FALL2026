import { exact, fail, id, instant, number } from './pet-care.validator.js';

export function bookingChangeInput(body) {
  if (body?.scope === 'VISIT') {
    exact(body, ['scope', 'visitId', 'startAt'], ['scope', 'visitId', 'startAt']);
    return { scope: body.scope, visitId: id(body.visitId).toLowerCase(), startAt: new Date(instant(body.startAt)) };
  }
  exact(body, ['scope', 'firstDay', 'times'], ['scope', 'firstDay', 'times']);
  if (body.scope !== 'BOOKING' || typeof body.firstDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.firstDay) ||
    !Array.isArray(body.times) || body.times.length < 1 || body.times.length > 2 ||
    body.times.some(time => typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    fail('VALIDATION_FAILED', 'Invalid whole-booking schedule');
  }
  instant(body.firstDay + 'T00:00:00+07:00');
  return { scope: body.scope, firstDay: body.firstDay, times: body.times };
}

export function bookingChangeDecision(body) {
  exact(body, ['action', 'expectedVersion'], ['action', 'expectedVersion']);
  if (!['APPROVE', 'REJECT'].includes(body.action)) fail('VALIDATION_FAILED', 'Invalid booking change decision');
  return { action: body.action, expectedVersion: number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true) };
}

export function bookingChangeQuery(query) {
  exact(query, ['bookingId', 'limit', 'cursor']);
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9]\d?$/.test(query.limit)))
    fail('VALIDATION_FAILED', 'Invalid page size');
  if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !query.cursor || query.cursor.length > 512))
    fail('VALIDATION_FAILED', 'Invalid cursor');
  return { bookingId: query.bookingId === undefined ? null : id(query.bookingId).toLowerCase(),
    limit: number(query.limit === undefined ? 20 : Number(query.limit), 1, 50, true), cursor: query.cursor };
}
