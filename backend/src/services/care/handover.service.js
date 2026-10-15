import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const ACCESS_WINDOW_MS = 60 * 60 * 1000;
const fail = (status, code, message, details = {}) => { throw new AppError(status, code, message, details); };
const invalid = (field, message = 'Handover request is invalid') => fail(422, 'VALIDATION_FAILED', message, { fieldErrors: field ? { [field]: message } : undefined });

function nowValue(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('clock must return a valid date');
  return date.getTime();
}

function actorId(actor, clock) {
  if (!actor || actor.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !ID.test(actor.userId)
    || !Array.isArray(actor.roles) || actor.roles.length === 0 || !Number.isFinite(actor.expiresAt)
    || actor.expiresAt <= nowValue(clock)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return actor.userId;
}

function hasRole(actor, name) { return Array.isArray(actor?.roles) && actor.roles.includes(name); }
function isOperational(actor) { return hasRole(actor, 'STAFF') || hasRole(actor, 'ADMIN'); }

function identifier(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, 'A valid resource identifier is required');
  return value;
}

function version(value, field = 'expectedVersion') {
  if (!Number.isSafeInteger(value) || value < 0) invalid(field, 'A nonnegative version is required');
  return value;
}

function key(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}

function text(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) invalid('message');
  return value.trim() || null;
}

function idOf(value) { return value?.id ?? value?._id?.toString?.() ?? value?._id ?? value; }
function customerIdOf(visit) { return visit?.customerId ?? visit?.booking?.customerId; }
function sitterIdOf(visit) { return visit?.sitterId ?? visit?.assignment?.sitterId ?? visit?.assignment?.currentSitterId; }

function repositoryError(error) {
  if (error instanceof AppError) throw error;
  throw new AppError(503, 'HANDOVER_UNAVAILABLE', 'Handover operation is temporarily unavailable');
}

function assertRepository(repository) {
  if (typeof repository?.runForVisitActor !== 'function') throw new TypeError('runForVisitActor repository port is required');
}

/**
 * WBS-036 handover boundary. A persistence adapter must make the replacement
 * assignment, instruction acknowledgement, access capability and audit/outbox
 * records one transaction. This service never grants access by changing a
 * client-visible flag alone.
 */
export function createHandoverService({ repository, clock = () => new Date() } = {}) {
  assertRepository(repository);
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  async function run(actor, visitId, work) {
    actorId(actor, clock);
    identifier(visitId, 'visitId');
    try { return await repository.runForVisitActor(actor, visitId, work); } catch (error) { return repositoryError(error); }
  }

  async function loadVisit(tx, visitId) {
    const visit = typeof tx.getVisit === 'function' ? await tx.getVisit(visitId)
      : typeof tx.findVisit === 'function' ? await tx.findVisit(visitId) : null;
    if (!visit) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }

  function authorize(actor, visit, { confirm = false } = {}) {
    if (isOperational(actor)) return;
    if (hasRole(actor, 'CUSTOMER') && customerIdOf(visit) === actor.userId) return;
    if (!confirm && hasRole(actor, 'PET_SITTER') && sitterIdOf(visit) === actor.userId) return;
    fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }

  async function confirm({ actor, visitId, replacementSitterId, expectedVersion, instructionVersion,
    idempotencyKey: suppliedKey, message } = {}) {
    const replacementId = identifier(replacementSitterId, 'replacementSitterId');
    const expected = version(expectedVersion);
    const instructions = version(instructionVersion, 'instructionVersion');
    const idempotency = key(suppliedKey);
    const note = text(message);
    const fingerprint = createHash('sha256').update(JSON.stringify({ visitId, replacementId, expected, instructions, note })).digest('hex');
    return run(actor, visitId, async tx => {
      const visit = await loadVisit(tx, visitId);
      authorize(actor, visit, { confirm: true });
      if (visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before confirming handover');
      if (visit.state && ['COMPLETED', 'CANCELLED', 'STAFF_CLOSED'].includes(visit.state)) fail(409, 'INVALID_STATE', 'Visit no longer accepts a handover');
      const identity = { actorRef: actor.userId, operation: 'VISIT_HANDOVER_CONFIRM', resourceRef: visitId, key: idempotency };
      if (typeof tx.getIdempotencyResult === 'function') {
        const previous = await tx.getIdempotencyResult(identity);
        if (previous) {
          if (previous.payloadHash !== fingerprint) fail(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
          return previous.result;
        }
      }
      const current = typeof tx.getHandover === 'function' ? await tx.getHandover(visitId) : null;
      if (current?.state === 'CONFIRMED') {
        if (current.replacementSitterId !== replacementId || current.instructionVersion !== instructions) {
          fail(409, 'INVALID_STATE', 'A different handover is already confirmed');
        }
        if (current.accessGranted !== true) fail(503, 'HANDOVER_UNAVAILABLE', 'Confirmed handover access is unavailable');
        const replay = { ...current };
        if (typeof tx.saveIdempotencyResult === 'function') await tx.saveIdempotencyResult({ identity, payloadHash: fingerprint, result: replay });
        return replay;
      }
      if (sitterIdOf(visit) === replacementId) fail(409, 'REPLACEMENT_NOT_ELIGIBLE', 'The replacement sitter must differ from the current sitter');
      const assignment = typeof tx.getReplacementAssignment === 'function'
        ? await tx.getReplacementAssignment({ visitId, sitterId: replacementId }) : null;
      if (!assignment || idOf(assignment.sitterId ?? assignment.userId) !== replacementId
        || ['REVOKED', 'WITHDRAWN', 'DECLINED'].includes(assignment.state)) {
        fail(409, 'REPLACEMENT_NOT_ELIGIBLE', 'The replacement sitter is not eligible for this visit');
      }
      const care = typeof tx.getCareInstructions === 'function' ? await tx.getCareInstructions(visitId) : null;
      if (!care || care.version !== instructions) fail(409, 'VERSION_CONFLICT', 'The replacement must acknowledge the latest care instructions');
      const acknowledged = Array.isArray(care.acknowledgements)
        && care.acknowledgements.some(item => item.sitterId === replacementId && item.version === instructions);
      if (!acknowledged) fail(409, 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED', 'The replacement sitter must acknowledge the latest care instructions first');
      const confirmedAt = new Date(nowValue(clock)).toISOString();
      if (typeof tx.confirmHandover !== 'function') {
        fail(503, 'HANDOVER_UNAVAILABLE', 'Handover persistence is unavailable');
      }
      const result = await tx.confirmHandover({
        visit, replacementSitterId: replacementId, instructionVersion: instructions,
        actorId: actor.userId, message: note, confirmedAt, expectedVersion: expected
      });
      if (!result || typeof result !== 'object' || result.state !== 'CONFIRMED'
        || result.accessGranted !== true || result.replacementSitterId !== replacementId) {
        fail(503, 'HANDOVER_UNAVAILABLE', 'Handover was not confirmed');
      }
      if (typeof tx.appendAuditAndOutbox === 'function') await tx.appendAuditAndOutbox({
        type: 'VisitHandoverConfirmed', actorId: actor.userId, visitId, replacementSitterId: replacementId,
        instructionVersion: instructions, at: confirmedAt
      });
      if (typeof tx.saveIdempotencyResult === 'function') await tx.saveIdempotencyResult({ identity, payloadHash: fingerprint, result });
      return result;
    });
  }

  async function get({ actor, visitId } = {}) {
    return run(actor, visitId, async tx => {
      const visit = await loadVisit(tx, visitId);
      authorize(actor, visit);
      const handover = typeof tx.getHandover === 'function' ? await tx.getHandover(visitId) : null;
      if (!handover) return { visitId, state: 'REQUIRED', replacementSitterId: null, accessGranted: false };
      return {
        visitId,
        state: ['REQUIRED', 'PENDING', 'CONFIRMED', 'REVOKED'].includes(handover.state) ? handover.state : 'PENDING',
        replacementSitterId: handover.replacementSitterId ?? null,
        instructionVersion: Number.isSafeInteger(handover.instructionVersion) ? handover.instructionVersion : null,
        confirmedAt: handover.confirmedAt ?? null,
        accessGranted: handover.state === 'CONFIRMED' && handover.accessGranted === true
      };
    });
  }

  return Object.freeze({ confirm, confirmHandover: confirm, get, getHandover: get });
}

export { ACCESS_WINDOW_MS };
