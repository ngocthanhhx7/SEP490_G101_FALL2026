import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';
import { vietnamRequestWeek } from './week.js';

export function fail(status, code, details = {}) {
  throw new AppError(status, code, code, details);
}

export function requireRole(actor, role) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !actor.userId) fail(401, 'UNAUTHENTICATED');
  if (!Array.isArray(actor.roles) || !actor.roles.includes(role)) fail(403, 'FORBIDDEN');
}

export function text(value, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max
    || /[\u0000-\u001f\u007f]/.test(value)) fail(422, 'VALIDATION_FAILED');
  return value.trim();
}

export function publicRequest(row) {
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

// policy is a trusted P51/P01 port, never request body/configured client flags.
export async function requireDecision(policy, action, transaction) {
  const result = await policy?.resolve?.({ action, transaction });
  if (result?.ready !== true || !result.policyVersion || !result.decisionVersion
    || !Array.isArray(result.decisionIds) || result.decisionIds.length) {
    fail(409, 'DECISION_REQUIRED', { decisionIds: result?.decisionIds?.length
      ? result.decisionIds : ['FIN-07-ELIG', 'FIN-07-POSTPAY', 'FIN-08-EDIT'] });
  }
  return { policyVersion: result.policyVersion, decisionVersion: result.decisionVersion };
}

export function createCommandRunner({ unitOfWork, repository }) {
  return async ({ actor, operation, idempotencyKey, payload, run }) => {
    const key = text(idempotencyKey);
    if (!/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail(422, 'VALIDATION_FAILED');
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return unitOfWork.run(async transaction => {
      const scope = { actorId: actor.userId, operation, key };
      const previous = await repository.findCommand(scope, transaction);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_KEY_REUSED');
        return previous.result;
      }
      const result = await run(transaction);
      await repository.saveCommand({ ...scope, fingerprint, result }, transaction);
      return result;
    });
  };
}

export function createSettlementService({ unitOfWork, repository, policy, clock = () => new Date() }) {
  for (const method of ['findCommand', 'saveCommand', 'claimWeek', 'reserveEarnings', 'create', 'appendEvent', 'readOwn']) {
    if (typeof repository?.[method] !== 'function') throw new TypeError(`Settlement repository requires ${method}`);
  }
  if (typeof unitOfWork?.run !== 'function') throw new TypeError('Settlement transaction required');
  const execute = createCommandRunner({ unitOfWork, repository });
  return Object.freeze({
    async readOwn({ actor }) {
      requireRole(actor, 'PET_SITTER');
      const now = new Date(clock());
      const week = vietnamRequestWeek(now);
      // Adapter returns only an allowlisted financial projection, no bank/customer data.
      const projection = await repository.readOwn({ sitterId: actor.userId, ...week });
      if (!projection?.balances || !Array.isArray(projection.earnings) || !Array.isArray(projection.requests)
        || projection.ledgerReady === false) {
        fail(503, 'LEDGER_UNAVAILABLE');
      }
      const balances = {};
      for (const key of ['accrued', 'pending', 'held', 'available', 'reserved', 'paid']) {
        const value = projection.balances[key];
        // Older adapters may omit the new buckets; durable adapters must provide them.
        if (value === undefined && ['pending', 'held'].includes(key)) continue;
        if (!Number.isSafeInteger(value) || value < 0) fail(503, 'LEDGER_UNAVAILABLE');
        balances[key] = value;
      }
      if (projection.requests.some(row => row.sitterId !== actor.userId)
        || projection.earnings.some(row => row.sitterId !== actor.userId)) fail(503, 'LEDGER_SCOPE_INVALID');
      return { balances, earnings: projection.earnings.map(row => ({ id: row.id,
        earningPeriodKey: row.earningPeriodKey, availableVnd: row.availableVnd,
        ...(row.visitId ? { visitId: row.visitId } : {}),
        ...(Number.isSafeInteger(row.accruedVnd) ? { accruedVnd: row.accruedVnd } : {}),
        ...(Number.isSafeInteger(row.pendingVnd) ? { pendingVnd: row.pendingVnd } : {}),
        ...(Number.isSafeInteger(row.heldVnd) ? { heldVnd: row.heldVnd } : {}),
        ...(Number.isSafeInteger(row.reservedVnd) ? { reservedVnd: row.reservedVnd } : {}),
        ...(Number.isSafeInteger(row.paidVnd) ? { paidVnd: row.paidVnd } : {}) })),
      requests: projection.requests.map(publicRequest), quotaUsed: projection.quotaUsed === true,
      decisionIds: Array.isArray(projection.decisionIds) ? projection.decisionIds : ['FIN-07-ELIG'],
      ...week, serverNow: now.toISOString() };
    },
    async submit({ actor, earningIds, idempotencyKey }) {
      requireRole(actor, 'PET_SITTER');
      if (!Array.isArray(earningIds) || !earningIds.length || earningIds.length > 100) fail(422, 'VALIDATION_FAILED');
      const ids = earningIds.map(id => text(id)).sort();
      if (new Set(ids).size !== ids.length) fail(422, 'VALIDATION_FAILED');
      return execute({ actor, operation: 'SETTLEMENT_SUBMIT', idempotencyKey, payload: { earningIds: ids },
        run: async transaction => {
          const versions = await requireDecision(policy, 'SUBMIT', transaction);
          // Clock is sampled within the committing transaction, including retries.
          const submittedAt = new Date(clock()).toISOString();
          const week = vietnamRequestWeek(submittedAt);
          const claim = await repository.claimWeek({ sitterId: actor.userId, ...week }, transaction);
          if (!claim) fail(409, 'WEEKLY_QUOTA_USED');
          const reservation = await repository.reserveEarnings({ sitterId: actor.userId,
            earningIds: ids, requestId: claim.id, ...versions }, transaction);
          if (!reservation || !Number.isSafeInteger(reservation.amountVnd) || reservation.amountVnd <= 0) {
            fail(409, 'EARNINGS_UNAVAILABLE');
          }
          const row = await repository.create({ id: claim.id, sitterId: actor.userId, ...week,
            earningIds: ids, earningSnapshots: reservation.earnings, amountVnd: reservation.amountVnd, currency: 'VND',
            status: 'SUBMITTED', version: 0, submittedAt, ...versions }, transaction);
          await repository.appendEvent({ operationId: `settlement:${row.id}:reserve`,
            type: 'EARNING_RESERVED', requestId: row.id, earningIds: ids, amountVnd: row.amountVnd,
            fromBucket: 'AVAILABLE', toBucket: 'RESERVED', actorId: actor.userId,
            occurredAt: submittedAt, ...versions }, transaction);
          return publicRequest(row);
        } });
    }
  });
}
