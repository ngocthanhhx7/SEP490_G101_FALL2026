import { AppError } from '../utils/app-error.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_PAGE_SIZE = 50;

function fail(status, code, message, details = {}) {
  throw new AppError(status, code, message, details);
}

function activeSitter(actor) {
  if (actor?.state !== 'ACTIVE' || typeof actor.userId !== 'string' || !ID.test(actor.userId)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!Array.isArray(actor.roles) || !actor.roles.includes('PET_SITTER')) {
    fail(403, 'FORBIDDEN', 'Pet sitter access is required');
  }
  return actor.userId;
}

function identifier(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) fail(422, 'VALIDATION_FAILED', `${field} is invalid`);
  return value;
}

function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(422, 'VALIDATION_FAILED', 'Offer version is required');
  return value;
}

function instant(value, field) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(503, 'OFFER_DATA_UNAVAILABLE', `${field} is invalid`);
  }
  return new Date(value).toISOString();
}

function text(value, field, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    fail(503, 'OFFER_DATA_UNAVAILABLE', `${field} is invalid`);
  }
  return value.trim();
}

function safePetSummary(value) {
  if (!Array.isArray(value)) return [];
  return Object.freeze(value.slice(0, 10).map((pet, index) => {
    if (!pet || typeof pet !== 'object') fail(503, 'OFFER_DATA_UNAVAILABLE', 'Pet summary is invalid');
    return Object.freeze({
      id: pet.id === undefined ? String(index + 1) : identifier(String(pet.id), 'pet id'),
      name: text(pet.name ?? 'Thú cưng', 'pet name', 80),
      species: text(pet.species ?? 'UNKNOWN', 'pet species', 40)
    });
  }));
}

function safeOffer(record, sitterId, asOf) {
  if (!record || typeof record !== 'object' || record.sitterId !== sitterId) {
    fail(404, 'RESOURCE_NOT_FOUND', 'Offer not found');
  }
  const state = ['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'].includes(record.state)
    ? record.state : null;
  if (!state) fail(503, 'OFFER_DATA_UNAVAILABLE', 'Offer state is invalid');
  const deadline = instant(record.deadline, 'deadline');
  return Object.freeze({
    id: identifier(record.id ?? record.offerId, 'offerId'),
    visitId: identifier(record.visitId, 'visitId'),
    sitterId,
    state,
    version: version(record.version),
    offeredAt: instant(record.offeredAt, 'offeredAt'),
    deadline,
    startAt: instant(record.startAt, 'startAt'),
    endAt: instant(record.endAt, 'endAt'),
    serviceName: text(record.serviceName, 'serviceName'),
    areaCode: text(record.areaCode, 'areaCode', 80),
    pets: safePetSummary(record.pets ?? record.petSummary),
    canRespond: state === 'PENDING' && Date.parse(deadline) > asOf,
    // Address, access notes, contact and payment fields are deliberately not projected.
  });
}

function requireKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) fail(422, 'VALIDATION_FAILED', 'Idempotency key is required');
  return value;
}

function pageQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)
    || Object.keys(query).some(key => !['limit', 'cursor', 'state'].includes(key))) {
    fail(422, 'VALIDATION_FAILED', 'Offer list query is invalid');
  }
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    fail(422, 'VALIDATION_FAILED', 'Offer list limit is invalid');
  }
  const cursor = query.cursor === undefined ? null : query.cursor;
  if (cursor !== null && (typeof cursor !== 'string' || !ID.test(cursor))) {
    fail(422, 'VALIDATION_FAILED', 'Offer cursor is invalid');
  }
  if (query.state !== undefined && !['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED'].includes(query.state)) {
    fail(422, 'VALIDATION_FAILED', 'Offer state is invalid');
  }
  return { limit, cursor, state: query.state ?? null };
}

function assertCommandPorts(transaction) {
  const methods = ['getOffer', 'getVisit', 'recheckEligibility', 'checkSlotAvailability'];
  if (!transaction || methods.some(method => typeof transaction[method] !== 'function')) {
    fail(503, 'OFFER_COMMAND_UNAVAILABLE', 'Offer command is unavailable');
  }
}

function checkOfferForDecision(offer, sitterId, now) {
  if (!offer || offer.sitterId !== sitterId) fail(404, 'RESOURCE_NOT_FOUND', 'Offer not found');
  if (offer.state !== 'PENDING') fail(409, 'OFFER_NOT_PENDING', 'Offer is no longer pending');
  const deadline = Date.parse(offer.deadline);
  if (!Number.isFinite(deadline) || deadline <= now) fail(409, 'OFFER_EXPIRED', 'Offer deadline has passed');
  if (offer.revoked === true) fail(409, 'OFFER_REVOKED', 'Offer has been revoked');
  return offer;
}

/**
 * Sitter-facing offer and assignment commands. The repository transaction is
 * responsible for the durable CAS, sitter-day occupancy guard, eligibility
 * guard and idempotency record. This service only accepts bounded projections
 * and never receives private address/access-note data from a caller-facing read.
 */
export function createSitterOfferService({ repository, clock = Date.now } = {}) {
  if (typeof repository?.listOffers !== 'function' || typeof repository?.getOffer !== 'function'
    || typeof repository?.listAssignedVisits !== 'function' || typeof repository?.runOfferCommand !== 'function'
    || typeof clock !== 'function') {
    throw new TypeError('Sitter offer repository and clock ports are required');
  }

  async function list(actor, query = {}) {
    const sitterId = activeSitter(actor);
    const filter = pageQuery(query);
    const asOf = Number(clock());
    if (!Number.isFinite(asOf)) fail(503, 'OFFER_DATA_UNAVAILABLE', 'Server clock is unavailable');
    const result = await repository.listOffers({ sitterId, ...filter, asOf: new Date(asOf).toISOString() });
    if (!Array.isArray(result?.items) || result.items.length > filter.limit
      || (result.nextCursor !== null && !ID.test(result.nextCursor))) {
      fail(503, 'OFFER_DATA_UNAVAILABLE', 'Offers are unavailable');
    }
    return Object.freeze({
      items: Object.freeze(result.items.map(item => safeOffer(item, sitterId, asOf))),
      nextCursor: result.nextCursor ?? null,
      limit: filter.limit
    });
  }

  async function detail(actor, offerId) {
    const sitterId = activeSitter(actor);
    const record = await repository.getOffer({ offerId: identifier(offerId, 'offerId'), sitterId });
    return safeOffer(record, sitterId, Number(clock()));
  }

  async function assignments(actor, query = {}) {
    const sitterId = activeSitter(actor);
    const filter = pageQuery(query);
    const result = await repository.listAssignedVisits({ sitterId, ...filter });
    if (!Array.isArray(result?.items) || result.items.length > filter.limit) {
      fail(503, 'ASSIGNMENT_DATA_UNAVAILABLE', 'Assignments are unavailable');
    }
    const items = result.items.map(item => {
      if (!item || item.sitterId !== sitterId) fail(503, 'ASSIGNMENT_DATA_UNAVAILABLE', 'Assignment scope is invalid');
      return Object.freeze({
        id: identifier(item.id ?? item.visitId, 'visitId'),
        visitId: identifier(item.visitId ?? item.id, 'visitId'),
        state: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'].includes(item.state) ? item.state : fail(503, 'ASSIGNMENT_DATA_UNAVAILABLE', 'Visit state is invalid'),
        version: version(item.version),
        startAt: instant(item.startAt, 'startAt'),
        endAt: instant(item.endAt, 'endAt'),
        serviceName: text(item.serviceName, 'serviceName'),
        areaCode: text(item.areaCode, 'areaCode', 80),
        pets: safePetSummary(item.pets ?? item.petSummary),
        handoverRequired: item.handoverRequired === true,
        handoverAccepted: item.handoverAccepted === true
      });
    });
    return Object.freeze({ items: Object.freeze(items), nextCursor: result.nextCursor ?? null, limit: filter.limit });
  }

  async function decide(actor, offerId, expectedVersion, idempotencyKey, decision) {
    const sitterId = activeSitter(actor);
    const id = identifier(offerId, 'offerId');
    const expected = version(expectedVersion);
    const key = requireKey(idempotencyKey);
    if (!['ACCEPT', 'DECLINE'].includes(decision)) fail(422, 'VALIDATION_FAILED', 'Offer decision is invalid');
    const payload = { offerId: id, sitterId, expectedVersion: expected, decision };
    return repository.runOfferCommand({ actor, sitterId, offerId: id, expectedVersion: expected,
      idempotencyKey: key, payload, execute: async transaction => {
        assertCommandPorts(transaction);
        const offer = checkOfferForDecision(await transaction.getOffer({ offerId: id }), sitterId, clock());
        if (offer.version !== expected) fail(409, 'VERSION_CONFLICT', 'Offer changed; reload before continuing');
        if (decision === 'ACCEPT') {
          const visit = await transaction.getVisit({ visitId: offer.visitId });
          if (!visit || (visit.id ?? visit.visitId) !== offer.visitId) fail(409, 'VISIT_UNAVAILABLE', 'Visit is unavailable');
          if (visit.sitterId && visit.sitterId !== sitterId) fail(409, 'VISIT_ALREADY_ASSIGNED', 'Visit already has another sitter');
          if (visit.paymentRequired === true && !['PAID', 'VERIFIED'].includes(visit.paymentStatus)) {
            fail(409, 'PAYMENT_REQUIRED', 'Payment must be verified before acceptance');
          }
          if (visit.directed === true && visit.requestedSitterId && visit.requestedSitterId !== sitterId) {
            fail(409, 'DIRECTED_SITTER_MISMATCH', 'Offer is not for the requested sitter');
          }
          const eligibility = await transaction.recheckEligibility({ sitterId, visit, offer });
          if (!eligibility?.eligible) fail(409, eligibility?.code ?? 'SITTER_NOT_ELIGIBLE', 'Sitter is no longer eligible');
          const slot = await transaction.checkSlotAvailability({ sitterId, visit, offer });
          if (slot !== true && slot?.available !== true) fail(409, 'SLOT_UNAVAILABLE', 'Visit slot is no longer available');
          checkOfferForDecision(offer, sitterId, clock());
          if (typeof transaction.acceptOffer !== 'function') fail(503, 'OFFER_COMMAND_UNAVAILABLE', 'Offer command is unavailable');
          const saved = await transaction.acceptOffer({ offer, sitterId, expectedVersion: expected });
          if (!saved || saved.state !== 'ACCEPTED' || saved.sitterId !== sitterId) fail(503, 'OFFER_COMMAND_UNAVAILABLE', 'Offer acceptance was not confirmed');
          await transaction.appendAuditAndOutbox?.({ type: 'OfferAccepted', actorId: sitterId, offerId: id,
            visitId: offer.visitId, at: new Date(clock()).toISOString() });
          return Object.freeze({ offerId: id, visitId: offer.visitId, assignmentId: saved.assignmentId ?? null,
            state: 'ASSIGNED', sitterId, version: saved.version });
        }
        if (typeof transaction.declineOffer !== 'function') fail(503, 'OFFER_COMMAND_UNAVAILABLE', 'Offer command is unavailable');
        const saved = await transaction.declineOffer({ offer, sitterId, expectedVersion: expected });
        if (!saved || saved.state !== 'DECLINED') fail(503, 'OFFER_COMMAND_UNAVAILABLE', 'Offer decline was not confirmed');
        await transaction.appendAuditAndOutbox?.({ type: 'OfferDeclined', actorId: sitterId, offerId: id,
          visitId: offer.visitId, at: new Date(clock()).toISOString() });
        return Object.freeze({ offerId: id, visitId: offer.visitId, state: 'DECLINED', sitterId, version: saved.version });
      }
    });
  }

  return Object.freeze({ list, detail, assignments,
    accept: (actor, offerId, expectedVersion, idempotencyKey) => decide(actor, offerId, expectedVersion, idempotencyKey, 'ACCEPT'),
    decline: (actor, offerId, expectedVersion, idempotencyKey) => decide(actor, offerId, expectedVersion, idempotencyKey, 'DECLINE')
  });
}
