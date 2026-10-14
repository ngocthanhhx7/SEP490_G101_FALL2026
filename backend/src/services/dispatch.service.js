import { AppError } from '../utils/app-error.js';

/**
 * Dispatch is deliberately split into two operations:
 *
 * 1. evaluateCandidates applies the non-negotiable eligibility gates; and
 * 2. rankEligibleCandidates orders only the candidates that passed those gates.
 *
 * The service does not mutate a Visit, create an Assignment, or expose a pet
 * record.  A repository supplied by the integration owner is responsible for
 * reading the current snapshots and for applying a later, atomic Offer/Visit
 * command.
 */

export const MAX_DISPATCH_CANDIDATES = 100;
export const DEFAULT_DISPATCH_LIMIT = 10;
export const PAW_WORLD_CARE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MIN_RATING = 0;
const MAX_RATING = 5;

function failValidation(message = 'Dispatch request is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function failDispatch(code, message, details = {}) {
  throw new AppError(409, code, message, details);
}

function asIdentifier(value, field) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value.trim())) {
    failValidation(`${field} is required`);
  }
  return value.trim();
}

function parseInstant(value, field) {
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) return new Date(value.getTime());
    failValidation(`${field} must be a valid instant`);
  }
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value)) {
    failValidation(`${field} must include a timezone offset`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) failValidation(`${field} must be a valid instant`);
  return new Date(timestamp);
}

function localDateForInstant(instant, zone = PAW_WORLD_CARE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function arrayValue(candidate, keys) {
  for (const key of keys) {
    if (Array.isArray(candidate?.[key])) return candidate[key];
  }
  return null;
}

function nestedArrayValue(candidate, keys) {
  const nested = candidate?.availability;
  if (!nested || typeof nested !== 'object') return null;
  for (const key of keys) {
    if (Array.isArray(nested[key])) return nested[key];
  }
  return null;
}

function normalizeTokenSet(values) {
  if (!Array.isArray(values)) return null;
  return new Set(values.filter(value => typeof value === 'string').map(value => value.trim().toLowerCase()));
}

function normalizeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function statusValue(candidate) {
  const sitterStatus = candidate?.sitterStatus;
  if (sitterStatus && typeof sitterStatus === 'object') {
    return sitterStatus.status ?? sitterStatus.state ?? null;
  }
  return sitterStatus ?? candidate?.operationalStatus ?? candidate?.status ?? null;
}

function userStateValue(candidate) {
  if (candidate?.userState !== undefined) return candidate.userState;
  if (candidate?.user?.state !== undefined) return candidate.user.state;
  return null;
}

function approvalValue(candidate) {
  if (candidate?.approved !== undefined) return normalizeBoolean(candidate.approved);
  if (candidate?.eligibility?.approved !== undefined) return normalizeBoolean(candidate.eligibility.approved);
  if (candidate?.applicationState !== undefined) return candidate.applicationState === 'APPROVED';
  if (candidate?.sitterStatus && typeof candidate.sitterStatus === 'object'
    && candidate.sitterStatus.approved !== undefined) return normalizeBoolean(candidate.sitterStatus.approved);
  return null;
}

function activeValue(candidate) {
  if (candidate?.active !== undefined) return normalizeBoolean(candidate.active);
  const status = statusValue(candidate);
  if (status !== null) return status === 'ACTIVE';
  return null;
}

function availabilityValue(candidate) {
  if (candidate?.available !== undefined) return normalizeBoolean(candidate.available);
  if (candidate?.isAvailable !== undefined) return normalizeBoolean(candidate.isAvailable);
  if (candidate?.availability?.available !== undefined) return normalizeBoolean(candidate.availability.available);
  return null;
}

function conflictValue(candidate) {
  if (candidate?.hasConflict !== undefined) return normalizeBoolean(candidate.hasConflict);
  if (candidate?.conflict !== undefined) return normalizeBoolean(candidate.conflict);
  const conflicts = candidate?.conflicts ?? candidate?.availability?.conflicts;
  if (Array.isArray(conflicts)) return conflicts.length > 0;
  if (candidate?.conflictChecked === true) return false;
  return null;
}

function dayOffValue(candidate, localDate) {
  if (candidate?.isDayOff !== undefined) return normalizeBoolean(candidate.isDayOff);
  if (candidate?.dayOff !== undefined) return normalizeBoolean(candidate.dayOff);
  const days = arrayValue(candidate, ['dayOffDates']) ?? nestedArrayValue(candidate, ['dayOffDates']);
  if (days) return days.includes(localDate);
  return null;
}

function candidateId(candidate) {
  return candidate?.sitterId ?? candidate?.userId ?? candidate?.id;
}

function validNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function metric(candidate, key, nestedKeys = []) {
  if (validNumber(candidate?.[key], 0)) return candidate[key];
  for (const nestedKey of nestedKeys) {
    if (validNumber(candidate?.[nestedKey], 0)) return candidate[nestedKey];
  }
  return null;
}

function normalizeRating(candidate) {
  const value = candidate?.rating ?? candidate?.ratingSummary?.averageRating;
  const count = candidate?.ratingCount ?? candidate?.ratingSummary?.count;
  if (!validNumber(value, MIN_RATING, MAX_RATING)) return { value: null, count: null };
  if (count !== undefined && !validNumber(count, 0)) return { value: null, count: null };
  return { value, count: count ?? null };
}

function safeCandidateView(candidate, request) {
  const sitterId = candidateId(candidate);
  const rating = normalizeRating(candidate);
  const distanceKm = metric(candidate, 'distanceKm', ['distance']);
  const workload = metric(candidate, 'activeWorkload', ['workload', 'currentWorkload']);
  const slotMatch = candidate?.slotMatch === true || candidate?.availability?.slotMatch === true;
  return Object.freeze({
    sitterId: String(sitterId),
    serviceId: request.serviceId,
    areaCode: request.areaCode,
    distanceKm,
    rating: rating.value,
    ratingCount: rating.count,
    workload,
    slotMatch,
  });
}

/**
 * Normalize and validate a dispatch context. Payment state is intentionally
 * an input snapshot: the P51 integration decides when dispatch is allowed.
 */
export function normalizeDispatchRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) failValidation();
  const serviceId = asIdentifier(request.serviceId ?? request.serviceCode, 'serviceId');
  const areaCode = asIdentifier(request.areaCode ?? request.workAreaCode, 'areaCode');
  const startAt = parseInstant(request.startAt, 'startAt');
  const endAt = parseInstant(request.endAt, 'endAt');
  if (endAt.getTime() <= startAt.getTime()) failValidation('endAt must follow startAt');
  const derivedLocalDate = localDateForInstant(startAt);
  const localDate = typeof request.localDate === 'string' ? request.localDate : derivedLocalDate;
  if (!DATE_ONLY.test(localDate)) failValidation('localDate must use YYYY-MM-DD');
  if (localDate !== derivedLocalDate) failValidation('localDate must match startAt in the service timezone');

  if (request.dispatchAllowed === false) {
    failDispatch('DISPATCH_NOT_ALLOWED', 'This visit is not eligible for dispatch');
  }
  const paymentRequired = request.paymentRequired === true;
  const paymentStatus = request.paymentStatus ?? request.payment?.status ?? null;
  if (paymentRequired && request.dispatchAllowed !== true && !['PAID', 'VERIFIED'].includes(paymentStatus)) {
    failDispatch('PAYMENT_REQUIRED', 'Payment must be verified before dispatch');
  }

  return Object.freeze({
    visitId: request.visitId === undefined || request.visitId === null ? null : asIdentifier(request.visitId, 'visitId'),
    bookingId: request.bookingId === undefined || request.bookingId === null ? null : asIdentifier(request.bookingId, 'bookingId'),
    serviceId, areaCode, startAt, endAt, localDate,
    dispatchAllowed: request.dispatchAllowed !== false,
    paymentStatus,
    paymentRequired,
    requestedSitterId: request.requestedSitterId === undefined || request.requestedSitterId === null
      ? null : asIdentifier(request.requestedSitterId, 'requestedSitterId'),
  });
}

function gate(reason, detail = undefined) {
  return detail === undefined ? reason : `${reason}:${detail}`;
}

/**
 * Return an eligibility decision with no private candidate fields. A missing
 * hard-gate snapshot fails closed, so ranking never manufactures a score from
 * incomplete provider data.
 */
export function evaluateCandidate(candidate, request) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return Object.freeze({ eligible: false, reasons: [gate('CANDIDATE_INVALID')] });
  }
  const sitterId = candidateId(candidate);
  if (typeof sitterId !== 'string' || !IDENTIFIER.test(sitterId.trim())) {
    return Object.freeze({ eligible: false, reasons: [gate('SITTER_ID_UNAVAILABLE')] });
  }
  const context = request?.serviceId && request?.startAt instanceof Date
    && request?.endAt instanceof Date && typeof request?.localDate === 'string'
    ? request : normalizeDispatchRequest(request);
  const reasons = [];
  const approved = approvalValue(candidate);
  if (approved !== true) reasons.push(approved === false ? 'NOT_APPROVED' : 'APPROVAL_UNKNOWN');

  const active = activeValue(candidate);
  const userState = userStateValue(candidate);
  if (active !== true || (userState !== null && userState !== 'ACTIVE')) reasons.push('NOT_ACTIVE');

  const services = normalizeTokenSet(arrayValue(candidate, ['serviceIds', 'serviceCodes', 'services', 'eligibleServices']));
  if (!services || !services.has(context.serviceId.toLowerCase())) reasons.push(services ? 'SERVICE_MISMATCH' : 'SERVICE_DATA_UNAVAILABLE');

  const areas = normalizeTokenSet(arrayValue(candidate, ['workAreas', 'areaCodes', 'areas', 'coverageAreas']));
  if (!areas || !areas.has(context.areaCode.toLowerCase())) reasons.push(areas ? 'AREA_MISMATCH' : 'AREA_DATA_UNAVAILABLE');

  const available = availabilityValue(candidate);
  if (available !== true) reasons.push(available === false ? 'NOT_AVAILABLE' : 'AVAILABILITY_UNKNOWN');
  const isDayOff = dayOffValue(candidate, context.localDate);
  if (isDayOff === true) reasons.push('DAY_OFF');
  else if (isDayOff === null) reasons.push('DAY_OFF_STATUS_UNKNOWN');
  const hasConflict = conflictValue(candidate);
  if (hasConflict === true) reasons.push('VISIT_CONFLICT');
  else if (hasConflict === null) reasons.push('CONFLICT_STATUS_UNKNOWN');

  if (context.requestedSitterId && sitterId.trim() !== context.requestedSitterId) reasons.push('NOT_REQUESTED_SITTER');
  if (reasons.length) return Object.freeze({ eligible: false, sitterId: sitterId.trim(), reasons });

  const safe = safeCandidateView(candidate, context);
  const explanations = [
    'ACTIVE_SITTER', 'APPROVED', 'SERVICE_MATCH', 'AREA_MATCH', 'SLOT_AVAILABLE',
    'NO_DAY_OFF', 'NO_VISIT_CONFLICT'
  ];
  if (safe.slotMatch) explanations.push('SCHEDULE_MATCH');
  if (safe.distanceKm !== null) explanations.push('DISTANCE_AVAILABLE');
  if (safe.rating !== null) explanations.push('RATING_VALID');
  else explanations.push('NEW_OR_UNRATED_SITTER');
  if (safe.workload !== null) explanations.push('WORKLOAD_AVAILABLE');
  else explanations.push('WORKLOAD_UNKNOWN');
  return Object.freeze({ eligible: true, sitterId: sitterId.trim(), candidate: safe, explanations });
}

function rankingKey(decision) {
  const value = decision.candidate;
  // Workload is first so a new sitter can be selected without a fabricated
  // zero rating. Distance and rating are independent tie-break dimensions.
  return [
    value.slotMatch ? 0 : 1,
    value.workload === null ? 1 : 0,
    value.workload === null ? Number.POSITIVE_INFINITY : value.workload,
    value.distanceKm === null ? 1 : 0,
    value.distanceKm === null ? Number.POSITIVE_INFINITY : value.distanceKm,
    // Treat an unrated/new sitter as a neutral bucket instead of inventing a
    // zero rating or permanently pushing the sitter behind rated workers.
    value.rating === null ? 0 : 1,
    value.rating === null ? 0 : -value.rating,
    value.sitterId.toLowerCase()
  ];
}

function compareKeys(left, right) {
  const a = rankingKey(left);
  const b = rankingKey(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

/**
 * Apply hard gates, then deterministic ordering. No aggregate score is
 * returned: each result retains the dimensions that explain its position.
 */
export function rankEligibleCandidates({ request, candidates, limit = DEFAULT_DISPATCH_LIMIT } = {}) {
  const context = request?.serviceId && request?.startAt instanceof Date
    ? request : normalizeDispatchRequest(request);
  if (!Array.isArray(candidates)) failValidation('Candidate records are unavailable');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DISPATCH_CANDIDATES) {
    failValidation(`Candidate limit must be between 1 and ${MAX_DISPATCH_CANDIDATES}`);
  }

  const eligible = [];
  const excluded = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const decision = evaluateCandidate(candidate, context);
    if (decision.sitterId && seen.has(decision.sitterId)) continue;
    if (decision.sitterId) seen.add(decision.sitterId);
    if (decision.eligible) eligible.push(decision);
    else excluded.push(Object.freeze({ sitterId: decision.sitterId ?? null, reasons: [...decision.reasons] }));
  }
  eligible.sort(compareKeys);
  const selected = eligible.slice(0, limit).map((decision, index) => Object.freeze({
    rank: index + 1,
    sitterId: decision.sitterId,
    reasons: Object.freeze([...decision.explanations]),
    ...decision.candidate
  }));
  return Object.freeze({
    rankingSource: 'DETERMINISTIC_RULES',
    selected: Object.freeze(selected),
    eligibleCount: eligible.length,
    excluded: Object.freeze(excluded),
  });
}

/**
 * Dispatch facade. `listCandidates` is the only read port. It must return
 * bounded, already-authorized projections; the service never receives pet
 * profile or private address data from a caller-facing route.
 */
export function createSitterDispatchService({ listCandidates, ranker = null } = {}) {
  if (typeof listCandidates !== 'function') throw new TypeError('A candidate repository port is required');
  if (ranker !== null && typeof ranker !== 'function') throw new TypeError('ranker must be a function');

  async function suggest({ request, candidates, limit = DEFAULT_DISPATCH_LIMIT } = {}) {
    const context = normalizeDispatchRequest(request);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_DISPATCH_CANDIDATES) {
      failValidation(`Candidate limit must be between 1 and ${MAX_DISPATCH_CANDIDATES}`);
    }
    let records;
    if (candidates === undefined) {
      try {
        records = await listCandidates({ request: context, limit });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, 'DISPATCH_UNAVAILABLE', 'Sitter candidates are unavailable');
      }
    } else records = candidates;
    if (!Array.isArray(records)) throw new AppError(503, 'DISPATCH_UNAVAILABLE', 'Sitter candidates are unavailable');
    const fallback = () => rankEligibleCandidates({ request: context, candidates: records, limit });
    const base = fallback();
    if (!ranker || base.selected.length === 0) return base;

    try {
      const rankedIds = await ranker({ request: context, candidates: base.selected.map(item => ({ ...item })) });
      if (!Array.isArray(rankedIds) || rankedIds.length !== base.selected.length
        || new Set(rankedIds).size !== rankedIds.length
        || rankedIds.some(id => typeof id !== 'string' || !base.selected.some(item => item.sitterId === id))) {
        return Object.freeze({ ...base, fallbackUsed: true, fallbackReason: 'RANKER_INVALID_RESULT' });
      }
      const positions = new Map(rankedIds.map((id, index) => [id, index]));
      const selected = base.selected.map(item => Object.freeze({ ...item, rankingSource: 'PROVIDER_ORDER' }))
        .sort((left, right) => positions.get(left.sitterId) - positions.get(right.sitterId))
        .map((item, index) => Object.freeze({ ...item, rank: index + 1 }));
      return Object.freeze({ ...base, rankingSource: 'PROVIDER_ORDER', selected: Object.freeze(selected), fallbackUsed: false });
    } catch {
      return Object.freeze({ ...base, fallbackUsed: true, fallbackReason: 'RANKER_UNAVAILABLE' });
    }
  }

  return Object.freeze({ suggest });
}
