import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

export const SITTER_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_CALENDAR_DAYS = 31;
const MAX_WINDOWS = 14;
const MAX_CONFLICTS = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WEEK_MINUTES = 7 * 24 * 60;

function invalid(message = 'Availability data is invalid') {
  return new AppError(422, 'VALIDATION_FAILED', message);
}

function dateParts(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw invalid('Use a local date in YYYY-MM-DD format');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw invalid('The local date does not exist');
  }
  return { year, month, day };
}

export function normalizeSitterTimeZone(zone) {
  if (zone !== SITTER_TIME_ZONE && zone !== 'Asia/Saigon') {
    throw invalid('Availability must use the Paw World Care timezone');
  }
  return SITTER_TIME_ZONE;
}

export function localDateTimeToUtc(localDate, localTime, zone = SITTER_TIME_ZONE) {
  const { year, month, day } = dateParts(localDate);
  if (typeof localTime !== 'string' || !TIME_PATTERN.test(localTime)) throw invalid('Use a local time in HH:mm format');
  const canonicalZone = normalizeSitterTimeZone(zone);
  const [hour, minute] = localTime.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: canonicalZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  const representedAt = instant => {
    const values = Object.fromEntries(formatter.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  };
  const offset = representedAt(target) - target;
  const instant = target - offset;
  if (representedAt(instant) !== target) throw invalid('The local time cannot be represented in the selected timezone');
  return new Date(instant).toISOString();
}

function localToday(now, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function minuteOfDay(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function normalizeWorkingWindows(windows) {
  if (!Array.isArray(windows) || windows.length > MAX_WINDOWS) {
    throw invalid(`Provide no more than ${MAX_WINDOWS} working-hour intervals`);
  }
  const normalized = windows.map(window => {
    if (!window || !Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7
      || typeof window.startLocalTime !== 'string' || !TIME_PATTERN.test(window.startLocalTime)
      || typeof window.endLocalTime !== 'string' || !TIME_PATTERN.test(window.endLocalTime)) {
      throw invalid('Each interval needs a weekday and valid local start and end times');
    }
    if (window.startLocalTime === window.endLocalTime) throw invalid('An interval cannot have zero duration');
    return Object.freeze({ weekday: window.weekday,
      startLocalTime: window.startLocalTime, endLocalTime: window.endLocalTime });
  }).sort((left, right) => left.weekday - right.weekday
    || left.startLocalTime.localeCompare(right.startLocalTime));

  for (let leftIndex = 0; leftIndex < normalized.length; leftIndex += 1) {
    const left = normalized[leftIndex];
    const leftStart = (left.weekday - 1) * 1440 + minuteOfDay(left.startLocalTime);
    const rawLeftEnd = (left.weekday - 1) * 1440 + minuteOfDay(left.endLocalTime);
    const leftEnd = rawLeftEnd <= leftStart ? rawLeftEnd + 1440 : rawLeftEnd;
    for (let rightIndex = leftIndex + 1; rightIndex < normalized.length; rightIndex += 1) {
      const right = normalized[rightIndex];
      const rightStart = (right.weekday - 1) * 1440 + minuteOfDay(right.startLocalTime);
      const rawRightEnd = (right.weekday - 1) * 1440 + minuteOfDay(right.endLocalTime);
      const rightEnd = rawRightEnd <= rightStart ? rawRightEnd + 1440 : rawRightEnd;
      for (const shift of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
        if (leftStart < rightEnd + shift && rightStart + shift < leftEnd) {
          throw new AppError(409, 'AVAILABILITY_WINDOW_OVERLAP', 'Working-hour intervals overlap');
        }
      }
    }
  }
  return Object.freeze(normalized);
}

function boundedDateRange(fromLocalDate, toLocalDate) {
  const start = dateParts(fromLocalDate);
  const end = dateParts(toLocalDate);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  const dayCount = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (dayCount < 1 || dayCount > MAX_CALENDAR_DAYS) {
    throw invalid(`Calendar queries must cover between 1 and ${MAX_CALENDAR_DAYS} local dates`);
  }
  return { startMs, endMs, dayCount };
}

function requireSitter(actor) {
  if (!actor || actor.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !actor.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!Array.isArray(actor.roles) || !actor.roles.includes('PET_SITTER')) {
    throw new AppError(403, 'FORBIDDEN', 'Only the signed-in Sitter can manage availability');
  }
  return actor.userId;
}

function publicOwnerProjection(record) {
  if (!record) return null;
  return Object.freeze({
    zone: normalizeSitterTimeZone(record.zone),
    workingWindows: normalizeWorkingWindows(record.workingWindows ?? []),
    areas: Array.isArray(record.areas) ? [...record.areas] : [],
    dayOffDates: Array.isArray(record.dayOffDates) ? [...record.dayOffDates] : [],
    state: record.state,
    expectedVersion: record.version,
    effectiveFrom: record.effectiveFrom ?? null
  });
}

function assertCalendarEntries(entries, fromLocalDate, toLocalDate) {
  if (!Array.isArray(entries) || entries.length > MAX_CALENDAR_DAYS) {
    throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Calendar data is temporarily unavailable');
  }
  const { startMs, endMs } = boundedDateRange(fromLocalDate, toLocalDate);
  return Object.freeze(entries.map(entry => {
    const { year, month, day } = dateParts(entry.localDate);
    const epoch = Date.UTC(year, month - 1, day);
    if (epoch < startMs || epoch > endMs) {
      throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Calendar data is outside the requested date range');
    }
    return Object.freeze({
      localDate: entry.localDate,
      zone: SITTER_TIME_ZONE,
      available: entry.available === true,
      windows: normalizeWorkingWindows(entry.windows ?? []),
      isDayOff: entry.isDayOff === true
    });
  }));
}

function payloadFingerprint(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function createSitterAvailabilityService({ availabilityRepository, assignmentRepository,
  withEligibilityGuard, clock = () => new Date() }) {
  const repositoryMethods = ['findBySitterId', 'listCalendar', 'findCommand', 'createIfAbsent', 'replaceIfVersion', 'saveCommand'];
  if (!availabilityRepository || repositoryMethods.some(method => typeof availabilityRepository[method] !== 'function')
    || typeof assignmentRepository?.findConflicts !== 'function'
    || typeof withEligibilityGuard !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Availability repository, assignment repository, eligibility guard and clock are required');
  }

  async function getMine({ actor }) {
    const sitterId = requireSitter(actor);
    const record = await availabilityRepository.findBySitterId({ sitterId });
    return publicOwnerProjection(record);
  }

  async function listMyCalendar({ actor, fromLocalDate, toLocalDate }) {
    const sitterId = requireSitter(actor);
    boundedDateRange(fromLocalDate, toLocalDate);
    const entries = await availabilityRepository.listCalendar({
      sitterId, fromLocalDate, toLocalDate, limit: MAX_CALENDAR_DAYS
    });
    return assertCalendarEntries(entries, fromLocalDate, toLocalDate);
  }

  async function updateMine({ actor, command }) {
    const sitterId = requireSitter(actor);
    if (!command || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0
      || typeof command.idempotencyKey !== 'string' || command.idempotencyKey.length < 8
      || command.idempotencyKey.length > 128) {
      throw invalid('A current version and idempotency key are required');
    }
    const zone = normalizeSitterTimeZone(command.zone);
    const workingWindows = normalizeWorkingWindows(command.workingWindows);
    const effectiveFrom = dateParts(command.effectiveFrom) && command.effectiveFrom;
    const patch = Object.freeze({ zone, workingWindows, effectiveFrom });
    const fingerprint = payloadFingerprint({ expectedVersion: command.expectedVersion, ...patch });

    return withEligibilityGuard({ sitterId, actorRef: actor.userId, authEpoch: actor.authEpoch }, async transaction => {
      const previous = await availabilityRepository.findCommand({
        sitterId, idempotencyKey: command.idempotencyKey, transaction
      });
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This operation key was already used for another change');
        }
        return previous.result;
      }
      if (effectiveFrom < localToday(clock(), zone)) {
        throw new AppError(409, 'DEADLINE_PASSED', 'Availability changes must start today or later in the Sitter timezone');
      }

      let current = await availabilityRepository.findBySitterId({ sitterId, transaction });
      if (!current && command.expectedVersion === 0) {
        await availabilityRepository.createIfAbsent({ sitterId, zone, transaction });
        current = await availabilityRepository.findBySitterId({ sitterId, transaction });
      }
      if (!current) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Sitter availability was not found');
      if (current.version !== command.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Availability changed; reload before saving');
      }
      const conflicts = await assignmentRepository.findConflicts({
        sitterId, zone, workingWindows, effectiveFrom, limit: MAX_CONFLICTS + 1, transaction
      });
      if (!conflicts || !Array.isArray(conflicts.items) || conflicts.items.length > MAX_CONFLICTS + 1
        || typeof conflicts.hasMore !== 'boolean') {
        throw new AppError(503, 'AVAILABILITY_UNAVAILABLE', 'Schedule conflicts could not be checked');
      }
      const conflictCount = Math.min(conflicts.items.length, MAX_CONFLICTS) + (conflicts.hasMore ? 1 : 0);
      if (conflictCount > 0) {
        throw new AppError(409, 'CONFIRMED_VISIT_CONFLICT', 'Staff must review affected confirmed visits before this change', {
          conflictCount, resolution: 'STAFF_REVIEW_REQUIRED'
        });
      }
      const result = await availabilityRepository.replaceIfVersion({
        sitterId, expectedVersion: command.expectedVersion, patch, transaction
      });
      if (!result) throw new AppError(409, 'VERSION_CONFLICT', 'Availability changed; reload before saving');
      const projected = publicOwnerProjection(result);
      await availabilityRepository.saveCommand({
        sitterId, idempotencyKey: command.idempotencyKey, fingerprint, result: projected, transaction
      });
      return projected;
    });
  }

  return Object.freeze({ getMine, listMyCalendar, updateMine });
}