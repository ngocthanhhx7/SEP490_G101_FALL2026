import { createHash, randomUUID } from 'node:crypto';
import { hasRole } from '../../middlewares/session.js';
import { AppError } from '../../utils/app-error.js';

export const REVIEW_STATES = Object.freeze(['SUBMITTED', 'PUBLISHED', 'WITHHELD']);
export const REVIEW_DIRECTIONS = Object.freeze(['CUSTOMER_TO_SITTER']);
export const REVIEW_RATINGS = Object.freeze([1, 2, 3, 4, 5]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_COMMENT = 2000;
const MAX_TAGS = 8;

const fail = (status, code, message, details = {}) => { throw new AppError(status, code, message, details); };
const invalid = (field, message = 'Review request is invalid') => fail(422, 'VALIDATION_FAILED', message,
  field ? { fieldErrors: { [field]: message } } : {});

function nowValue(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('clock must return a valid date');
  return date.getTime();
}

function active(actor, clock) {
  if (!actor || actor.state !== 'ACTIVE' || actor.synthetic === true || typeof actor.userId !== 'string'
    || !ID.test(actor.userId) || !Array.isArray(actor.roles) || actor.roles.length === 0
    || actor.roles.some(role => !['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(role))
    || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= nowValue(clock)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}

function identifier(value, field = 'id') {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, `${field} is invalid`);
  return value;
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}

function expectedVersion(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) invalid('expectedVersion', 'A nonnegative version is required');
  return value;
}

function text(value, field, max, optional = false) {
  if (value === undefined && optional) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) {
    invalid(field, `${field} is invalid`);
  }
  const result = value.trim();
  if (!result && !optional) invalid(field, `${field} cannot be empty`);
  return result || null;
}

function normalizeTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) invalid('tags', 'At most 8 rating tags are allowed');
  return value.map((tag, index) => text(tag, `tags.${index}`, 60)).filter(Boolean);
}

function normalizeRating(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('review');
  if (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5) invalid('rating', 'Rating must be an integer from 1 to 5');
  return {
    rating: input.rating,
    comment: text(input.comment ?? input.feedback, 'comment', MAX_COMMENT, true),
    tags: normalizeTags(input.tags)
  };
}

function idOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return value.id ?? value._id?.toString?.() ?? value._id ?? null;
}

function visitIdOf(value) { return idOf(value?.visitId ?? value?.visit?.id ?? value?.visit?._id); }
function customerIdOf(value) { return idOf(value?.customerId ?? value?.booking?.customerId ?? value?.visit?.customerId); }
function sitterIdOf(value) { return idOf(value?.sitterId ?? value?.assignment?.sitterId ?? value?.visit?.sitterId); }
function payloadHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function completedVisit(visit) {
  return visit && ['COMPLETED', 'STAFF_CLOSED'].includes(visit.state);
}

function safeReview(record) {
  if (!record || typeof record !== 'object') return null;
  const state = REVIEW_STATES.includes(record.state) ? record.state : null;
  const result = {
    id: idOf(record.id ?? record._id),
    visitId: visitIdOf(record),
    direction: REVIEW_DIRECTIONS.includes(record.direction) ? record.direction : 'CUSTOMER_TO_SITTER',
    rating: Number.isSafeInteger(record.rating) ? record.rating : null,
    comment: typeof record.comment === 'string' ? record.comment : null,
    tags: Array.isArray(record.tags) ? record.tags.filter(tag => typeof tag === 'string').slice(0, MAX_TAGS) : [],
    state,
    visibility: record.visibility || 'ROLE_SCOPED',
    createdAt: record.createdAt ?? record.submittedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    version: Number.isSafeInteger(record.version) ? record.version : 0
  };
  if (!result.id || !result.visitId || !result.state || !Number.isInteger(result.rating) || result.rating < 1 || result.rating > 5) return null;
  return result;
}

async function callFirst(tx, methods, ...args) {
  const method = methods.find(name => typeof tx?.[name] === 'function');
  return method ? tx[method](...args) : undefined;
}

async function existingOperation(tx, identity, hash) {
  const previous = typeof tx.getIdempotencyResult === 'function' ? await tx.getIdempotencyResult(identity)
    : typeof tx.findOperation === 'function' ? await tx.findOperation(identity) : null;
  if (!previous) return null;
  const oldHash = previous.payloadHash ?? previous.fingerprint;
  if (oldHash && oldHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
  return previous.result ?? previous;
}

async function saveOperation(tx, identity, hash, result) {
  if (typeof tx.saveIdempotencyResult === 'function') {
    await tx.saveIdempotencyResult({ identity, payloadHash: hash, result });
  } else if (typeof tx.recordOperation === 'function') {
    await tx.recordOperation({ ...identity, idempotencyKey: identity.key, fingerprint: hash, result });
  }
}

export function createReviewService({ repository, clock = () => new Date() } = {}) {
  if (!repository || typeof repository.runForVisitActor !== 'function') {
    throw new TypeError('Review repository runForVisitActor port is required');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  async function transaction(actor, visitId, work) {
    active(actor, clock);
    identifier(visitId, 'visitId');
    try { return await repository.runForVisitActor(actor, visitId, work); }
    catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'REVIEW_UNAVAILABLE', 'Review operation is temporarily unavailable');
    }
  }

  async function getVisit(tx, visitId) {
    const visit = await callFirst(tx, ['getVisit', 'findVisit'], visitId);
    if (!visit || (visitIdOf(visit) && visitIdOf(visit) !== visitId)) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }

  async function rateVisit({ actor, visitId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    active(actor, clock);
    if (!hasRole(actor.roles, 'CUSTOMER')) fail(403, 'FORBIDDEN', 'Customer access is required');
    const normalized = normalizeRating(input);
    const expected = expectedVersion(suppliedVersion);
    const key = idempotencyKey(suppliedKey);
    const hash = payloadHash({ visitId, expectedVersion: expected, review: normalized });
    return transaction(actor, visitId, async tx => {
      const visit = await getVisit(tx, visitId);
      if (customerIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
      const identity = { actorRef: actor.userId, resourceRef: visitId, operation: 'REVIEW_RATE', key };
      const previous = await existingOperation(tx, identity, hash);
      if (previous) return previous;
      if (!completedVisit(visit) || !sitterIdOf(visit)) fail(409, 'VISIT_NOT_ELIGIBLE', 'Only an assigned completed visit can be rated');
      if (expected !== null && visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before rating');
      const existing = await callFirst(tx, ['findReview', 'getReview', 'findRating'], {
        visitId, direction: 'CUSTOMER_TO_SITTER', customerId: actor.userId
      });
      if (existing) fail(409, 'REVIEW_ALREADY_EXISTS', 'This visit has already been rated');
      const now = new Date(nowValue(clock)).toISOString();
      const saved = await callFirst(tx, ['createReview', 'createRating', 'saveReview'], {
        id: randomUUID(), kind: 'REVIEW', direction: 'CUSTOMER_TO_SITTER', visitId,
        customerId: actor.userId, sitterId: sitterIdOf(visit), ...normalized,
        state: 'SUBMITTED', visibility: 'ROLE_SCOPED', version: 0, createdAt: now,
        actorId: actor.userId, idempotencyKey: key
      });
      if (!saved) fail(503, 'REVIEW_UNAVAILABLE', 'Review was not acknowledged by the server');
      const review = safeReview({ ...saved, visitId, direction: 'CUSTOMER_TO_SITTER', ...normalized, createdAt: saved.createdAt ?? now });
      if (!review) fail(503, 'REVIEW_UNAVAILABLE', 'Review response is invalid');
      const result = { review, visitId, state: review.state, version: review.version };
      await callFirst(tx, ['appendAuditAndOutbox'], { type: 'VisitRated', actorId: actor.userId, visitId, reviewId: review.id, at: now });
      await saveOperation(tx, identity, hash, result);
      return result;
    });
  }

  async function get({ actor, reviewId } = {}) {
    active(actor, clock);
    const id = identifier(reviewId, 'reviewId');
    if (typeof repository.getReview !== 'function' && typeof repository.findReview !== 'function') {
      fail(503, 'REVIEW_UNAVAILABLE', 'Review read port is not configured');
    }
    let record;
    try { record = await (repository.getReview || repository.findReview)({ actor, reviewId: id }); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'REVIEW_UNAVAILABLE', 'Review is temporarily unavailable'); }
    active(actor, clock);
    const result = safeReview(record);
    if (!result) fail(404, 'RESOURCE_NOT_FOUND', 'Review not found');
    if (hasRole(actor.roles, 'STAFF')) return result;
    if (hasRole(actor.roles, 'CUSTOMER') && idOf(record.customerId) === actor.userId) return result;
    if (hasRole(actor.roles, 'PET_SITTER') && idOf(record.sitterId) === actor.userId) return result;
    fail(404, 'RESOURCE_NOT_FOUND', 'Review not found');
  }

  return Object.freeze({ rateVisit, rate: rateVisit, create: rateVisit, createRating: rateVisit, get, detail: get });
}

export { normalizeRating, safeReview };
export const createRatingService = createReviewService;
