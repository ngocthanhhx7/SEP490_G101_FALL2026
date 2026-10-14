import { createHash } from 'node:crypto';
import { hasRole } from '../../middlewares/session.js';
import { AppError } from '../../utils/app-error.js';

export const REFUND_STATUS = Object.freeze({
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  TRANSFER_PENDING: 'TRANSFER_PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED'
});

const SOURCE_TYPES = new Set(['CANCELLATION', 'CASE', 'ADJUSTMENT']);
const CAPACITY_BUCKETS = new Set(['REFUNDABLE_AVAILABLE', 'NET_COLLECTED_AVAILABLE', 'ELIGIBLE_REFUND']);
const DECISIONS = new Set(['APPROVE', 'REJECT']);
const TRANSFER_OUTCOMES = new Set(['CONFIRMED', 'UNKNOWN', 'FAILED']);
const ACTOR_ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const REFERENCE = /^[\p{L}\p{N}._:/-]{1,160}$/u;

function fail(status, code, message, details) {
  throw new AppError(status, code, message, details);
}

function requiredText(value, field, { min = 1, max = 500 } = {}) {
  if (typeof value !== 'string') fail(422, 'VALIDATION_FAILED', `${field} is required`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail(422, 'VALIDATION_FAILED', `${field} is invalid`);
  }
  return normalized;
}

function safeAmount(value, field = 'amountVnd') {
  if (!Number.isSafeInteger(value) || value <= 0) {
    fail(422, 'VALIDATION_FAILED', `${field} must be a positive integer VND amount`);
  }
  return value;
}

function safeVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(422, 'VALIDATION_FAILED', 'expectedVersion is invalid');
  }
  return value;
}

function normalizeSourceRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !SOURCE_TYPES.has(value.type)) {
    fail(422, 'VALIDATION_FAILED', 'sourceRef is invalid');
  }
  return Object.freeze({
    type: value.type,
    id: requiredText(value.id, 'sourceRef.id', { max: 128 })
  });
}

function validActor(actor) {
  return actor?.state === 'ACTIVE' && typeof actor.userId === 'string' && actor.userId.length > 0
    && Array.isArray(actor.roles) && actor.roles.length > 0
    && actor.roles.every(role => ACTOR_ROLES.has(role));
}

function requireStaff(actor) {
  if (!validActor(actor)) fail(401, 'UNAUTHENTICATED', 'Authentication required');
  if (!hasRole(actor.roles, 'STAFF')) fail(403, 'FORBIDDEN', 'Action is not permitted');
}

function requireAdmin(actor) {
  if (!validActor(actor)) fail(401, 'UNAUTHENTICATED', 'Authentication required');
  if (!actor.roles.includes('ADMIN')) fail(403, 'FORBIDDEN', 'Action is not permitted');
}

function operationKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    fail(422, 'VALIDATION_FAILED', 'Idempotency-Key is required');
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function timestamp(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Refund clock must return a valid date');
  return date.toISOString();
}

function normalizedPaidAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail(422, 'VALIDATION_FAILED', 'paidAt must be a valid timestamp');
  }
  return new Date(value).toISOString();
}

function publicRefund(refund) {
  if (!refund || typeof refund !== 'object') throw new TypeError('Refund repository returned an invalid record');
  const id = refund.id ?? refund._id;
  if (id === undefined || id === null || typeof refund.sourceRef?.type !== 'string'
    || typeof refund.sourceRef?.id !== 'string') {
    throw new TypeError('Refund repository returned an incomplete record');
  }
  return Object.freeze({
    id: String(id),
    sourceRef: { type: refund.sourceRef.type, id: String(refund.sourceRef.id) },
    amountVnd: refund.amountVnd,
    currency: 'VND',
    reason: refund.reason,
    status: refund.status,
    version: refund.version,
    createdAt: refund.createdAt,
    decision: refund.decision ? {
      outcome: refund.decision.outcome,
      reason: refund.decision.reason,
      decidedAt: refund.decision.decidedAt
    } : null,
    transfer: refund.transfer ? {
      outcome: refund.transfer.outcome,
      amountVnd: refund.transfer.amountVnd ?? null,
      reference: refund.transfer.reference ?? null,
      evidenceReference: refund.transfer.evidenceReference ?? null,
      paidAt: refund.transfer.paidAt ?? null
    } : null
  });
}

function requireDependencies({ unitOfWork, refunds, ledger, capacity, authorizeSource, clock }) {
  const methods = ['findCommand', 'saveCommand', 'create', 'getById', 'compareAndSet',
    'reserveRefundableAmount', 'settleRefundReservation', 'releaseRefundReservation', 'appendEvent'];
  if (typeof unitOfWork?.run !== 'function'
    || methods.some(method => typeof refunds?.[method] !== 'function')
    || typeof ledger?.append !== 'function'
    || typeof capacity?.resolve !== 'function'
    || typeof authorizeSource !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Refund service requires transactional repositories and financial policy ports');
  }
}

export function createRefundService({ unitOfWork, refunds, ledger, capacity, authorizeSource,
  clock = () => new Date() }) {
  requireDependencies({ unitOfWork, refunds, ledger, capacity, authorizeSource, clock });

  async function execute({ actor, operation, idempotencyKey, payload, run, onReplay }) {
    const key = operationKey(idempotencyKey);
    const commandFingerprint = fingerprint(payload);
    return unitOfWork.run(async transaction => {
      const existing = await refunds.findCommand({ actorId: actor.userId, operation, key }, transaction);
      if (existing) {
        if (existing.fingerprint !== commandFingerprint) {
          fail(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was already used for another command');
        }
        await onReplay?.(transaction);
        return existing.result;
      }
      const result = await run(transaction);
      await refunds.saveCommand({ actorId: actor.userId, operation, key,
        fingerprint: commandFingerprint, result }, transaction);
      return result;
    });
  }

  async function authorize(actor, sourceRef, action, transaction) {
    const allowed = await authorizeSource({ actor, sourceRef, action, transaction });
    if (allowed !== true) fail(403, 'FORBIDDEN', 'Action is not permitted');
  }

  async function getCapacity(sourceRef, transaction) {
    const result = await capacity.resolve({ sourceRef, transaction });
    const decisionIds = Array.isArray(result?.decisionIds) ? [...new Set(result.decisionIds)] : [];
    if (result?.ready !== true || !Array.isArray(result?.decisionIds) || decisionIds.length > 0
      || !CAPACITY_BUCKETS.has(result?.bucket)) {
      fail(409, 'DECISION_REQUIRED', 'Refund amount cannot be determined until financial decisions are closed', { decisionIds });
    }
    if (!Number.isSafeInteger(result?.availableRefundableVnd) || result.availableRefundableVnd < 0) {
      fail(503, 'REFUND_CAPACITY_UNAVAILABLE', 'Refund capacity is temporarily unavailable');
    }
    return { amountVnd: result.availableRefundableVnd, bucket: result.bucket };
  }

  function appendLedger(entry, transaction) {
    return ledger.append(Object.freeze({ currency: 'VND', ...entry }), transaction);
  }

  async function propose({ actor, input, idempotencyKey }) {
    requireStaff(actor);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      fail(422, 'VALIDATION_FAILED', 'Refund proposal is invalid');
    }
    const sourceRef = normalizeSourceRef(input.sourceRef);
    const amountVnd = safeAmount(input.amountVnd);
    const reason = requiredText(input.reason, 'reason');
    const evidenceRefs = input.evidenceRefs === undefined ? [] : input.evidenceRefs;
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 20) {
      fail(422, 'VALIDATION_FAILED', 'evidenceRefs is invalid');
    }
    const normalizedEvidenceRefs = evidenceRefs.map(reference => requiredText(reference, 'evidenceRef', { max: 160 }));
    const payload = { sourceRef, amountVnd, reason, evidenceRefs: normalizedEvidenceRefs };
    return execute({ actor, operation: 'REFUND_PROPOSE', idempotencyKey,
      payload, onReplay: transaction => authorize(actor, sourceRef, 'PROPOSE_REFUND', transaction),
      run: async transaction => {
        await authorize(actor, sourceRef, 'PROPOSE_REFUND', transaction);
        const available = await getCapacity(sourceRef, transaction);
        if (amountVnd > available.amountVnd) {
          fail(409, 'REFUND_LIMIT_EXCEEDED', 'Proposed refund exceeds the remaining collected amount', { availableRefundableVnd: available.amountVnd });
        }
        const createdAt = timestamp(clock);
        const refund = await refunds.create({ sourceRef, amountVnd, reason, evidenceRefs: normalizedEvidenceRefs,
          status: REFUND_STATUS.PROPOSED, version: 0, createdAt, proposedBy: actor.userId }, transaction);
        const result = publicRefund(refund);
        await refunds.appendEvent({ refundId: result.id, type: 'REFUND_PROPOSED', amountVnd,
          actorId: actor.userId, occurredAt: createdAt, sourceRef }, transaction);
        return result;
      } });
  }

  async function decide({ actor, refundId, decision, reason, expectedVersion, idempotencyKey }) {
    requireAdmin(actor);
    const id = requiredText(refundId, 'refundId', { max: 128 });
    if (!DECISIONS.has(decision)) fail(422, 'VALIDATION_FAILED', 'decision must be APPROVE or REJECT');
    const note = requiredText(reason, 'reason');
    const version = safeVersion(expectedVersion);
    const payload = { refundId: id, decision, reason: note, expectedVersion: version };
    return execute({ actor, operation: 'REFUND_DECIDE', idempotencyKey, payload,
      onReplay: async transaction => {
        const refund = await refunds.getById(id, transaction);
        if (!refund) fail(404, 'RESOURCE_NOT_FOUND', 'Refund request not found');
        await authorize(actor, refund.sourceRef, 'DECIDE_REFUND', transaction);
      }, run: async transaction => {
      const refund = await refunds.getById(id, transaction);
      if (!refund) fail(404, 'RESOURCE_NOT_FOUND', 'Refund request not found');
      if (refund.status !== REFUND_STATUS.PROPOSED) fail(409, 'INVALID_STATE', 'Only proposed refunds can be decided');
      if (refund.version !== version) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
      await authorize(actor, refund.sourceRef, 'DECIDE_REFUND', transaction);
      const occurredAt = timestamp(clock);
      if (decision === 'REJECT') {
        const updated = await refunds.compareAndSet(id, version, {
          status: REFUND_STATUS.REJECTED,
          version: version + 1,
          decision: { outcome: decision, reason: note, decidedAt: occurredAt, decidedBy: actor.userId }
        }, transaction);
        if (!updated) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
        const result = publicRefund(updated);
        await refunds.appendEvent({ refundId: id, type: 'REFUND_REJECTED', amountVnd: refund.amountVnd,
          actorId: actor.userId, occurredAt, reason: note }, transaction);
        return result;
      }

      const available = await getCapacity(refund.sourceRef, transaction);
      if (refund.amountVnd > available.amountVnd) {
        fail(409, 'REFUND_LIMIT_EXCEEDED', 'Approved refund exceeds the remaining collected amount', { availableRefundableVnd: available.amountVnd });
      }
      const reserved = await refunds.reserveRefundableAmount({ refundId: id, sourceRef: refund.sourceRef,
        amountVnd: refund.amountVnd }, transaction);
      if (reserved !== true) fail(409, 'REFUND_LIMIT_EXCEEDED', 'Refund capacity was reserved by another financial operation');
      const updated = await refunds.compareAndSet(id, version, {
        status: REFUND_STATUS.APPROVED,
        version: version + 1,
        decision: { outcome: decision, reason: note, decidedAt: occurredAt, decidedBy: actor.userId }
      }, transaction);
      if (!updated) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
      await appendLedger({ operationId: `refund:${id}:reserve:v${version + 1}`,
        entryType: 'REFUND_RESERVED', sourceRef: refund.sourceRef, refundId: id,
        fromBucket: 'REFUNDABLE_AVAILABLE', toBucket: 'REFUND_RESERVED', amountVnd: refund.amountVnd,
        actorId: actor.userId, occurredAt }, transaction);
      const result = publicRefund(updated);
      await refunds.appendEvent({ refundId: id, type: 'REFUND_APPROVED', amountVnd: refund.amountVnd,
        actorId: actor.userId, occurredAt, reason: note }, transaction);
      return result;
    } });
  }

  async function recordTransfer({ actor, refundId, outcome, amountVnd, transferReference,
    evidenceReference, paidAt, expectedVersion, idempotencyKey }) {
    requireAdmin(actor);
    const id = requiredText(refundId, 'refundId', { max: 128 });
    if (!TRANSFER_OUTCOMES.has(outcome)) fail(422, 'VALIDATION_FAILED', 'Transfer outcome is invalid');
    const version = safeVersion(expectedVersion);
    const transferRef = transferReference === undefined ? undefined
      : requiredText(transferReference, 'transferReference', { max: 160 });
    const evidenceRef = evidenceReference === undefined ? undefined
      : requiredText(evidenceReference, 'evidenceReference', { max: 160 });
    if (transferRef && !REFERENCE.test(transferRef)) fail(422, 'VALIDATION_FAILED', 'transferReference is invalid');
    if (evidenceRef && !REFERENCE.test(evidenceRef)) fail(422, 'VALIDATION_FAILED', 'evidenceReference is invalid');
    const transferAmountVnd = amountVnd === undefined ? undefined : safeAmount(amountVnd);
    const paidAtIso = paidAt === undefined ? undefined : normalizedPaidAt(paidAt);
    if (outcome === 'CONFIRMED' && (!transferAmountVnd || !transferRef || !evidenceRef || !paidAtIso)) {
      fail(422, 'VALIDATION_FAILED', 'Confirmed transfers require the full amount, reference, evidence and paidAt');
    }
    if (outcome === 'FAILED' && !evidenceRef) fail(422, 'VALIDATION_FAILED', 'Failed transfers require evidence');
    const payload = { refundId: id, outcome, amountVnd: transferAmountVnd, transferReference: transferRef,
      evidenceReference: evidenceRef, paidAt: paidAtIso, expectedVersion: version };
    return execute({ actor, operation: 'REFUND_TRANSFER', idempotencyKey, payload,
      onReplay: async transaction => {
        const refund = await refunds.getById(id, transaction);
        if (!refund) fail(404, 'RESOURCE_NOT_FOUND', 'Refund request not found');
        await authorize(actor, refund.sourceRef, 'RECORD_REFUND_TRANSFER', transaction);
      }, run: async transaction => {
      const refund = await refunds.getById(id, transaction);
      if (!refund) fail(404, 'RESOURCE_NOT_FOUND', 'Refund request not found');
      if (![REFUND_STATUS.APPROVED, REFUND_STATUS.TRANSFER_PENDING].includes(refund.status)) {
        fail(409, 'INVALID_STATE', 'Only approved or pending refunds can record a transfer');
      }
      if (refund.version !== version) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
      await authorize(actor, refund.sourceRef, 'RECORD_REFUND_TRANSFER', transaction);
      const occurredAt = timestamp(clock);
      if (paidAtIso && Date.parse(paidAtIso) > Date.parse(occurredAt)) {
        fail(422, 'VALIDATION_FAILED', 'paidAt cannot be in the future');
      }

      if (outcome === 'UNKNOWN' || (outcome === 'CONFIRMED' && transferAmountVnd !== refund.amountVnd)) {
        const transfer = { outcome: transferAmountVnd !== undefined && transferAmountVnd !== refund.amountVnd
          ? 'AMOUNT_MISMATCH' : 'UNKNOWN', amountVnd: transferAmountVnd,
        reference: transferRef, evidenceReference: evidenceRef };
        const updated = await refunds.compareAndSet(id, version, {
          status: REFUND_STATUS.TRANSFER_PENDING, version: version + 1, transfer
        }, transaction);
        if (!updated) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
        const result = publicRefund(updated);
        await refunds.appendEvent({ refundId: id, type: 'REFUND_TRANSFER_PENDING', amountVnd: refund.amountVnd,
          actorId: actor.userId, occurredAt, transfer }, transaction);
        return result;
      }

      if (outcome === 'FAILED') {
        if (refund.status !== REFUND_STATUS.APPROVED) {
          fail(409, 'TRANSFER_RECONCILIATION_REQUIRED', 'An uncertain transfer cannot release its reservation without reconciliation');
        }
        const released = await refunds.releaseRefundReservation({ refundId: id, sourceRef: refund.sourceRef,
          amountVnd: refund.amountVnd }, transaction);
        if (released !== true) fail(409, 'REFUND_RESERVATION_MISSING', 'Refund reservation could not be reconciled');
        const updated = await refunds.compareAndSet(id, version, {
          status: REFUND_STATUS.FAILED, version: version + 1,
          transfer: { outcome, reference: transferRef, evidenceReference: evidenceRef }
        }, transaction);
        if (!updated) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
        await appendLedger({ operationId: `refund:${id}:release:v${version + 1}`,
          entryType: 'REFUND_RESERVATION_RELEASED', sourceRef: refund.sourceRef, refundId: id,
          fromBucket: 'REFUND_RESERVED', toBucket: 'REFUNDABLE_AVAILABLE', amountVnd: refund.amountVnd,
          actorId: actor.userId, occurredAt }, transaction);
        const result = publicRefund(updated);
        await refunds.appendEvent({ refundId: id, type: 'REFUND_TRANSFER_FAILED', amountVnd: refund.amountVnd,
          actorId: actor.userId, occurredAt, transfer: updated.transfer }, transaction);
        return result;
      }

      const settled = await refunds.settleRefundReservation({ refundId: id, sourceRef: refund.sourceRef,
        amountVnd: refund.amountVnd }, transaction);
      if (settled !== true) fail(409, 'REFUND_RESERVATION_MISSING', 'Refund reservation could not be reconciled');
      const transfer = { outcome: 'CONFIRMED', amountVnd: transferAmountVnd, reference: transferRef,
        evidenceReference: evidenceRef, paidAt: paidAtIso };
      const updated = await refunds.compareAndSet(id, version, {
        status: REFUND_STATUS.PAID, version: version + 1, transfer
      }, transaction);
      if (!updated) fail(409, 'VERSION_CONFLICT', 'Refund request has changed');
      await appendLedger({ operationId: `refund:${id}:paid:v${version + 1}`,
        entryType: 'REFUND_PAID', sourceRef: refund.sourceRef, refundId: id,
        fromBucket: 'REFUND_RESERVED', toBucket: 'REFUNDED_PAID', amountVnd: refund.amountVnd,
        actorId: actor.userId, occurredAt, transferReference: transferRef,
        evidenceReference: evidenceRef, paidAt: paidAtIso }, transaction);
      const result = publicRefund(updated);
      await refunds.appendEvent({ refundId: id, type: 'REFUND_TRANSFER_CONFIRMED', amountVnd: refund.amountVnd,
        actorId: actor.userId, occurredAt, transfer }, transaction);
      return result;
    } });
  }

  return Object.freeze({ propose, decide, recordTransfer });
}
