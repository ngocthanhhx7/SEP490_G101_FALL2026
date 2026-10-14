import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

const SERVICE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const OPERATION = 'SITTER_DAY_OFF_REQUEST_CREATE';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const RESOURCE_ID = /^[0-9a-f]{24}$/i;
const MAX_CONFLICTS = 100;

function validationError(field, message) {
  throw new AppError(422, 'VALIDATION_FAILED', 'The day-off request is invalid', {
    fieldErrors: { [field]: message }
  });
}

function calendarDate(value, field) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    validationError(field, 'Use a YYYY-MM-DD local calendar date.');
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.toISOString().slice(0, 10) !== value) {
    validationError(field, 'Use a valid calendar date.');
  }
  return value;
}

function dateInServiceTimeZone(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('clock must return a valid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SERVICE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateActor(actor) {
  if (!actor || typeof actor.userId !== 'string' || actor.userId.length === 0) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (actor.state !== 'ACTIVE' || !Array.isArray(actor.roles) || !actor.roles.includes('PET_SITTER')) {
    throw new AppError(403, 'FORBIDDEN', 'Only an active Pet Sitter can request time off');
  }
}

function validateInput({ startDate, endDate, expectedVersion, idempotencyKey }) {
  const start = calendarDate(startDate, 'startDate');
  const end = calendarDate(endDate, 'endDate');
  if (start > end) validationError('endDate', 'The end date must be on or after the start date.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    validationError('expectedVersion', 'A nonnegative availability version is required.');
  }
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    validationError('idempotencyKey', 'An idempotency key is required.');
  }
  return { startDate: start, endDate: end };
}

function payloadHash({ startDate, endDate, expectedVersion }) {
  return createHash('sha256')
    .update(JSON.stringify({ startDate, endDate, expectedVersion }))
    .digest('hex');
}

function replayResult(record, requestedPayloadHash) {
  if (!record) return null;
  if (record.payloadHash !== requestedPayloadHash) {
    throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
  }
  return record.result;
}

function safeConflictCount(conflicts) {
  if (!conflicts || !Array.isArray(conflicts.items) || conflicts.items.length > MAX_CONFLICTS + 1
    || typeof conflicts.hasMore !== 'boolean') {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Visit conflict information is unavailable');
  }
  return Math.min(conflicts.items.length, MAX_CONFLICTS) + (conflicts.hasMore ? 1 : 0);
}

function validateRepository(repository) {
  if (typeof repository?.runForSitterActor !== 'function') {
    throw new TypeError('runForSitterActor repository port is required');
  }
}

/**
 * Creates the WBS-023 business operation behind a future route adapter.
 *
 * `runForSitterActor` must re-check the live actor and ownership in the same
 * transaction that serializes availability mutations through P01's
 * EligibilityGuard. Its transaction port supplies getIdempotencyResult,
 * getAvailabilityForSitter, findOverlappingDayOffRequests,
 * findConfirmedVisitConflicts (limit + hasMore), createPendingDayOffRequest, and
 * saveIdempotencyResult. The create and idempotency methods must share the
 * transaction; the adapter must append its audit/outbox records in that unit
 * of work and must not add dates to Availability. No database model or route
 * is defined here, so a concrete P01/P34 adapter remains an integration
 * requirement.
 */
export function createDayOffRequestService({ repository, clock = () => new Date() } = {}) {
  validateRepository(repository);
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  return Object.freeze({
    async request({ actor, startDate, endDate, expectedVersion, idempotencyKey } = {}) {
      validateActor(actor);
      const dates = validateInput({ startDate, endDate, expectedVersion, idempotencyKey });
      const requestedPayloadHash = payloadHash({ ...dates, expectedVersion });

      return repository.runForSitterActor(actor, async (transaction, { sitterId } = {}) => {
        if (typeof sitterId !== 'string' || sitterId.length === 0) {
          throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Availability was not found');
        }

        const identity = {
          actorRef: actor.userId,
          operation: OPERATION,
          resourceRef: sitterId,
          key: idempotencyKey
        };
        const replay = replayResult(await transaction.getIdempotencyResult(identity), requestedPayloadHash);
        if (replay) return replay;
        if (dates.startDate < dateInServiceTimeZone(clock())) {
          validationError('startDate', 'The start date cannot be in the past in Vietnam time.');
        }

        const availability = await transaction.getAvailabilityForSitter(sitterId);
        if (!availability || availability.sitterId !== sitterId) {
          throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Availability was not found');
        }
        if (!Number.isSafeInteger(availability.version) || availability.version !== expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'Availability changed; reload the calendar and try again');
        }

        const overlapsSavedDayOff = (availability.dayOffDates ?? []).some(date => date >= dates.startDate && date <= dates.endDate);
        const overlap = await transaction.findOverlappingDayOffRequests({
          sitterId, startDate: dates.startDate, endDate: dates.endDate
        });
        if (overlapsSavedDayOff || overlap) {
          throw new AppError(409, 'INVALID_STATE', 'An active day-off request already overlaps these dates');
        }

        const conflictCount = safeConflictCount(await transaction.findConfirmedVisitConflicts({
          sitterId, startDate: dates.startDate, endDate: dates.endDate, limit: MAX_CONFLICTS + 1
        }));
        const result = {
          request: {
            state: 'PENDING',
            startDate: dates.startDate,
            endDate: dates.endDate,
            availabilityVersion: availability.version
          },
          conflicts: { count: conflictCount },
          availabilityChanged: false,
          requiresStaffReview: true,
          hasConfirmedVisitConflicts: conflictCount > 0
        };

        const created = await transaction.createPendingDayOffRequest({
          availabilityVersion: availability.version,
          request: {
            sitterId,
            requestedBy: actor.userId,
            startDate: dates.startDate,
            endDate: dates.endDate,
            state: 'PENDING'
          },
          confirmedVisitConflictCount: conflictCount,
        });

        if (!created || typeof created.requestId !== 'string' || !RESOURCE_ID.test(created.requestId)) {
          throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The request could not be confirmed');
        }
        const confirmedResult = {
          ...result,
          request: { ...result.request, id: created.requestId }
        };
        await transaction.saveIdempotencyResult({
          identity,
          payloadHash: requestedPayloadHash,
          result: confirmedResult
        });
        return confirmedResult;
      });
    }
  });
}

export { dateInServiceTimeZone as getDayOffServiceDate };
