import { AppError } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const WITHDRAWAL_LEAD_MS = 60 * 60 * 1000;

function fail(status, code, message, details = {}) { throw new AppError(status, code, message, details); }

function actorId(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !ID.test(actor.userId)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!Array.isArray(actor.roles) || !actor.roles.includes('PET_SITTER')) {
    fail(403, 'FORBIDDEN', 'Pet sitter access is required');
  }
  return actor.userId;
}

function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) fail(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(422, 'VALIDATION_FAILED', 'Visit version is required');
  return value;
}

function key(value) {
  if (typeof value !== 'string' || !KEY.test(value)) fail(422, 'VALIDATION_FAILED', 'Idempotency key is required');
  return value;
}

function note(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\x00-\x1f\x7f]/.test(value)) {
    fail(422, 'VALIDATION_FAILED', 'Withdrawal reason is invalid');
  }
  return value.trim();
}

/**
 * A sitter can withdraw only at or before the inclusive 60-minute boundary.
 * This command changes the operational assignment record only: it does not
 * request payout/refund, alter the visit schedule, or auto-create a replacement.
 */
export function createVisitWithdrawalService({ repository, clock = Date.now } = {}) {
  if (typeof repository?.runVisitCommand !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Withdrawal repository and clock ports are required');
  }

  async function withdraw({ actor, visitId, expectedVersion, idempotencyKey, reason: explanation } = {}) {
    const sitter = actorId(actor);
    const idValue = id(visitId, 'visitId');
    const expected = version(expectedVersion);
    const operationKey = key(idempotencyKey);
    const content = note(explanation);
    return repository.runVisitCommand({ actor, sitterId: sitter, visitId: idValue, expectedVersion: expected,
      idempotencyKey: operationKey, payload: { action: 'WITHDRAW', visitId: idValue,
        expectedVersion: expected, reason: content }, execute: async transaction => {
        if (!transaction || typeof transaction.getVisit !== 'function' || typeof transaction.withdrawAssignment !== 'function') {
          fail(503, 'WITHDRAWAL_UNAVAILABLE', 'Withdrawal is unavailable');
        }
        const visit = await transaction.getVisit({ visitId: idValue });
        if (!visit || (visit.id ?? visit.visitId) !== idValue) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
        if (visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before continuing');
        if (visit.sitterId !== sitter) fail(403, 'FORBIDDEN', 'Only the assigned sitter can withdraw');
        if (visit.state !== 'ASSIGNED') fail(409, 'VISIT_NOT_WITHDRAWABLE', 'Visit is no longer assigned');
        if (visit.checkInAt !== null && visit.checkInAt !== undefined) {
          fail(409, 'VISIT_ALREADY_STARTED', 'A visit with check-in evidence cannot be withdrawn');
        }
        const startAt = new Date(visit.startAt).getTime();
        const now = Number(clock());
        if (!Number.isFinite(startAt) || !Number.isFinite(now)) fail(503, 'WITHDRAWAL_UNAVAILABLE', 'Visit clock is unavailable');
        const remaining = startAt - now;
        if (remaining < WITHDRAWAL_LEAD_MS) {
          fail(409, 'WITHDRAWAL_WINDOW_CLOSED', 'Staff must process a withdrawal inside the 60-minute window', {
            route: 'STAFF', minLeadMinutes: 60
          });
        }
        const saved = await transaction.withdrawAssignment({ visit, sitterId: sitter,
          expectedVersion: expected, reason: content, now: new Date(now).toISOString() });
        if (!saved || saved.state !== 'WITHDRAWN' || saved.version !== expected + 1) {
          fail(503, 'WITHDRAWAL_UNAVAILABLE', 'Withdrawal was not confirmed');
        }
        await transaction.appendAuditAndOutbox?.({ type: 'VisitAssignmentWithdrawn', actorId: sitter,
          visitId: idValue, at: new Date(now).toISOString(), reason: content });
        return Object.freeze({ visitId: idValue, state: 'WITHDRAWN', version: saved.version,
          needsReassignment: true, scheduleChanged: false, payoutRequested: false });
      }
    });
  }

  return Object.freeze({ withdraw });
}

export { WITHDRAWAL_LEAD_MS };
