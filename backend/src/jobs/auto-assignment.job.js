import { createHash } from 'node:crypto';
import { AppError } from '../utils/app-error.js';
import { normalizeDispatchRequest } from '../services/dispatch.service.js';

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const MAX_VISITS_PER_RUN = 100;
const MAX_CANDIDATES = 100;
const DISPATCHABLE_STATES = new Set(['DISPATCH_PENDING', 'READY_FOR_DISPATCH', 'AWAITING_SITTER']);

function asOfInstant(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return new Date(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  if (typeof value === 'string' && ISO_WITH_ZONE.test(value) && Number.isFinite(Date.parse(value))) return new Date(Date.parse(value));
  throw new TypeError('clock must return a valid timezone-aware instant');
}

function dispatchKey(visitId, dispatchSequence, sitterId) {
  const digest = createHash('sha256').update(`${visitId}\n${dispatchSequence}\n${sitterId}`).digest('hex');
  return `auto-assignment:v1:${digest}`;
}

function safeOffer(result, fallback) {
  if (!result || typeof result !== 'object') return null;
  const offer = result.offer ?? result;
  const id = offer.id ?? offer.offerId;
  const visitId = offer.visitId ?? fallback.visitId;
  const sitterId = offer.sitterId ?? fallback.sitterId;
  if (typeof id !== 'string' || typeof visitId !== 'string' || typeof sitterId !== 'string') return null;
  return Object.freeze({
    id, visitId, sitterId,
    state: typeof offer.state === 'string' ? offer.state : 'PENDING',
    deadline: offer.deadline ?? null,
    dispatchSequence: offer.dispatchSequence ?? fallback.dispatchSequence,
  });
}

function isDispatchableVisit(visit) {
  if (!visit || typeof visit !== 'object' || Array.isArray(visit)) return false;
  if (visit.directed === true || visit.dispatchMode === 'DIRECTED' || visit.requestedSitterId) return false;
  if (visit.dispatchAllowed === false || visit.paymentStatus === 'PAYMENT_REQUIRED') return false;
  if (visit.paymentRequired === true && visit.paymentStatus !== 'PAID') return false;
  if (visit.state !== undefined && !DISPATCHABLE_STATES.has(visit.state)) return false;
  return typeof (visit.visitId ?? visit.id) === 'string';
}

/**
 * Auto assignment is an offer producer, never an assignment mutator. The
 * repository command must re-read the visit/payment/availability snapshots,
 * acquire the P01 eligibility + occupancy guards, and atomically deduplicate
 * the generated idempotency key with creation of one pending Offer.
 */
export function createAutoAssignmentJob({ repository, dispatchService, clock = () => new Date(), limit = MAX_VISITS_PER_RUN } = {}) {
  if (typeof repository?.findDispatchableVisits !== 'function'
    || typeof repository?.createOfferAtomically !== 'function'
    || typeof dispatchService?.suggest !== 'function'
    || typeof clock !== 'function') {
    throw new TypeError('Auto-assignment repository, dispatch service and clock ports are required');
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_VISITS_PER_RUN) {
    throw new TypeError(`Auto-assignment limit must be between 1 and ${MAX_VISITS_PER_RUN}`);
  }

  let inFlight;

  async function run() {
    const asOf = asOfInstant(clock());
    const visits = await repository.findDispatchableVisits({ asOf: asOf.toISOString(), limit });
    if (!Array.isArray(visits) || visits.length > limit) {
      throw new AppError(503, 'DISPATCH_UNAVAILABLE', 'Dispatch queue is unavailable');
    }

    let queried = visits.length;
    let created = 0;
    let alreadyHandled = 0;
    let skipped = 0;
    let failed = 0;
    const offers = [];

    for (const visit of visits) {
      if (!isDispatchableVisit(visit)) {
        skipped += 1;
        continue;
      }
      const visitId = visit.visitId ?? visit.id;
      const dispatchSequence = Number.isSafeInteger(visit.dispatchSequence) && visit.dispatchSequence >= 0
        ? visit.dispatchSequence : 0;
      let request;
      try {
        request = normalizeDispatchRequest({ ...visit, visitId });
      } catch {
        skipped += 1;
        continue;
      }

      try {
        const suggestion = await dispatchService.suggest({
          request, candidates: visit.candidates, limit: Math.min(visit.candidateLimit ?? MAX_CANDIDATES, MAX_CANDIDATES)
        });
        if (!suggestion?.selected?.length) {
          skipped += 1;
          continue;
        }
        const selected = suggestion.selected[0];
        const sitterId = selected.sitterId;
        const idempotencyKey = dispatchKey(visitId, dispatchSequence, sitterId);
        const result = await repository.createOfferAtomically({
          visitId, sitterId, dispatchSequence, idempotencyKey,
          asOf: asOf.toISOString(),
          explanation: Array.isArray(selected.reasons) ? [...selected.reasons] : [],
          rankingSource: suggestion.rankingSource ?? 'DETERMINISTIC_RULES'
        });
        if (result?.status === 'CREATED') {
          const offer = safeOffer(result, { visitId, sitterId, dispatchSequence });
          if (!offer) { failed += 1; continue; }
          offers.push(offer);
          created += 1;
        } else if (result?.status === 'ALREADY_EXISTS' || result?.status === 'SKIPPED' || result?.status === 'STALE') {
          alreadyHandled += 1;
        } else {
          // Unknown repository outcomes must not be counted as a successful offer.
          failed += 1;
        }
      } catch {
        // One malformed/stale visit must not stop the rest of the bounded sweep.
        failed += 1;
      }
    }

    return Object.freeze({ queried, created, alreadyHandled, skipped, failed, offers: Object.freeze(offers) });
  }

  return Object.freeze({
    runOnce() {
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = undefined; });
      return inFlight;
    }
  });
}
