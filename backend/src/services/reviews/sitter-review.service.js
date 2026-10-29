import { createHash, randomUUID } from 'node:crypto';
import { hasRole } from '../../utils/roles.js';
import { AppError } from '../../utils/app-error.js';
import { normalizeRating, safeReview } from './review.service.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const fail = (status, code, message, details = {}) => {
  throw new AppError(status, code, message, details);
};

function nowValue(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new TypeError('clock must return a valid date');
  return date.getTime();
}

function active(actor, clock) {
  if (
    !actor ||
    actor.state !== 'ACTIVE' ||
    actor.synthetic === true ||
    typeof actor.userId !== 'string' ||
    !ID.test(actor.userId) ||
    !Array.isArray(actor.roles) ||
    actor.roles.length === 0 ||
    actor.roles.some(
      (role) => !['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(role)
    ) ||
    !Number.isFinite(actor.expiresAt) ||
    actor.expiresAt <= nowValue(clock)
  ) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}

function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value))
    fail(422, 'VALIDATION_FAILED', `${field} is invalid`, {
      fieldErrors: { [field]: `${field} is invalid` }
    });
  return value;
}

function expectedVersion(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0)
    fail(422, 'VALIDATION_FAILED', 'A nonnegative version is required', {
      fieldErrors: { expectedVersion: 'A nonnegative version is required' }
    });
  return value;
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value))
    fail(422, 'VALIDATION_FAILED', 'An idempotency key is required', {
      fieldErrors: { idempotencyKey: 'An idempotency key is required' }
    });
  return value;
}

function idOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return value.id ?? value._id?.toString?.() ?? value._id ?? null;
}

function visitIdOf(value) {
  return idOf(value?.visitId ?? value?.visit?.id ?? value?.visit?._id);
}
function customerIdOf(value) {
  return idOf(
    value?.customerId ?? value?.booking?.customerId ?? value?.visit?.customerId
  );
}
function sitterIdOf(value) {
  return idOf(
    value?.sitterId ?? value?.assignment?.sitterId ?? value?.visit?.sitterId
  );
}
function payloadHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function callFirst(tx, methods, ...args) {
  const method = methods.find((name) => typeof tx?.[name] === 'function');
  return method ? tx[method](...args) : undefined;
}

function requirePort(tx, methods, label) {
  if (!methods.some((name) => typeof tx?.[name] === 'function')) {
    fail(
      503,
      'REVIEW_UNAVAILABLE',
      `${label} repository port is not configured`
    );
  }
}

async function existingOperation(tx, identity, hash) {
  const previous =
    typeof tx.getIdempotencyResult === 'function'
      ? await tx.getIdempotencyResult(identity)
      : typeof tx.findOperation === 'function'
        ? await tx.findOperation(identity)
        : null;
  if (!previous) return null;
  const oldHash = previous.payloadHash ?? previous.fingerprint;
  if (oldHash && oldHash !== hash)
    fail(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This idempotency key was used for a different request'
    );
  return previous.result ?? previous;
}

async function saveOperation(tx, identity, hash, result) {
  if (typeof tx.saveIdempotencyResult === 'function')
    await tx.saveIdempotencyResult({ identity, payloadHash: hash, result });
  else if (typeof tx.recordOperation === 'function')
    await tx.recordOperation({
      ...identity,
      idempotencyKey: identity.key,
      fingerprint: hash,
      result
    });
}

function completedVisit(visit) {
  return visit && ['COMPLETED', 'STAFF_CLOSED'].includes(visit.state);
}

export function createSitterReviewService({
  repository,
  clock = () => new Date(),
  policy
} = {}) {
  if (!repository || typeof repository.runForVisitActor !== 'function')
    throw new TypeError('Review repository runForVisitActor port is required');
  if (typeof clock !== 'function')
    throw new TypeError('clock must be a function');

  async function transaction(actor, visitId, work) {
    active(actor, clock);
    id(visitId, 'visitId');
    try {
      return await repository.runForVisitActor(actor, visitId, work);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'REVIEW_UNAVAILABLE',
        'Review operation is temporarily unavailable'
      );
    }
  }

  async function getVisit(tx, visitId) {
    const visit = await callFirst(tx, ['getVisit', 'findVisit'], visitId);
    if (!visit || (visitIdOf(visit) && visitIdOf(visit) !== visitId))
      fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }

  async function ratingDecision(actor, visit, at) {
    if (typeof policy?.getSitterRatingDecision !== 'function')
      fail(409, 'DECISION_REQUIRED', 'Sitter rating policy is not configured');
    let decision;
    try {
      decision = await policy.getSitterRatingDecision({
        actor,
        visit,
        direction: 'SITTER_TO_CUSTOMER',
        at: new Date(at).toISOString()
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'REVIEW_UNAVAILABLE',
        'Sitter rating policy is temporarily unavailable'
      );
    }
    if (!decision || decision.allow !== true)
      fail(
        409,
        'DECISION_REQUIRED',
        'Sitter rating policy does not permit this operation',
        { decisionIds: decision?.decisionIds }
      );
    if (
      decision.visibility !== 'ROLE_SCOPED' ||
      !['SUBMITTED', 'PUBLISHED', 'WITHHELD'].includes(decision.reviewState)
    ) {
      fail(
        409,
        'DECISION_REQUIRED',
        'Sitter rating visibility and moderation policy are not configured',
        { decisionIds: decision.decisionIds }
      );
    }
    if (decision.expiresAt !== undefined) {
      const expiresAt = Date.parse(decision.expiresAt);
      if (!Number.isFinite(expiresAt))
        fail(
          409,
          'DECISION_REQUIRED',
          'Sitter rating policy expiry is invalid',
          { decisionIds: decision.decisionIds }
        );
      if (at > expiresAt)
        fail(
          409,
          'RATING_WINDOW_EXPIRED',
          'The sitter rating window has expired'
        );
    }
    return decision;
  }

  async function rateCustomer({
    actor,
    visitId,
    expectedVersion: suppliedVersion,
    idempotencyKey: suppliedKey,
    ...input
  } = {}) {
    active(actor, clock);
    if (!hasRole(actor.roles, 'PET_SITTER'))
      fail(403, 'FORBIDDEN', 'Pet sitter access is required');
    const normalized = normalizeRating(input);
    const expected = expectedVersion(suppliedVersion);
    const key = idempotencyKey(suppliedKey);
    const hash = payloadHash({
      visitId,
      expectedVersion: expected,
      direction: 'SITTER_TO_CUSTOMER',
      review: normalized
    });
    return transaction(actor, visitId, async (tx) => {
      requirePort(
        tx,
        ['getIdempotencyResult', 'findOperation'],
        'Idempotency read'
      );
      requirePort(
        tx,
        ['saveIdempotencyResult', 'recordOperation'],
        'Idempotency write'
      );
      requirePort(
        tx,
        ['findReview', 'getReview', 'findRating'],
        'Direction-specific review lookup'
      );
      requirePort(
        tx,
        ['createReview', 'createRating', 'saveReview'],
        'Review write'
      );
      const visit = await getVisit(tx, visitId);
      if (sitterIdOf(visit) !== actor.userId)
        fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
      const identity = {
        actorRef: actor.userId,
        resourceRef: visitId,
        operation: 'SITTER_REVIEW_RATE',
        key
      };
      const previous = await existingOperation(tx, identity, hash);
      if (previous) return previous;
      if (!completedVisit(visit) || !customerIdOf(visit))
        fail(
          409,
          'VISIT_NOT_ELIGIBLE',
          'Only an assigned completed visit can be rated'
        );
      if (expected !== null && visit.version !== expected)
        fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before rating');
      const at = nowValue(clock);
      const decision = await ratingDecision(actor, visit, at);
      const existing = await callFirst(
        tx,
        ['findReview', 'getReview', 'findRating'],
        { visitId, direction: 'SITTER_TO_CUSTOMER', sitterId: actor.userId }
      );
      if (existing)
        fail(
          409,
          'REVIEW_ALREADY_EXISTS',
          'This visit has already been rated in this direction'
        );
      const now = new Date(at).toISOString();
      const saved = await callFirst(
        tx,
        ['createReview', 'createRating', 'saveReview'],
        {
          id: randomUUID(),
          kind: 'REVIEW',
          direction: 'SITTER_TO_CUSTOMER',
          visitId,
          customerId: customerIdOf(visit),
          sitterId: actor.userId,
          ...normalized,
          state: decision.reviewState,
          visibility: decision.visibility,
          version: 0,
          createdAt: now,
          actorId: actor.userId,
          idempotencyKey: key
        }
      );
      if (!saved)
        fail(
          503,
          'REVIEW_UNAVAILABLE',
          'Review was not acknowledged by the server'
        );
      const review = safeReview({
        ...saved,
        visitId,
        direction: 'SITTER_TO_CUSTOMER',
        ...normalized,
        createdAt: saved.createdAt ?? now
      });
      if (
        !review ||
        review.direction !== 'SITTER_TO_CUSTOMER' ||
        review.state !== decision.reviewState ||
        review.visibility !== decision.visibility
      ) {
        fail(503, 'REVIEW_UNAVAILABLE', 'Review response is invalid');
      }
      const result = {
        review,
        visitId,
        state: review.state,
        version: review.version
      };
      await callFirst(tx, ['appendAuditAndOutbox'], {
        type: 'SitterRatedCustomer',
        actorId: actor.userId,
        visitId,
        reviewId: review.id,
        decisionIds: decision.decisionIds,
        at: now
      });
      await saveOperation(tx, identity, hash, result);
      return result;
    });
  }

  return Object.freeze({
    rateCustomer,
    rateSitter: rateCustomer,
    create: rateCustomer,
    createRating: rateCustomer
  });
}

export const createSitterRatingService = createSitterReviewService;
