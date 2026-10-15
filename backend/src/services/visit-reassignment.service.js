import { AppError } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const KEY = /^[A-Za-z0-9._:-]{8,128}$/;

function fail(status, code, message, details = {}) {
  throw new AppError(status, code, message, details);
}

function activeStaff(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !ID.test(actor.userId)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!Array.isArray(actor.roles) || !(actor.roles.includes('STAFF') || actor.roles.includes('ADMIN'))) {
    fail(403, 'FORBIDDEN', 'Operational access is required');
  }
  return actor.userId;
}

function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) fail(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}

function ver(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(422, 'VALIDATION_FAILED', 'Visit version is required');
  return value;
}

function key(value) {
  if (typeof value !== 'string' || !KEY.test(value)) fail(422, 'VALIDATION_FAILED', 'Idempotency key is required');
  return value;
}

function reason(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f]/.test(value)) {
    fail(422, 'VALIDATION_FAILED', 'Reassignment reason is invalid');
  }
  return value.trim();
}

function instant(value, field) {
  if (typeof value !== 'string' && !(value instanceof Date)) fail(503, 'VISIT_DATA_UNAVAILABLE', `${field} is invalid`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(503, 'VISIT_DATA_UNAVAILABLE', `${field} is invalid`);
  return date;
}

function assertTransaction(transaction) {
  const methods = ['getVisit', 'getSitter', 'recheckEligibility', 'checkSlotAvailability', 'reassignVisit'];
  if (!transaction || methods.some(method => typeof transaction[method] !== 'function')) {
    fail(503, 'REASSIGNMENT_UNAVAILABLE', 'Reassignment is unavailable');
  }
}

/**
 * Staff reassignment is a guarded assignment command. The repository must
 * lock the visit version, old/new sitter eligibility guards and both occupancy
 * slots in one transaction. It must also revoke the old assignment/offer and
 * write the notification/outbox record atomically.
 */
export function createVisitReassignmentService({ repository, clock = Date.now } = {}) {
  if (typeof repository?.runVisitCommand !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Reassignment repository and clock ports are required');
  }

  async function reassign({ actor, visitId, newSitterId, expectedVersion, idempotencyKey, reason: note } = {}) {
    const actorId = activeStaff(actor);
    const targetVisitId = id(visitId, 'visitId');
    const targetSitterId = id(newSitterId, 'sitterId');
    const expected = ver(expectedVersion);
    const operationKey = key(idempotencyKey);
    const content = reason(note);
    return repository.runVisitCommand({ actor, actorId, visitId: targetVisitId, expectedVersion: expected,
      idempotencyKey: operationKey, payload: { action: 'REASSIGN', visitId: targetVisitId,
        newSitterId: targetSitterId, expectedVersion: expected, reason: content },
      execute: async transaction => {
        assertTransaction(transaction);
        const visit = await transaction.getVisit({ visitId: targetVisitId });
        if (!visit || (visit.id ?? visit.visitId) !== targetVisitId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
        if (visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before continuing');
        if (visit.state !== 'ASSIGNED' || typeof visit.sitterId !== 'string') {
          fail(409, 'VISIT_NOT_REASSIGNABLE', 'Visit is not currently assigned');
        }
        if (visit.sitterId === targetSitterId) fail(409, 'ALREADY_ASSIGNED', 'Sitter is already assigned');
        if (instant(visit.startAt, 'startAt').getTime() <= clock()) {
          fail(409, 'VISIT_STARTED', 'A started visit cannot be reassigned');
        }
        const candidate = await transaction.getSitter({ sitterId: targetSitterId, visit });
        if (!candidate || candidate.sitterId !== targetSitterId || candidate.suspended === true
          || candidate.status === 'SUSPENDED' || candidate.state === 'SUSPENDED') {
          fail(409, 'SITTER_SUSPENDED', 'The replacement sitter is suspended or unavailable');
        }
        const eligibility = await transaction.recheckEligibility({ sitterId: targetSitterId, visit, candidate });
        if (!eligibility?.eligible) fail(409, eligibility?.code ?? 'SITTER_NOT_ELIGIBLE', 'Replacement sitter is not eligible');
        const slot = await transaction.checkSlotAvailability({ sitterId: targetSitterId, visit, candidate });
        if (slot !== true && slot?.available !== true) fail(409, 'SLOT_UNAVAILABLE', 'Replacement sitter has a slot conflict');
        const saved = await transaction.reassignVisit({ visit, oldSitterId: visit.sitterId,
          newSitterId: targetSitterId, expectedVersion: expected, reason: content,
          handoverRequired: true, now: new Date(clock()).toISOString() });
        if (!saved || saved.state !== 'ASSIGNED' || saved.sitterId !== targetSitterId
          || saved.version !== expected + 1) fail(503, 'REASSIGNMENT_UNAVAILABLE', 'Reassignment was not confirmed');
        await transaction.appendAuditAndOutbox?.({ type: 'VisitReassigned', actorId, visitId: targetVisitId,
          oldSitterId: visit.sitterId, newSitterId: targetSitterId, handoverRequired: true,
          at: new Date(clock()).toISOString(), reason: content });
        await transaction.notify?.({ recipientIds: [visit.sitterId, targetSitterId], type: 'VISIT_REASSIGNED',
          visitId: targetVisitId });
        return Object.freeze({ visitId: targetVisitId, state: 'ASSIGNED', sitterId: targetSitterId,
          previousSitterId: visit.sitterId, version: saved.version, handoverRequired: true,
          scheduleChanged: false, payoutChanged: false });
      }
    });
  }

  return Object.freeze({ reassign });
}
