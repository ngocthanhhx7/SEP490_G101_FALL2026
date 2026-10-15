import { createHash, randomUUID } from 'node:crypto';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_OPERATIONS_PER_RUN = 100;
const LEASE_DURATION_MS = 60_000;

const OPERATION_POLICIES = Object.freeze({
  OFFER_EXPIRED: Object.freeze({
    task: 'offer-expiry', aggregateType: 'OFFER', expectedState: 'PENDING',
    basis: 'deadline', offsetMs: 0
  }),
  VISIT_REMINDER_2H: Object.freeze({
    task: 'visit-reminders', aggregateType: 'VISIT', expectedState: 'ASSIGNED',
    basis: 'startAt', offsetMs: -2 * HOUR_MS
  }),
  VISIT_REMINDER_30M: Object.freeze({
    task: 'visit-reminders', aggregateType: 'VISIT', expectedState: 'ASSIGNED',
    basis: 'startAt', offsetMs: -30 * MINUTE_MS
  }),
  BOOKING_PROPOSAL_EXPIRED: Object.freeze({
    task: 'operational-deadlines', aggregateType: 'BOOKING_PROPOSAL', expectedState: 'AWAITING_CUSTOMER',
    basis: 'expiresAt', offsetMs: 0
  }),
  VISIT_NO_ARRIVAL: Object.freeze({
    task: 'operational-deadlines', aggregateType: 'VISIT', expectedState: 'ASSIGNED',
    basis: 'startAt', offsetMs: 30 * MINUTE_MS
  }),
  VISIT_NO_CHECKOUT: Object.freeze({
    task: 'operational-deadlines', aggregateType: 'VISIT', expectedState: 'IN_PROGRESS',
    basis: 'endAt', offsetMs: 2 * HOUR_MS
  }),
  HANDOVER_OVERDUE: Object.freeze({
    task: 'operational-deadlines', aggregateType: 'HANDOVER', expectedState: 'PENDING',
    basis: 'requestedAt', offsetMs: HOUR_MS
  }),
  CHANGE_REQUEST_EXPIRED: Object.freeze({
    task: 'operational-deadlines', aggregateType: 'CHANGE_REQUEST', expectedState: 'AWAITING_APPROVAL',
    basis: 'expiresAt', offsetMs: 0
  })
});

export const OPERATIONAL_SWEEP_TASKS = Object.freeze({
  'offer-expiry': Object.freeze({
    cadenceMs: 5 * MINUTE_MS,
    leaseName: 'p23:offer-expiry',
    operationTypes: Object.freeze(['OFFER_EXPIRED'])
  }),
  'visit-reminders': Object.freeze({
    cadenceMs: 15 * MINUTE_MS,
    leaseName: 'p23:visit-reminders',
    operationTypes: Object.freeze(['VISIT_REMINDER_2H', 'VISIT_REMINDER_30M'])
  }),
  'operational-deadlines': Object.freeze({
    cadenceMs: 5 * MINUTE_MS,
    leaseName: 'p23:operational-deadlines',
    operationTypes: Object.freeze([
      'BOOKING_PROPOSAL_EXPIRED', 'VISIT_NO_ARRIVAL', 'VISIT_NO_CHECKOUT',
      'HANDOVER_OVERDUE', 'CHANGE_REQUEST_EXPIRED'
    ])
  })
});

function toInstant(value, label) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (Number.isFinite(timestamp)) return new Date(timestamp);
    throw new TypeError(`${label} must be a valid instant`);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new TypeError(`${label} must include a timezone offset`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} must be a valid instant`);
  return new Date(timestamp);
}

function tryInstant(value) {
  try { return toInstant(value, 'instant'); } catch { return null; }
}

function resolveClock(clock) {
  return toInstant(clock(), 'clock value');
}

function operationIdempotencyKey(operationType, aggregateType, aggregateId, dueAt) {
  const digest = createHash('sha256')
    .update(`${operationType}\n${aggregateType}\n${aggregateId}\n${dueAt}`)
    .digest('hex');
  return `p23-operation:v1:${digest}`;
}

function expectedFacts(candidate, policy) {
  const facts = { [policy.basis]: toInstant(candidate[policy.basis], policy.basis).toISOString() };
  if (candidate.startAt !== undefined) facts.startAt = toInstant(candidate.startAt, 'startAt').toISOString();
  if (candidate.endAt !== undefined) facts.endAt = toInstant(candidate.endAt, 'endAt').toISOString();
  if (candidate.checkInAt !== undefined) {
    facts.checkInAt = candidate.checkInAt === null ? null : toInstant(candidate.checkInAt, 'checkInAt').toISOString();
  }
  if (candidate.checkOutAt !== undefined) {
    facts.checkOutAt = candidate.checkOutAt === null ? null : toInstant(candidate.checkOutAt, 'checkOutAt').toISOString();
  }
  return Object.freeze(facts);
}

function normalizeCandidate(candidate, task, asOf) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const operationType = candidate.operationType;
  const policy = OPERATION_POLICIES[operationType];
  const aggregateId = candidate.aggregateId ?? candidate.id;
  if (!policy || policy.task !== task || typeof aggregateId !== 'string' || !aggregateId.trim()
    || candidate.state !== policy.expectedState
    || !Number.isSafeInteger(candidate.version) || candidate.version < 0) return null;

  if (operationType === 'VISIT_NO_ARRIVAL' && candidate.checkInAt !== null && candidate.checkInAt !== undefined) return null;
  if (operationType === 'VISIT_NO_CHECKOUT' && candidate.checkOutAt !== null && candidate.checkOutAt !== undefined) return null;
  if (operationType === 'VISIT_NO_CHECKOUT' && (candidate.checkInAt === null || candidate.checkInAt === undefined)) return null;

  const basis = tryInstant(candidate[policy.basis]);
  if (!basis) return null;
  const dueAt = new Date(basis.getTime() + policy.offsetMs);
  if (dueAt.getTime() > asOf.getTime()) return null;

  let facts;
  try { facts = expectedFacts(candidate, policy); } catch { return null; }

  return Object.freeze({
    operationType,
    aggregateType: policy.aggregateType,
    aggregateId: aggregateId.trim(),
    expectedState: policy.expectedState,
    expectedVersion: candidate.version,
    dueAt: dueAt.toISOString(),
    expectedFacts: facts,
    idempotencyKey: operationIdempotencyKey(operationType, policy.aggregateType, aggregateId.trim(), dueAt.toISOString())
  });
}

/**
 * Offer deadlines are exclusive: a visit beginning in less than 24 hours gets
 * 30 minutes to accept; all other offers get two hours. At exactly 24 hours,
 * the two-hour window applies. Callers must persist the returned UTC instant
 * with the Offer and recheck it inside the atomic accept command.
 */
export function calculateOfferDeadline({ offeredAt, visitStartAt } = {}) {
  const offered = toInstant(offeredAt, 'offeredAt');
  const visitStart = toInstant(visitStartAt, 'visitStartAt');
  const timeToVisit = visitStart.getTime() - offered.getTime();
  if (timeToVisit <= 0) throw new TypeError('visitStartAt must be after offeredAt');
  const lifetime = timeToVisit < DAY_MS ? 30 * MINUTE_MS : 2 * HOUR_MS;
  return new Date(offered.getTime() + lifetime).toISOString();
}

/** True only while a pending offer is strictly before its persisted deadline. */
export function canAcceptOfferAt({ state, deadline, asOf } = {}) {
  if (state !== 'PENDING') return false;
  const deadlineAt = tryInstant(deadline);
  const now = tryInstant(asOf);
  return Boolean(deadlineAt && now && deadlineAt.getTime() > now.getTime());
}

/**
 * Creates one bounded sweep for an operational task. The lease adapter must
 * use a durable compare-and-set with a monotonic fencing token. The repository
 * must recheck aggregate state/version/deadline and insert the matching outbox
 * event in the same transaction. Offer expiry may mutate only Offer; change
 * request expiry may mutate only ChangeRequest; visit/handover/reminder work
 * emits an operational event and must not invent a terminal visit state.
 */
export function createOperationalSweepJob({ task, repository, leaseRepository, clock = () => new Date(),
  logger = () => {}, limit = MAX_OPERATIONS_PER_RUN } = {}) {
  const taskConfig = OPERATIONAL_SWEEP_TASKS[task];
  if (!taskConfig || typeof repository?.findDueOperations !== 'function'
    || typeof repository?.applyOperationAtomically !== 'function'
    || typeof leaseRepository?.acquireLease !== 'function'
    || typeof leaseRepository?.renewLease !== 'function'
    || typeof leaseRepository?.releaseLease !== 'function' || typeof clock !== 'function'
    || typeof logger !== 'function') {
    throw new TypeError('Operational sweep task, repository, lease and clock ports are required');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_OPERATIONS_PER_RUN) {
    throw new TypeError(`Operational sweep limit must be between 1 and ${MAX_OPERATIONS_PER_RUN}`);
  }

  let inFlight;

  function safeLog(event, summary) {
    try { logger(Object.freeze({ event, task, ...summary })); } catch { /* logging cannot change a job result */ }
  }

  async function run() {
    const startedAt = resolveClock(clock);
    const ownerToken = randomUUID();
    const lease = await leaseRepository.acquireLease({
      name: taskConfig.leaseName,
      ownerToken,
      asOf: startedAt.toISOString(),
      leaseDurationMs: LEASE_DURATION_MS
    });
    if (lease?.status === 'BUSY') {
      return Object.freeze({ task, cadenceMs: taskConfig.cadenceMs, leaseAcquired: false,
        leaseLost: false, queried: 0, applied: 0, alreadyHandled: 0, skipped: 0, failed: 0 });
    }
    if (lease?.status !== 'ACQUIRED' || !Number.isSafeInteger(lease.fencingToken) || lease.fencingToken < 1) {
      throw new TypeError('Operational sweep lease returned an invalid fencing token');
    }

    const summary = { leaseAcquired: true, leaseLost: false, queried: 0, applied: 0, alreadyHandled: 0, skipped: 0, failed: 0 };
    const heldLease = { name: taskConfig.leaseName, ownerToken, fencingToken: lease.fencingToken };
    try {
      const candidates = await repository.findDueOperations({
        task, asOf: startedAt.toISOString(), operationTypes: taskConfig.operationTypes, limit
      });
      if (!Array.isArray(candidates) || candidates.length > limit) {
        throw new TypeError('Operational sweep repository must return a bounded array');
      }
      summary.queried = candidates.length;

      for (const candidate of candidates) {
        const asOf = resolveClock(clock);
        const renewed = await leaseRepository.renewLease({
          ...heldLease, asOf: asOf.toISOString(), leaseDurationMs: LEASE_DURATION_MS
        });
        if (renewed !== true) {
          summary.leaseLost = true;
          break;
        }

        const operation = normalizeCandidate(candidate, task, asOf);
        if (!operation) {
          summary.skipped += 1;
          continue;
        }

        try {
          const result = await repository.applyOperationAtomically({
            ...operation,
            asOf: asOf.toISOString(),
            fencingToken: heldLease.fencingToken
          });
          if (result?.status === 'APPLIED') summary.applied += 1;
          else if (result?.status === 'ALREADY_APPLIED' || result?.status === 'STALE') summary.alreadyHandled += 1;
          else if (result?.status === 'SKIPPED') summary.skipped += 1;
          else summary.failed += 1;
        } catch {
          // One stale aggregate or outbox failure must not stop unrelated due work.
          summary.failed += 1;
        }
      }
    } finally {
      try { await leaseRepository.releaseLease({ ...heldLease, asOf: resolveClock(clock).toISOString() }); }
      catch { safeLog('operational_sweep_lease_release_failed', {}); }
    }

    safeLog('operational_sweep_completed', {
      leaseAcquired: summary.leaseAcquired, leaseLost: summary.leaseLost,
      queried: summary.queried, applied: summary.applied, alreadyHandled: summary.alreadyHandled,
      skipped: summary.skipped, failed: summary.failed
    });
    return Object.freeze({ task, cadenceMs: taskConfig.cadenceMs, ...summary });
  }

  return Object.freeze({
    task,
    cadenceMs: taskConfig.cadenceMs,
    runOnce() {
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = undefined; });
      return inFlight;
    }
  });
}
