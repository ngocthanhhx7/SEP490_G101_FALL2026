import { createHash, randomUUID } from 'node:crypto';
import { hasRole } from '../../middlewares/session.js';
import { AppError } from '../../utils/app-error.js';

export const COMPLAINT_STATES = Object.freeze(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']);
export const COMPLAINT_OPEN_STATES = Object.freeze(['OPEN', 'UNDER_REVIEW']);
export const COMPLAINT_CATEGORIES = Object.freeze([
  'SERVICE_QUALITY', 'PET_SAFETY', 'SITTER_CONDUCT', 'ACCESS', 'BILLING', 'OTHER'
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_TEXT = 4000;
const MAX_NOTES = 8000;
const MAX_EVIDENCE = 20;
const COMPLAINT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const fail = (status, code, message, details = {}) => { throw new AppError(status, code, message, details); };
const invalid = (field, message = 'Complaint request is invalid') => fail(422, 'VALIDATION_FAILED', message,
  field ? { fieldErrors: { [field]: message } } : {});

function nowValue(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('clock must return a valid date');
  return date.getTime();
}

function active(actor, clock) {
  if (!actor || actor.state !== 'ACTIVE' || actor.synthetic === true || typeof actor.userId !== 'string'
    || !ID.test(actor.userId) || !Array.isArray(actor.roles) || actor.roles.length === 0
    || actor.roles.some(role => !['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(role))
    || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= nowValue(clock)) {
    fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }
}

function id(value, field = 'id') {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, `${field} is invalid`);
  return value;
}

function version(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) invalid('expectedVersion', 'A nonnegative version is required');
  return value;
}

function key(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}

function text(value, field, max = MAX_TEXT, optional = false) {
  if (value === undefined && optional) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) invalid(field, `${field} is invalid`);
  const result = value.trim();
  if (!result && !optional) invalid(field, `${field} cannot be empty`);
  return result || null;
}

function enumValue(value, values, field, fallback = null) {
  const result = value === undefined || value === null || value === '' ? fallback : value;
  if (result === null && fallback === null) return null;
  if (!values.includes(result)) invalid(field, `${field} is invalid`);
  return result;
}

function normalizeEvidence(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE) invalid('evidenceRefs', 'At most 20 evidence references are allowed');
  return value.map((item, index) => {
    if (typeof item === 'string') return { mediaId: id(item, `evidenceRefs.${index}`) };
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(`evidenceRefs.${index}`);
    return {
      mediaId: id(item.mediaId ?? item.id, `evidenceRefs.${index}.mediaId`),
      kind: text(item.kind ?? 'COMPLAINT', `evidenceRefs.${index}.kind`, 60),
      caption: text(item.caption, `evidenceRefs.${index}.caption`, 500, true)
    };
  });
}

function normalizeSubmission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('complaint');
  return {
    category: enumValue(input.category, COMPLAINT_CATEGORIES, 'category', 'OTHER'),
    summary: text(input.summary ?? input.subject, 'summary', 500),
    description: text(input.description ?? input.details ?? input.message, 'description'),
    evidenceRefs: normalizeEvidence(input.evidenceRefs ?? input.photoRefs),
    requestedOutcome: text(input.requestedOutcome, 'requestedOutcome', 2000, true)
  };
}

function normalizeStaffResolution(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('resolution');
  if (input.financialHold !== undefined && typeof input.financialHold !== 'boolean') invalid('financialHold', 'financialHold must be true or false');
  return {
    summary: text(input.summary ?? input.resolution, 'summary'),
    actionsTaken: text(input.actionsTaken, 'actionsTaken', MAX_TEXT, true),
    followUp: text(input.followUp, 'followUp', 2000, true),
    staffNotes: text(input.staffNotes, 'staffNotes', MAX_NOTES, true),
    financialHold: input.financialHold
  };
}

function normalizeObjection(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('objection');
  return { reason: text(input.reason ?? input.message, 'reason', MAX_TEXT), evidenceRefs: normalizeEvidence(input.evidenceRefs) };
}

function normalizeDecision(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('decision');
  if (input.financialHold !== undefined && typeof input.financialHold !== 'boolean') invalid('financialHold', 'financialHold must be true or false');
  return {
    summary: text(input.summary ?? input.decision, 'summary'),
    actionsTaken: text(input.actionsTaken, 'actionsTaken', MAX_TEXT, true),
    financialHold: input.financialHold,
    financialDecision: input.financialDecision === undefined ? null : text(input.financialDecision, 'financialDecision', 2000)
  };
}

function idOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return value.id ?? value._id?.toString?.() ?? value._id ?? null;
}

function visitIdOf(value) { return idOf(value?.visitId ?? value?.visit?.id ?? value?.visit?._id); }
function customerIdOf(value) { return idOf(value?.customerId ?? value?.booking?.customerId ?? value?.visit?.customerId); }
function sitterIdOf(value) { return idOf(value?.sitterId ?? value?.assignment?.sitterId ?? value?.visit?.sitterId); }
function payloadHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function completionTime(visit) {
  const value = visit?.completedAt ?? visit?.closedAt ?? visit?.staffClosedAt;
  const time = value instanceof Date ? value.getTime() : Date.parse(value || '');
  if (!Number.isFinite(time)) fail(503, 'COMPLAINT_UNAVAILABLE', 'Visit completion time is unavailable');
  return time;
}

function eligibleVisit(visit) {
  return visit && ['COMPLETED', 'STAFF_CLOSED'].includes(visit.state) && Boolean(sitterIdOf(visit));
}

function safeEvidence(value) {
  if (!value || typeof value !== 'object') return null;
  const mediaId = idOf(value.mediaId ?? value.id);
  if (!mediaId || !ID.test(mediaId)) return null;
  return { mediaId, kind: typeof value.kind === 'string' ? value.kind : 'COMPLAINT',
    caption: typeof value.caption === 'string' ? value.caption.slice(0, 500) : null,
    recordedAt: value.recordedAt ?? value.createdAt ?? null };
}

function safeComplaint(record, actor) {
  if (!record || typeof record !== 'object') return null;
  const state = COMPLAINT_STATES.includes(record.state) ? record.state : null;
  const result = {
    id: idOf(record.id ?? record._id), kind: 'COMPLAINT', visitId: visitIdOf(record),
    state, version: Number.isSafeInteger(record.version) ? record.version : 0,
    category: COMPLAINT_CATEGORIES.includes(record.category) ? record.category : 'OTHER',
    summary: typeof record.summary === 'string' ? record.summary : '',
    description: typeof record.description === 'string' ? record.description : '',
    requestedOutcome: typeof record.requestedOutcome === 'string' ? record.requestedOutcome : null,
    evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs.map(safeEvidence).filter(Boolean) : [],
    createdAt: record.createdAt ?? record.openedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    response: record.resolution ? {
      summary: typeof record.resolution.summary === 'string' ? record.resolution.summary : '',
      actionsTaken: typeof record.resolution.actionsTaken === 'string' ? record.resolution.actionsTaken : null,
      followUp: typeof record.resolution.followUp === 'string' ? record.resolution.followUp : null,
      recordedAt: record.resolution.recordedAt ?? null
    } : null,
    objection: { allowed: state === 'RESOLVED' && (record.objectionCount ?? 0) < 1,
      count: Number.isSafeInteger(record.objectionCount) ? record.objectionCount : 0,
      latestReason: record.latestObjection && typeof record.latestObjection.reason === 'string' ? record.latestObjection.reason : null },
    context: { bookingId: idOf(record.bookingId ?? record.booking?.id), serviceName: typeof record.serviceName === 'string' ? record.serviceName : null },
    settlement: record.financialHold ? { state: 'ON_HOLD' } : { state: 'NOT_HELD' }
  };
  if (!result.id || !result.visitId || !result.state) return null;
  if (hasRole(actor?.roles, 'STAFF')) {
    result.staffNotes = typeof record.privateStaffNotes === 'string' ? record.privateStaffNotes : typeof record.staffNotes === 'string' ? record.staffNotes : null;
    result.involvedActorRefs = Array.isArray(record.involvedActorRefs) ? record.involvedActorRefs.map(idOf).filter(Boolean) : [];
    result.financialHold = record.financialHold ? { state: record.financialHold.state || 'ON_HOLD', reference: idOf(record.financialHold.reference) } : null;
  } else if (hasRole(actor?.roles, 'PET_SITTER')) {
    delete result.objection;
    delete result.settlement;
  }
  return result;
}

async function callFirst(tx, methods, ...args) {
  const method = methods.find(name => typeof tx?.[name] === 'function');
  return method ? tx[method](...args) : undefined;
}

async function callRequired(tx, methods, args, message) {
  const method = methods.find(name => typeof tx?.[name] === 'function');
  if (!method) fail(503, 'FINANCIAL_HOLD_UNAVAILABLE', message);
  return tx[method](...args);
}

async function existingOperation(tx, identity, hash) {
  const previous = typeof tx.getIdempotencyResult === 'function' ? await tx.getIdempotencyResult(identity)
    : typeof tx.findOperation === 'function' ? await tx.findOperation(identity) : null;
  if (!previous) return null;
  const oldHash = previous.payloadHash ?? previous.fingerprint;
  if (oldHash && oldHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'This idempotency key was used for a different request');
  return previous.result ?? previous;
}

async function saveOperation(tx, identity, hash, result) {
  if (typeof tx.saveIdempotencyResult === 'function') await tx.saveIdempotencyResult({ identity, payloadHash: hash, result });
  else if (typeof tx.recordOperation === 'function') await tx.recordOperation({ ...identity, idempotencyKey: identity.key, fingerprint: hash, result });
}

function transitionAllowed(current, target) {
  return (current === 'OPEN' && target === 'UNDER_REVIEW')
    || (current === 'UNDER_REVIEW' && target === 'RESOLVED')
    || (current === 'RESOLVED' && target === 'UNDER_REVIEW')
    || (current === 'UNDER_REVIEW' && target === 'CLOSED')
    || (current === 'RESOLVED' && target === 'CLOSED');
}

export function createComplaintService({ repository, clock = () => new Date() } = {}) {
  if (!repository || (!repository.runForVisitActor && !repository.runForCase && !repository.runTransaction)) {
    throw new TypeError('Complaint transaction repository port is required');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');

  async function transaction(actor, resourceId, work, kind = 'visit') {
    active(actor, clock);
    id(resourceId, kind === 'case' ? 'complaintId' : 'visitId');
    try {
      if (kind === 'case' && typeof repository.runForCase === 'function') return await repository.runForCase(actor, resourceId, work);
      if (kind === 'visit' && typeof repository.runForVisitActor === 'function') return await repository.runForVisitActor(actor, resourceId, work);
      return await repository.runTransaction({ actor, resourceId }, work);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'COMPLAINT_UNAVAILABLE', 'Complaint operation is temporarily unavailable');
    }
  }

  async function getVisit(tx, visitId) {
    const visit = await callFirst(tx, ['getVisit', 'findVisit'], visitId);
    if (!visit || (visitIdOf(visit) && visitIdOf(visit) !== visitId)) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }

  function authorizeCustomer(actor, visit) {
    if (!hasRole(actor.roles, 'CUSTOMER') || customerIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }

  function authorizeRead(actor, record, visit) {
    if (hasRole(actor.roles, 'STAFF')) return;
    if (hasRole(actor.roles, 'CUSTOMER') && customerIdOf(visit) === actor.userId) return;
    if (hasRole(actor.roles, 'PET_SITTER') && sitterIdOf(visit) === actor.userId
      && (!sitterIdOf(record) || sitterIdOf(record) === actor.userId)) return;
    fail(404, 'RESOURCE_NOT_FOUND', 'Complaint not found');
  }

  async function submit({ actor, visitId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    active(actor, clock);
    if (!hasRole(actor.roles, 'CUSTOMER')) fail(403, 'FORBIDDEN', 'Customer access is required');
    const normalized = normalizeSubmission(input);
    const expected = version(suppliedVersion);
    const supplied = key(suppliedKey);
    const hash = payloadHash({ visitId, expectedVersion: expected, complaint: normalized });
    return transaction(actor, visitId, async tx => {
      const visit = await getVisit(tx, visitId); authorizeCustomer(actor, visit);
      const identity = { actorRef: actor.userId, resourceRef: visitId, operation: 'COMPLAINT_SUBMIT', key: supplied };
      const previous = await existingOperation(tx, identity, hash); if (previous) return previous;
      if (!eligibleVisit(visit)) fail(409, 'VISIT_NOT_ELIGIBLE', 'A complaint requires an assigned completed visit');
      if (expected !== null && visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before submitting');
      const completedAt = completionTime(visit); const now = nowValue(clock);
      if (now < completedAt) fail(409, 'VISIT_NOT_COMPLETE', 'A complaint can be submitted after the visit is complete');
      if (now > completedAt + COMPLAINT_WINDOW_MS) fail(409, 'COMPLAINT_WINDOW_EXPIRED', 'The 7-day complaint window has expired');
      const existing = await callFirst(tx, ['findOpenComplaint', 'getOpenComplaint', 'findComplaint'], {
        visitId, customerId: actor.userId, states: COMPLAINT_OPEN_STATES
      });
      if (existing && COMPLAINT_OPEN_STATES.includes(existing.state)) fail(409, 'COMPLAINT_ALREADY_OPEN', 'This visit already has an open complaint');
      const openedAt = new Date(now).toISOString();
      const saved = await callFirst(tx, ['createComplaint', 'createCase', 'saveComplaint'], {
        id: randomUUID(), kind: 'COMPLAINT', visitId, customerId: actor.userId, sitterId: sitterIdOf(visit),
        bookingId: idOf(visit.bookingId ?? visit.booking?.id), serviceName: visit.serviceName ?? visit.serviceSnapshot?.name ?? null,
        involvedActorRefs: [actor.userId, sitterIdOf(visit)].filter(Boolean), ...normalized,
        state: 'OPEN', version: 0, objectionCount: 0, createdAt: openedAt, openedAt,
        actorId: actor.userId, idempotencyKey: supplied
      });
      if (!saved) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint was not acknowledged by the server');
      const complaint = safeComplaint({ ...saved, ...normalized, id: saved.id ?? saved._id, kind: 'COMPLAINT', visitId,
        customerId: actor.userId, sitterId: sitterIdOf(visit), state: saved.state ?? 'OPEN', createdAt: saved.createdAt ?? openedAt }, actor);
      if (!complaint) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint response is invalid');
      const result = { complaint, case: complaint, complaintId: complaint.id, visitId, state: complaint.state, version: complaint.version };
      await callFirst(tx, ['appendAuditAndOutbox'], { type: 'ComplaintOpened', actorId: actor.userId, complaintId: complaint.id, visitId, at: openedAt });
      await saveOperation(tx, identity, hash, result);
      return result;
    });
  }

  async function loadCase(tx, complaintId, actor) {
    const record = await callFirst(tx, ['getComplaint', 'getCase', 'findComplaint', 'findCase'], complaintId);
    if (!record || (idOf(record.id ?? record._id) && idOf(record.id ?? record._id) !== complaintId)
      || (record.kind && record.kind !== 'COMPLAINT')) fail(404, 'RESOURCE_NOT_FOUND', 'Complaint not found');
    const visitId = visitIdOf(record);
    if (!visitId) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint visit is unavailable');
    const visit = await getVisit(tx, visitId); authorizeRead(actor, record, visit);
    return { record, visit };
  }

  async function get({ actor, complaintId, caseId } = {}) {
    const idValue = id(complaintId ?? caseId, 'complaintId');
    return transaction(actor, idValue, async tx => {
      const { record } = await loadCase(tx, idValue, actor);
      const result = safeComplaint({ ...record, kind: 'COMPLAINT' }, actor);
      if (!result) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint response is invalid');
      return result;
    }, 'case');
  }

  async function list({ actor, query = {} } = {}) {
    active(actor, clock);
    if (!query || typeof query !== 'object' || Array.isArray(query)) invalid();
    const allowed = new Set(['visitId', 'state', 'category', 'limit', 'cursor']);
    if (Object.keys(query).some(field => !allowed.has(field))) invalid();
    const filter = {
      visitId: query.visitId ? id(query.visitId, 'visitId') : null,
      state: query.state ? enumValue(query.state, COMPLAINT_STATES, 'state') : null,
      category: query.category ? enumValue(query.category, COMPLAINT_CATEGORIES, 'category') : null
    };
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('limit');
    if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(query.cursor))) invalid('cursor');
    let result;
    try {
      result = await (typeof repository.listComplaints === 'function' ? repository.listComplaints({ actor, filter, limit, cursor: query.cursor ?? null, projection: 'CASE_SAFE_V1' })
        : typeof repository.listCases === 'function' ? repository.listCases({ actor, kind: 'COMPLAINT', filter, limit, cursor: query.cursor ?? null, projection: 'CASE_SAFE_V1' })
          : null);
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list is temporarily unavailable'); }
    active(actor, clock);
    if (!result) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list is temporarily unavailable');
    const rows = Array.isArray(result) ? result : result.items;
    if (!Array.isArray(rows) || rows.length > limit) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list response is invalid');
    const items = rows.map(row => {
      const allowed = hasRole(actor.roles, 'STAFF')
        || (hasRole(actor.roles, 'CUSTOMER') && customerIdOf(row) === actor.userId)
        || (hasRole(actor.roles, 'PET_SITTER') && sitterIdOf(row) === actor.userId);
      if (!allowed) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list returned an out-of-scope record');
      const item = safeComplaint({ ...row, kind: 'COMPLAINT' }, actor);
      if (!item || (filter.state && item.state !== filter.state) || (filter.category && item.category !== filter.category)
        || (filter.visitId && item.visitId !== filter.visitId)) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint list response is invalid');
      return item;
    });
    return { items, nextCursor: result.nextCursor ?? null };
  }

  async function command({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, operation, work } = {}) {
    active(actor, clock);
    const idValue = id(complaintId, 'complaintId'); const expected = version(suppliedVersion); const supplied = key(suppliedKey);
    const hash = payloadHash({ complaintId: idValue, expectedVersion: expected, operation, input: work.input });
    return transaction(actor, idValue, async tx => {
      const { record, visit } = await loadCase(tx, idValue, actor);
      const identity = { actorRef: actor.userId, resourceRef: idValue, operation, key: supplied };
      const previous = await existingOperation(tx, identity, hash); if (previous) return previous;
      const currentVersion = Number.isSafeInteger(record.version) ? record.version : 0;
      if (expected === null || currentVersion !== expected) fail(409, 'VERSION_CONFLICT', 'Complaint changed; reload before continuing');
      const resultRecord = await work.run({ tx, record, visit, actor, now: new Date(nowValue(clock)).toISOString(), expected, supplied });
      if (!resultRecord) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint update was not acknowledged by the server');
      const complaint = safeComplaint({ ...record, ...resultRecord, kind: 'COMPLAINT', id: idValue, visitId: visitIdOf(record) }, actor);
      if (!complaint) fail(503, 'COMPLAINT_UNAVAILABLE', 'Complaint response is invalid');
      const result = { complaint, case: complaint, complaintId: idValue, state: complaint.state, version: complaint.version };
      await callFirst(tx, ['appendAuditAndOutbox'], { type: operation, actorId: actor.userId, complaintId: idValue, visitId: visitIdOf(record), at: resultRecord.updatedAt });
      await saveOperation(tx, identity, hash, result); return result;
    }, 'case');
  }

  async function review({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    if (!hasRole(actor?.roles, 'STAFF')) fail(403, 'FORBIDDEN', 'Staff access is required');
    const resolution = normalizeStaffResolution(input);
    return command({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, operation: 'ComplaintUnderReview',
      work: { input: resolution, run: async ({ tx, record, now, actor: current, expected, supplied }) => {
        if (!transitionAllowed(record.state, 'UNDER_REVIEW')) fail(409, 'INVALID_STATE', 'Only an open complaint can enter review');
        const saved = await callFirst(tx, ['reviewComplaint', 'updateComplaint', 'updateCase'], {
          complaintId, complaint: record, resolution: { ...resolution, state: 'UNDER_REVIEW', version: expected + 1, updatedAt: now, actorId: current.userId },
          expectedVersion: expected, actorId: current.userId, idempotencyKey: supplied
        });
        if (!saved || saved.version !== expected + 1) fail(503, 'COMPLAINT_UNAVAILABLE', 'Review update was not acknowledged');
        return { ...saved, state: saved.state ?? 'UNDER_REVIEW', version: saved.version, resolution: saved.resolution ?? resolution, updatedAt: saved.updatedAt ?? now };
      } } });
  }

  async function resolve({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    if (!hasRole(actor?.roles, 'STAFF')) fail(403, 'FORBIDDEN', 'Staff access is required');
    const resolution = normalizeStaffResolution(input);
    return command({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, operation: 'ComplaintResolved',
      work: { input: resolution, run: async ({ tx, record, now, actor: current, expected, supplied }) => {
        if (!transitionAllowed(record.state, 'RESOLVED')) fail(409, 'INVALID_STATE', 'Only a complaint under review can be resolved');
        const saved = await callFirst(tx, ['resolveComplaint', 'updateComplaint', 'updateCase'], {
          complaintId, complaint: record, resolution: { ...resolution, state: 'RESOLVED', version: expected + 1, updatedAt: now, recordedAt: now, actorId: current.userId },
          expectedVersion: expected, actorId: current.userId, idempotencyKey: supplied
        });
        if (!saved || saved.version !== expected + 1) fail(503, 'COMPLAINT_UNAVAILABLE', 'Resolution was not acknowledged');
        if (resolution.financialHold === true) await callRequired(tx, ['holdSettlement', 'placeFinancialHold'],
          [{ complaintId, visitId: visitIdOf(record), actorId: current.userId, reason: resolution.summary }],
          'Financial hold port is not configured; complaint resolution cannot complete');
        return { ...saved, state: saved.state ?? 'RESOLVED', version: saved.version, resolution: saved.resolution ?? resolution, updatedAt: saved.updatedAt ?? now,
          financialHold: saved.financialHold ?? (resolution.financialHold === true ? { state: 'ON_HOLD' } : record.financialHold) };
      } } });
  }

  async function object({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    active(actor, clock); if (!hasRole(actor.roles, 'CUSTOMER')) fail(403, 'FORBIDDEN', 'Customer access is required');
    const objection = normalizeObjection(input);
    return command({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, operation: 'ComplaintObjected',
      work: { input: objection, run: async ({ tx, record, visit, now, actor: current, expected, supplied }) => {
        authorizeCustomer(current, visit);
        if ((record.objectionCount ?? 0) >= 1) fail(409, 'OBJECTION_ALREADY_USED', 'Only one disagreement is allowed');
        if (!transitionAllowed(record.state, 'UNDER_REVIEW')) fail(409, 'INVALID_STATE', 'Only a resolved complaint can be disputed');
        const saved = await callFirst(tx, ['objectComplaint', 'recordComplaintObjection', 'updateComplaint', 'updateCase'], {
          complaintId, complaint: record, objection: { ...objection, state: 'UNDER_REVIEW', objectionCount: 1, updatedAt: now, actorId: current.userId },
          expectedVersion: expected, actorId: current.userId, idempotencyKey: supplied
        });
        if (!saved || saved.version !== expected + 1) fail(503, 'COMPLAINT_UNAVAILABLE', 'Disagreement was not acknowledged');
        return { ...saved, state: saved.state ?? 'UNDER_REVIEW', version: saved.version, objectionCount: 1,
          latestObjection: saved.latestObjection ?? objection, updatedAt: saved.updatedAt ?? now };
      } } });
  }

  async function decide({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    active(actor, clock); if (!hasRole(actor.roles, 'ADMIN')) fail(403, 'FORBIDDEN', 'Admin access is required');
    const decision = normalizeDecision(input);
    return command({ actor, complaintId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, operation: 'ComplaintClosed',
      work: { input: decision, run: async ({ tx, record, now, actor: current, expected, supplied }) => {
        if (!transitionAllowed(record.state, 'CLOSED')) fail(409, 'INVALID_STATE', 'Complaint is not ready for a final decision');
        const saved = await callFirst(tx, ['decideComplaint', 'closeComplaint', 'updateComplaint', 'updateCase'], {
          complaintId, complaint: record, decision: { ...decision, state: 'CLOSED', version: expected + 1, updatedAt: now, recordedAt: now, actorId: current.userId },
          expectedVersion: expected, actorId: current.userId, idempotencyKey: supplied
        });
        if (!saved || saved.version !== expected + 1) fail(503, 'COMPLAINT_UNAVAILABLE', 'Final decision was not acknowledged');
        if (decision.financialHold === false) await callRequired(tx, ['releaseSettlementHold', 'releaseFinancialHold'],
          [{ complaintId, visitId: visitIdOf(record), actorId: current.userId, reason: decision.summary }],
          'Financial hold release port is not configured; final decision cannot complete');
        return { ...saved, state: 'CLOSED', version: saved.version, resolution: saved.resolution ?? decision,
          financialHold: saved.financialHold ?? (decision.financialHold === false ? null : record.financialHold), updatedAt: saved.updatedAt ?? now };
      } } });
  }

  return Object.freeze({ submit, create: submit, createComplaint: submit, submitComplaint: submit, list, get, detail: get, review,
    resolve, object, disagree: object, decide, finalize: decide });
}

export { normalizeSubmission, safeComplaint, COMPLAINT_WINDOW_MS };
export const createComplaintManagementService = createComplaintService;
