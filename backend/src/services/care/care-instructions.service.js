import { createHash } from 'node:crypto';
import { AppError } from '../../utils/app-error.js';

const SERVICE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const CARE_CUTOFF_MS = 2 * 60 * 60 * 1000;
const ACCESS_WINDOW_MS = 60 * 60 * 1000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const VISIT_STATES = new Set(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'STAFF_CLOSED']);
const PRIVATE_KEYS = new Set(['accessNotes', 'homeAccessNotes', 'entryInstructions', 'alarmInstructions']);
const IMPORTANT_KEYS = new Set(['allergies', 'allergyNotes', 'importantRequests', 'importantNotes']);
const ALLOWED_KEYS = new Set([
  'summary', 'allergies', 'allergyNotes', 'importantRequests', 'importantNotes', 'feeding', 'water',
  'medication', 'handling', 'exercise', 'toileting', 'accessNotes', 'homeAccessNotes',
  'entryInstructions', 'alarmInstructions', 'emergency', 'pets', 'notes'
]);

const fail = (status, code, message, details = {}) => { throw new AppError(status, code, message, details); };
const invalid = (field, message = 'Care instructions are invalid') => fail(422, 'VALIDATION_FAILED', message, { fieldErrors: field ? { [field]: message } : undefined });

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

function role(actor, name) { return Array.isArray(actor?.roles) && actor.roles.includes(name); }
function operational(actor) { return role(actor, 'STAFF') || role(actor, 'ADMIN'); }

function identifier(value, field = 'visitId') {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, 'A valid resource identifier is required');
  return value;
}

function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid('expectedVersion', 'A nonnegative version is required');
  return value;
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}

function text(value, field, max = 2000) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) {
    invalid(field, `${field} is invalid`);
  }
  const result = value.trim();
  if (!result) invalid(field, `${field} cannot be empty`);
  return result;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, clone(nested)]));
  return value;
}

function normalizeInstructions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('instructions');
  if (Object.keys(input).some(key => !ALLOWED_KEYS.has(key))) invalid('instructions', 'Unknown care instruction field');
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'pets') {
      if (!Array.isArray(value) || value.length > 50) invalid('pets');
      output.pets = value.map((pet, index) => {
        if (!pet || typeof pet !== 'object' || Array.isArray(pet)) invalid(`pets.${index}`);
        const petId = identifier(pet.petId, `pets.${index}.petId`);
        const notes = text(pet.notes, `pets.${index}.notes`);
        return { petId, notes };
      });
      continue;
    }
    output[key] = text(value, key);
  }
  if (!Object.keys(output).length) invalid('instructions', 'At least one instruction is required');
  return output;
}

function importantFingerprint(instructions) {
  return JSON.stringify([...IMPORTANT_KEYS].sort().map(key => [key, instructions[key] ?? null]));
}

function payloadHash(payload) { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }

function instant(value, field = 'startAt') {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid(field, 'A valid server timestamp is required');
  return parsed.getTime();
}

function sitterIdOf(visit) { return visit?.sitterId ?? visit?.assignment?.sitterId ?? visit?.assignment?.currentSitterId; }
function customerIdOf(visit) { return visit?.customerId ?? visit?.booking?.customerId; }

function safeHistory(history) {
  if (!Array.isArray(history) || history.length > 100) fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Care instruction history is unavailable');
  return history.map(item => ({
    version: item.version,
    instructions: clone(item.instructions),
    actorId: item.actorId ?? item.updatedBy ?? null,
    updatedAt: item.updatedAt ?? item.createdAt ?? null,
    reason: item.reason ?? null,
  }));
}

function publicView({ visitId, record, history, actor, visit, now, includeHistory = false } = {}) {
  const source = record ?? { version: 0, instructions: {}, updatedAt: null, requiresAcknowledgement: false, acknowledgements: [] };
  const sitter = role(actor, 'PET_SITTER') && !operational(actor);
  const inAccessWindow = now >= instant(visit.startAt) - ACCESS_WINDOW_MS
    && now < (visit.endAt ? instant(visit.endAt) : Number.POSITIVE_INFINITY);
  const instructions = clone(source.instructions ?? {});
  if (sitter && !inAccessWindow) {
    for (const key of PRIVATE_KEYS) delete instructions[key];
  }
  const acknowledgements = Array.isArray(source.acknowledgements) ? source.acknowledgements : [];
  const acknowledged = acknowledgements.some(item => item.sitterId === actor.userId && item.version === source.version);
  return {
    visitId,
    version: Number.isSafeInteger(source.version) ? source.version : 0,
    instructions,
    updatedAt: source.updatedAt ?? null,
    requiresAcknowledgement: source.requiresAcknowledgement === true,
    acknowledged,
    accessWindow: { opensAt: new Date(instant(visit.startAt) - ACCESS_WINDOW_MS).toISOString(), open: inAccessWindow },
    ...(includeHistory ? { history: safeHistory(history ?? source.history ?? []) } : {}),
  };
}

function assertRepository(repository) {
  if (typeof repository?.runForVisitActor !== 'function') {
    throw new TypeError('runForVisitActor repository port is required');
  }
}

function unwrapResult(result) {
  if (!result || typeof result !== 'object') fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Care instruction operation was not confirmed');
  return result;
}

/**
 * P26 service boundary. The repository adapter owns MongoDB transactions,
 * ownership predicates, CAS, idempotency, audit and outbox writes. This
 * module deliberately does not register routes or invent a persistence model;
 * P01/P34 provide those integration pieces.
 */
export function createCareInstructionsService({ repository, clock = () => new Date() } = {}) {
  assertRepository(repository);
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  async function inTransaction(actor, visitId, work) {
    actorId(actor, clock);
    identifier(visitId);
    try {
      return await repository.runForVisitActor(actor, visitId, work);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Care instruction operation is temporarily unavailable');
    }
  }

  async function getVisit(tx, visitId) {
    const visit = typeof tx.getVisit === 'function' ? await tx.getVisit(visitId)
      : typeof tx.findVisit === 'function' ? await tx.findVisit(visitId) : null;
    if (!visit || !VISIT_STATES.has(visit.state ?? 'SCHEDULED')) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }

  async function authorizeRead(actor, visit, tx, visitId) {
    const id = actor.userId;
    if (operational(actor)) return { operational: true };
    if (role(actor, 'CUSTOMER') && customerIdOf(visit) === id) return { customer: true };
    if (role(actor, 'PET_SITTER') && sitterIdOf(visit) === id) return { assigned: true };
    if (role(actor, 'PET_SITTER') && typeof tx.getOfferForSitter === 'function') {
      const offer = await tx.getOfferForSitter({ visitId, sitterId: id });
      const expired = offer?.deadline && instant(offer.deadline) <= nowValue(clock);
      if (offer && !expired && !['EXPIRED', 'REVOKED', 'DECLINED', 'WITHDRAWN'].includes(offer.state)) {
        return { candidate: true };
      }
    }
    fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }

  async function readInstructions({ actor, visitId } = {}) {
    return inTransaction(actor, visitId, async tx => {
      const visit = await getVisit(tx, visitId);
      const access = await authorizeRead(actor, visit, tx, visitId);
      if (access.assigned && visit.handoverRequired === true && visit.handoverAccepted !== true) {
        fail(403, 'HANDOVER_REQUIRED', 'Confirm the visit handover before reading the replacement snapshot');
      }
      const record = typeof tx.getCareInstructions === 'function' ? await tx.getCareInstructions(visitId) : null;
      const history = typeof tx.listCareInstructionHistory === 'function' ? await tx.listCareInstructionHistory(visitId) : record?.history;
      return publicView({ visitId, record, history, actor, visit, now: nowValue(clock), includeHistory: role(actor, 'CUSTOMER') || operational(actor) });
    });
  }

  async function updateInstructions({ actor, visitId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, instructions, reason = 'Customer update' } = {}) {
    const version = expectedVersion(suppliedVersion);
    const key = idempotencyKey(suppliedKey);
    const normalized = normalizeInstructions(instructions);
    const normalizedReason = text(reason, 'reason', 500);
    const hash = payloadHash({ visitId, version, instructions: normalized, reason: normalizedReason });
    return inTransaction(actor, visitId, async tx => {
      if (!role(actor, 'CUSTOMER')) fail(403, 'FORBIDDEN', 'Only the Customer can update care instructions');
      const visit = await getVisit(tx, visitId);
      if (customerIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
      const now = nowValue(clock);
      if (instant(visit.startAt) - now < CARE_CUTOFF_MS) fail(409, 'DEADLINE_PASSED', 'Care instructions can only be changed at least two hours before the visit');
      if (['COMPLETED', 'CANCELLED', 'STAFF_CLOSED'].includes(visit.state)) fail(409, 'INVALID_STATE', 'Visit no longer accepts care instruction changes');
      const identity = { actorRef: actor.userId, operation: 'CARE_INSTRUCTIONS_UPDATE', resourceRef: visitId, key };
      if (typeof tx.getIdempotencyResult === 'function') {
        const previous = await tx.getIdempotencyResult(identity);
        if (previous) {
          if (previous.payloadHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
          return previous.result;
        }
      }
      const current = typeof tx.getCareInstructions === 'function' ? await tx.getCareInstructions(visitId) : null;
      const currentVersion = Number.isSafeInteger(current?.version) ? current.version : 0;
      if (currentVersion !== version) fail(409, 'VERSION_CONFLICT', 'Care instructions changed; reload before editing');
      const nextVersion = currentVersion + 1;
      const importantChanged = importantFingerprint(current?.instructions ?? {}) !== importantFingerprint(normalized);
      const saved = typeof tx.saveCareInstructions === 'function'
        ? await tx.saveCareInstructions({ visit, previous: current, version: nextVersion, instructions: normalized,
          actorId: actor.userId, reason: normalizedReason, requiresAcknowledgement: importantChanged || nextVersion > 1,
          updatedAt: new Date(now).toISOString() }) : null;
      const result = unwrapResult(saved);
      if (result.version !== nextVersion) fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Care instruction version was not confirmed');
      if (typeof tx.appendAuditAndOutbox === 'function') await tx.appendAuditAndOutbox({
        type: 'CareInstructionsVersioned', actorId: actor.userId, visitId, version: nextVersion,
        requiresAcknowledgement: importantChanged || nextVersion > 1, at: new Date(now).toISOString()
      });
      if (typeof tx.saveIdempotencyResult === 'function') await tx.saveIdempotencyResult({ identity, payloadHash: hash, result });
      return result;
    });
  }

  async function acknowledgeInstructions({ actor, visitId, instructionVersion, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey } = {}) {
    const version = expectedVersion(instructionVersion ?? suppliedVersion);
    const key = idempotencyKey(suppliedKey);
    const hash = payloadHash({ visitId, version });
    return inTransaction(actor, visitId, async tx => {
      if (!role(actor, 'PET_SITTER')) fail(403, 'FORBIDDEN', 'Only a Pet Sitter can acknowledge care instructions');
      const visit = await getVisit(tx, visitId);
      const now = nowValue(clock);
      const candidate = typeof tx.getOfferForSitter === 'function' ? await tx.getOfferForSitter({ visitId, sitterId: actor.userId }) : null;
      const assigned = sitterIdOf(visit) === actor.userId;
      if (!assigned && !candidate) fail(404, 'RESOURCE_NOT_FOUND', 'Visit or offer not found');
      if (candidate && ['EXPIRED', 'REVOKED', 'DECLINED'].includes(candidate.state)) fail(409, 'INVALID_STATE', 'Offer is no longer available');
      if (candidate?.deadline && instant(candidate.deadline) <= now) fail(409, 'DEADLINE_PASSED', 'Offer has expired');
      const current = typeof tx.getCareInstructions === 'function' ? await tx.getCareInstructions(visitId) : null;
      const currentVersion = Number.isSafeInteger(current?.version) ? current.version : 0;
      if (currentVersion !== version) fail(409, 'VERSION_CONFLICT', 'Care instructions changed; read the latest version');
      const identity = { actorRef: actor.userId, operation: 'CARE_INSTRUCTIONS_ACKNOWLEDGE', resourceRef: visitId, key };
      if (typeof tx.getIdempotencyResult === 'function') {
        const previous = await tx.getIdempotencyResult(identity);
        if (previous) {
          if (previous.payloadHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
          return previous.result;
        }
      }
      if (typeof tx.recordCareInstructionAcknowledgement !== 'function') {
        fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Acknowledgement persistence is unavailable');
      }
      const result = unwrapResult(await tx.recordCareInstructionAcknowledgement({
        visit, sitterId: actor.userId, version, acknowledgedAt: new Date(now).toISOString()
      }));
      if (result.acknowledged !== true) fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Acknowledgement was not confirmed');
      if (typeof tx.appendAuditAndOutbox === 'function') await tx.appendAuditAndOutbox({
        type: 'CareInstructionsAcknowledged', actorId: actor.userId, visitId, version, at: result.acknowledgedAt
      });
      if (typeof tx.saveIdempotencyResult === 'function') await tx.saveIdempotencyResult({ identity, payloadHash: hash, result });
      return result;
    });
  }

  async function getAccessNotes({ actor, visitId } = {}) {
    return inTransaction(actor, visitId, async tx => {
      const visit = await getVisit(tx, visitId);
      if (!role(actor, 'PET_SITTER') || sitterIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
      const now = nowValue(clock);
      if (instant(visit.startAt) - now > ACCESS_WINDOW_MS) fail(403, 'ACCESS_WINDOW_CLOSED', 'Access notes are available from one hour before the visit');
      if (visit.endAt && now >= instant(visit.endAt)) fail(403, 'ACCESS_REVOKED', 'Access notes are no longer available');
      if (visit.handoverRequired === true && visit.handoverAccepted !== true) fail(403, 'HANDOVER_REQUIRED', 'Confirm the visit handover before viewing access notes');
      if (typeof tx.getCareInstructions !== 'function') {
        fail(503, 'CARE_INSTRUCTIONS_UNAVAILABLE', 'Care instruction acknowledgement is unavailable');
      }
      const care = await tx.getCareInstructions(visitId);
      const acknowledged = Number.isSafeInteger(care?.version)
        && Array.isArray(care.acknowledgements)
        && care.acknowledgements.some(item => item.sitterId === actor.userId && item.version === care.version);
      if (!acknowledged) fail(403, 'CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED', 'Acknowledge the latest care instructions before viewing access notes');
      const notes = typeof tx.getAccessNotesSnapshot === 'function' ? await tx.getAccessNotesSnapshot({ visitId, sitterId: actor.userId }) : null;
      if (!notes) fail(404, 'RESOURCE_NOT_FOUND', 'Access notes not found');
      return { visitId, privateAccessNotes: notes.privateAccessNotes ?? notes.accessNotes ?? null, expiresAt: visit.endAt ?? null };
    });
  }

  return Object.freeze({
    get: readInstructions,
    getInstructions: readInstructions,
    update: updateInstructions,
    updateInstructions,
    acknowledge: acknowledgeInstructions,
    acknowledgeInstructions,
    getAccessNotes,
  });
}

export { CARE_CUTOFF_MS, ACCESS_WINDOW_MS, SERVICE_TIME_ZONE, normalizeInstructions };
