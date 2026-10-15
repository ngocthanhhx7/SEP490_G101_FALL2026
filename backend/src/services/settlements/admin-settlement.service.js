import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

function fail(status, code, details = {}) { throw new AppError(status, code, code, details); }
function admin(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !actor.userId) fail(401, 'UNAUTHENTICATED');
  if (!Array.isArray(actor.roles) || !actor.roles.includes('ADMIN')) fail(403, 'FORBIDDEN');
}
function text(value, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max
    || /[\u0000-\u001f\u007f]/.test(value)) fail(422, 'VALIDATION_FAILED');
  return value.trim();
}
function project(row) {
  const result = { id: row.id, sitterId: row.sitterId, requestWeekKey: row.requestWeekKey,
    amountVnd: row.amountVnd, currency: 'VND', status: row.status, version: row.version,
    submittedAt: row.submittedAt };
  if (Array.isArray(row.earningIds)) result.earningIds = [...row.earningIds];
  if (Array.isArray(row.earningSnapshots)) result.perVisit = row.earningSnapshots.map(snapshot => ({
    earningId: snapshot.earningId, visitId: snapshot.visitId ?? null,
    earningPeriodKey: snapshot.earningPeriodKey, amountVnd: snapshot.amountVnd,
    pendingVnd: snapshot.pendingVnd ?? 0, heldVnd: snapshot.heldVnd ?? 0,
    availableVnd: snapshot.availableVnd ?? 0, reservedVnd: snapshot.reservedVnd ?? 0,
    paidVnd: snapshot.paidVnd ?? 0
  }));
  return result;
}

export function createAdminSettlementService({ unitOfWork, repository, policy, clock = () => new Date() }) {
  for (const method of ['findCommand', 'saveCommand', 'getById', 'compareAndSet', 'appendEvent',
    'releaseReservation', 'settleReservation', 'listPayroll']) {
    if (typeof repository?.[method] !== 'function') throw new TypeError(`Admin settlement repository requires ${method}`);
  }
  if (typeof unitOfWork?.run !== 'function') throw new TypeError('Settlement transaction required');

  async function command({ actor, requestId, expectedVersion, idempotencyKey, operation, payload, mutate }) {
    admin(actor);
    const id = text(requestId, 128);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) fail(422, 'VALIDATION_FAILED');
    const key = text(idempotencyKey, 128);
    if (!/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail(422, 'VALIDATION_FAILED');
    const fingerprint = createHash('sha256').update(JSON.stringify({ id, expectedVersion, ...payload })).digest('hex');
    return unitOfWork.run(async transaction => {
      const scope = { actorId: actor.userId, operation, key };
      const previous = await repository.findCommand(scope, transaction);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_KEY_REUSED');
        return previous.result;
      }
      const row = await repository.getById(id, transaction);
      if (!row) fail(404, 'RESOURCE_NOT_FOUND');
      if (row.version !== expectedVersion) fail(409, 'VERSION_CONFLICT');
      const resolved = await policy?.resolve?.({ action: operation, request: row, transaction });
      if (resolved?.ready !== true || !resolved.policyVersion || !resolved.decisionVersion
        || !Array.isArray(resolved.decisionIds) || resolved.decisionIds.length) {
        fail(409, 'DECISION_REQUIRED', { decisionIds: resolved?.decisionIds?.length
          ? resolved.decisionIds : ['FIN-07-ELIG', 'FIN-07-POSTPAY', 'FIN-08-EDIT'] });
      }
      const occurredAt = new Date(clock()).toISOString();
      await repository.assertIndexesReady?.();
      const versions = { policyVersion: resolved.policyVersion, decisionVersion: resolved.decisionVersion };
      const change = await mutate(row, transaction, occurredAt, versions);
      const updated = await repository.compareAndSet(id, expectedVersion, {
        ...change.patch, version: expectedVersion + 1, ...versions }, transaction);
      if (!updated) fail(409, 'VERSION_CONFLICT');
      await repository.appendEvent({ operationId: `settlement:${id}:v${expectedVersion + 1}`,
        requestId: id, actorId: actor.userId, occurredAt, ...versions, ...change.event }, transaction);
      const result = project(updated);
      await repository.saveCommand({ ...scope, fingerprint, result }, transaction);
      return result;
    });
  }

  return Object.freeze({
    async list({ actor, cursor }) {
      admin(actor);
      if (cursor !== undefined) text(cursor, 512);
      const page = await repository.listPayroll({ cursor, limit: 50 });
      const resolved = await policy?.resolve?.({ action: 'READ_PAYROLL' });
      const decisionIds = resolved?.ready === true && resolved.policyVersion && resolved.decisionVersion
        && Array.isArray(resolved.decisionIds) && !resolved.decisionIds.length ? []
        : resolved?.decisionIds?.length ? resolved.decisionIds : ['FIN-07-ELIG', 'FIN-07-POSTPAY', 'FIN-08-EDIT'];
      return { items: page.items.map(project), nextCursor: page.nextCursor ?? null,
        decisionIds: [...new Set([...decisionIds, ...(page.decisionIds ?? [])])] };
    },
    async decide(input) {
      admin(input.actor);
      const { decision } = input;
      if (!['APPROVE', 'REJECT'].includes(decision)) fail(422, 'VALIDATION_FAILED');
      const reason = text(input.reason, 500);
      return command({ ...input, operation: 'SETTLEMENT_DECIDE', payload: { decision, reason },
        mutate: async (row, transaction, _occurredAt, versions) => {
          if (row.status !== 'SUBMITTED') fail(409, 'INVALID_STATE');
          if (decision === 'APPROVE' && typeof repository.assertReservationReady === 'function'
            && await repository.assertReservationReady({ requestId: row.id, amountVnd: row.amountVnd }, transaction) !== true) {
            fail(409, 'RESERVATION_CONFLICT');
          }
          // Port revalidates holds/refund/earning availability even on approval.
          if (decision === 'REJECT' && await repository.releaseReservation({ requestId: row.id,
            expectedStatus: 'SUBMITTED', amountVnd: row.amountVnd,
            actorId: input.actor.userId, ...versions }, transaction) !== true) fail(409, 'RESERVATION_CONFLICT');
          return { patch: { status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decision: { decision, reason } },
            event: { type: decision === 'APPROVE' ? 'SETTLEMENT_APPROVED' : 'EARNING_RESERVATION_RELEASED',
              reason, amountVnd: row.amountVnd,
              ...(decision === 'REJECT' ? { fromBucket: 'RESERVED', toBucket: 'AVAILABLE' } : {}) } };
        } });
    },
    async recordTransfer(input) {
      admin(input.actor);
      const { outcome } = input;
      if (!['CONFIRMED', 'UNKNOWN'].includes(outcome)) fail(422, 'VALIDATION_FAILED');
      const reference = text(input.reference);
      const evidenceReference = text(input.evidenceReference);
      if (input.amountVnd !== undefined && (!Number.isSafeInteger(input.amountVnd) || input.amountVnd <= 0)) fail(422, 'VALIDATION_FAILED');
      let paidAt = null;
      if (outcome === 'CONFIRMED') {
        if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd <= 0
          || typeof input.paidAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.paidAt)
          || !Number.isFinite(Date.parse(input.paidAt))) fail(422, 'VALIDATION_FAILED');
        paidAt = new Date(input.paidAt).toISOString();
      }
      return command({ ...input, operation: 'SETTLEMENT_TRANSFER',
        payload: { outcome, reference, evidenceReference, amountVnd: input.amountVnd, paidAt },
        mutate: async (row, transaction, occurredAt, versions) => {
          if (!['APPROVED', 'TRANSFER_PENDING'].includes(row.status)) fail(409, 'INVALID_STATE');
          if (paidAt && (Date.parse(paidAt) > Date.parse(occurredAt)
            || !Number.isFinite(Date.parse(row.submittedAt))
            || Date.parse(paidAt) < Date.parse(row.submittedAt))) fail(422, 'VALIDATION_FAILED');
          const confirmed = outcome === 'CONFIRMED' && input.amountVnd === row.amountVnd;
          const transferOutcome = confirmed ? 'CONFIRMED' : outcome === 'UNKNOWN' ? 'UNKNOWN' : 'AMOUNT_MISMATCH';
          const transfer = { outcome: confirmed ? 'CONFIRMED' : outcome === 'UNKNOWN' ? 'UNKNOWN' : 'AMOUNT_MISMATCH',
            reference, evidenceReference, amountVnd: input.amountVnd ?? null, paidAt,
            recordedBy: input.actor.userId, recordedAt: occurredAt };
          const evidenceCheck = typeof repository.assertEvidenceOwnership === 'function'
            ? await repository.assertEvidenceOwnership({ evidenceReference, requestId: row.id,
              actorId: input.actor.userId }, transaction) : true;
          if (!evidenceCheck) fail(409, 'EVIDENCE_UNAVAILABLE');
          if (confirmed && await repository.settleReservation({ requestId: row.id,
            amountVnd: row.amountVnd, reference, evidenceReference, adminId: input.actor.userId,
            version: input.expectedVersion + 1, paidAt, ...versions }, transaction) !== true) fail(409, 'RESERVATION_CONFLICT');
          if (!confirmed && typeof repository.recordTransferAttempt === 'function'
            && await repository.recordTransferAttempt({ requestId: row.id, version: input.expectedVersion + 1,
              adminId: input.actor.userId, outcome: transferOutcome, reference, evidenceReference,
              amountVnd: input.amountVnd ?? null, paidAt }, transaction) !== true) fail(409, 'TRANSFER_REFERENCE_CONFLICT');
          return { patch: { status: confirmed ? 'PAID' : 'TRANSFER_PENDING', transfer },
            event: { type: confirmed ? 'EARNING_PAID' : 'SETTLEMENT_RECONCILIATION_REQUIRED',
              transfer, amountVnd: row.amountVnd,
              ...(confirmed ? { fromBucket: 'RESERVED', toBucket: 'PAID' } : {}) } };
        } });
    }
  });
}
