import { createHash, randomUUID } from 'node:crypto';
import { hasRole } from '../../middlewares/session.js';
import { AppError } from '../../utils/app-error.js';

export const INCIDENT_STATES = Object.freeze(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']);
export const INCIDENT_SEVERITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const INCIDENT_URGENCIES = Object.freeze(['ROUTINE', 'URGENT', 'EMERGENCY']);
export const INCIDENT_CATEGORIES = Object.freeze([
  'SAFETY', 'HEALTH_OBSERVATION', 'MISSING_PET', 'ACCESS', 'PROPERTY', 'BEHAVIOUR', 'OTHER'
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_TEXT = 4000;
const MAX_NOTES = 8000;
const MAX_EVIDENCE = 20;
const MAX_TIMELINE = 100;
const fail = (status, code, message, details = {}) => { throw new AppError(status, code, message, details); };
const invalid = (field, message = 'Incident request is invalid') => fail(422, 'VALIDATION_FAILED', message,
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
function operational(actor) { return hasRole(actor?.roles, 'STAFF'); }
function identifier(value, field = 'id') {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, `${field} is invalid`);
  return value;
}
function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid('expectedVersion', 'A nonnegative version is required');
  return value;
}
function idempotency(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}
function text(value, field, max = MAX_TEXT, optional = false) {
  if (value === undefined && optional) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) invalid(field, `${field} is invalid`);
  const normalized = value.trim();
  if (!normalized && !optional) invalid(field, `${field} cannot be empty`);
  return normalized || null;
}
function enumValue(value, values, field, fallback) {
  const result = value === undefined || value === null || value === '' ? fallback : value;
  if (result === null && fallback === null) return null;
  if (!values.includes(result)) invalid(field, `${field} is invalid`);
  return result;
}
function instant(value, field, { optional = false, now } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    invalid(field, `${field} is required`);
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalid(field, `${field} is invalid`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(field, `${field} is invalid`);
  if (now !== undefined && date.getTime() > now + 5 * 60 * 1000) invalid(field, `${field} cannot be in the future`);
  return date.toISOString();
}
function payloadHash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function idOf(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toHexString === 'function') return value.toHexString();
  return value.id ?? value._id?.toString?.() ?? value._id ?? null;
}
function visitIdOf(value) { return idOf(value?.visitId ?? value?.visit?.id ?? value?.visit?._id); }
function customerIdOf(value) { return idOf(value?.customerId ?? value?.booking?.customerId ?? value?.visit?.customerId); }
function sitterIdOf(value) { return idOf(value?.sitterId ?? value?.assignment?.sitterId ?? value?.visit?.sitterId); }
function state(value) { return INCIDENT_STATES.includes(value) ? value : null; }
function safeId(value, field) {
  const id = idOf(value);
  return id && ID.test(id) ? id : (field ? null : undefined);
}
function normalizeEvidence(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE) invalid('evidenceRefs', 'At most 20 evidence references are allowed');
  return value.map((item, index) => {
    if (typeof item === 'string') return { mediaId: identifier(item, `evidenceRefs.${index}`) };
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(`evidenceRefs.${index}`);
    const mediaId = identifier(item.mediaId ?? item.id, `evidenceRefs.${index}.mediaId`);
    const kind = item.kind === undefined ? 'INCIDENT' : text(item.kind, `evidenceRefs.${index}.kind`, 40);
    const caption = text(item.caption, `evidenceRefs.${index}.caption`, 500, true);
    return { mediaId, kind, caption };
  });
}
function normalizeTimeline(value, clock) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TIMELINE) invalid('timeline');
  const now = nowValue(clock);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(`timeline.${index}`);
    return { type: text(item.type, `timeline.${index}.type`, 80),
      note: text(item.note ?? item.description, `timeline.${index}.note`, 1000),
      occurredAt: instant(item.occurredAt, `timeline.${index}.occurredAt`, { now }) };
  });
}
function normalizeIncident(input = {}, clock) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('incident');
  const severity = enumValue(input.severity, INCIDENT_SEVERITIES, 'severity', null);
  const urgency = enumValue(input.urgency, INCIDENT_URGENCIES, 'urgency', null);
  if (!severity && !urgency) invalid('urgency', 'severity or urgency is required');
  const description = text(input.description ?? input.summary ?? input.details, 'description');
  return {
    category: enumValue(input.category ?? input.type, INCIDENT_CATEGORIES, 'category', 'OTHER'),
    severity: severity || (urgency === 'EMERGENCY' ? 'CRITICAL' : urgency === 'URGENT' ? 'HIGH' : 'MEDIUM'),
    urgency: urgency || (severity === 'CRITICAL' ? 'EMERGENCY' : severity === 'HIGH' ? 'URGENT' : 'ROUTINE'),
    description, observedAt: instant(input.observedAt, 'observedAt', { optional: true, now: nowValue(clock) }),
    immediateAction: text(input.immediateAction, 'immediateAction', 2000, true),
    contactPreference: enumValue(input.contactPreference,
      ['STAFF_REVIEW', 'CALL_CUSTOMER', 'CONTACT_VET', 'EMERGENCY_SERVICES'], 'contactPreference', 'STAFF_REVIEW'),
    evidenceRefs: normalizeEvidence(input.evidenceRefs ?? input.photoRefs),
    timeline: normalizeTimeline(input.timeline, clock),
    petId: input.petId === undefined || input.petId === null || input.petId === '' ? null : identifier(input.petId, 'petId')
  };
}
function normalizeResolution(input = {}, actor, clock) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('resolution');
  const targetState = enumValue(input.targetState ?? input.state, ['UNDER_REVIEW', 'RESOLVED', 'CLOSED'], 'targetState', 'RESOLVED');
  return {
    targetState,
    summary: text(input.summary ?? input.resolution, 'summary'),
    actionsTaken: text(input.actionsTaken, 'actionsTaken', 4000, true),
    customerContacted: input.customerContacted === undefined ? false : input.customerContacted,
    veterinaryContacted: input.veterinaryContacted === undefined ? false : input.veterinaryContacted,
    followUp: text(input.followUp, 'followUp', 2000, true),
    staffNotes: operational(actor) ? text(input.staffNotes, 'staffNotes', MAX_NOTES, true) : null,
    financialDecision: input.financialDecision === undefined || input.financialDecision === null ? null : normalizeFinancialDecision(input.financialDecision),
    recordedAt: new Date(nowValue(clock)).toISOString()
  };
}
function normalizeFinancialDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('financialDecision');
  const decision = enumValue(value.decision, ['HOLD_REVIEW', 'RELEASE_HOLD', 'ADJUSTMENT_REVIEW', 'NO_FINANCIAL_ACTION'], 'financialDecision.decision', null);
  const reason = text(value.reason, 'financialDecision.reason', 2000);
  return { decision, reason, reference: value.reference === undefined ? null : identifier(value.reference, 'financialDecision.reference') };
}
function safeEvidence(value, allowReadUrl = false) {
  if (!value || typeof value !== 'object') return null;
  const mediaId = safeId(value.mediaId ?? value.id, 'mediaId');
  if (!mediaId) return null;
  const result = { mediaId, kind: value.kind || 'INCIDENT', caption: typeof value.caption === 'string' ? value.caption.slice(0, 500) : null,
    recordedAt: value.recordedAt || value.createdAt || null };
  if (allowReadUrl && typeof value.readUrl === 'string') { result.readUrl = value.readUrl; result.readUrlExpiresAt = value.readUrlExpiresAt || value.expiresAt || null; }
  return result;
}
function safeTimeline(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_TIMELINE).map(item => item && typeof item === 'object' ? {
    type: typeof item.type === 'string' ? item.type : 'INCIDENT_UPDATE',
    note: typeof item.note === 'string' ? item.note.slice(0, 1000) : typeof item.description === 'string' ? item.description.slice(0, 1000) : '',
    occurredAt: item.occurredAt || item.recordedAt || null,
    actorRole: ['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN'].includes(item.actorRole) ? item.actorRole : undefined
  } : null).filter(Boolean);
}
function safeCase(record, actor) {
  if (!record || typeof record !== 'object') return null;
  const result = {
    id: safeId(record.id ?? record._id, 'id'), visitId: safeId(record.visitId ?? record.visit?._id, 'visitId'),
    kind: record.kind === 'INCIDENT' ? 'INCIDENT' : null, state: state(record.state), version: Number.isSafeInteger(record.version) ? record.version : 0,
    category: INCIDENT_CATEGORIES.includes(record.category ?? record.type) ? (record.category ?? record.type) : 'OTHER',
    severity: INCIDENT_SEVERITIES.includes(record.severity) ? record.severity : null,
    urgency: INCIDENT_URGENCIES.includes(record.urgency) ? record.urgency : null,
    petId: safeId(record.petId, 'petId'), description: typeof record.description === 'string' ? record.description : '',
    immediateAction: typeof record.immediateAction === 'string' ? record.immediateAction : null,
    contactPreference: record.contactPreference || 'STAFF_REVIEW',
    evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs.map(item => safeEvidence(item, false)).filter(Boolean) : [],
    timeline: safeTimeline(record.timeline), createdAt: record.createdAt || record.openedAt || null, updatedAt: record.updatedAt || null,
    resolution: record.resolution ? {
      targetState: record.resolution.targetState || record.resolution.state || null,
      summary: typeof record.resolution.summary === 'string' ? record.resolution.summary : '',
      actionsTaken: typeof record.resolution.actionsTaken === 'string' ? record.resolution.actionsTaken : null,
      followUp: typeof record.resolution.followUp === 'string' ? record.resolution.followUp : null,
      customerContacted: record.resolution.customerContacted === true,
      veterinaryContacted: record.resolution.veterinaryContacted === true,
      recordedAt: record.resolution.recordedAt || null,
      final: record.resolution.final === true
    } : null,
    financialHold: operational(actor) && record.financialHold ? { state: record.financialHold.state || 'PENDING_REVIEW', reference: safeId(record.financialHold.reference) } : null
  };
  if (operational(actor)) {
    result.involvedActorRefs = Array.isArray(record.involvedActorRefs) ? record.involvedActorRefs.map(safeId).filter(Boolean) : [];
    result.staffNotes = typeof record.privateStaffNotes === 'string' ? record.privateStaffNotes : typeof record.staffNotes === 'string' ? record.staffNotes : null;
    if (hasRole(actor.roles, 'ADMIN') && record.financialDecision) result.financialDecision = { ...record.financialDecision };
  }
  return result;
}

async function callFirst(tx, methods, ...args) {
  const method = methods.find(name => typeof tx?.[name] === 'function');
  return method ? tx[method](...args) : undefined;
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
function transitions(current, target) {
  return (current === 'OPEN' && target === 'UNDER_REVIEW') || (current === 'UNDER_REVIEW' && target === 'RESOLVED')
    || (current === 'RESOLVED' && target === 'CLOSED') || (current === 'RESOLVED' && target === 'UNDER_REVIEW');
}
function runner(repository, actor, resourceId, work) {
  if (typeof repository.runForVisitActor === 'function') return repository.runForVisitActor(actor, resourceId, work);
  if (typeof repository.runForCase === 'function') return repository.runForCase(actor, resourceId, work);
  if (typeof repository.runIncidentTransaction === 'function') return repository.runIncidentTransaction({ actor, resourceId }, work);
  if (typeof repository.runTransaction === 'function') return repository.runTransaction({ actor, resourceId }, work);
  throw new TypeError('Incident repository transaction port is required');
}

export function createIncidentService({ repository, clock = () => new Date() } = {}) {
  if (!repository || !['runForVisitActor', 'runForCase', 'runIncidentTransaction', 'runTransaction'].some(name => typeof repository[name] === 'function')) {
    throw new TypeError('Incident repository transaction port is required');
  }
  if (typeof clock !== 'function') throw new TypeError('clock must be a function');
  async function transaction(actor, resourceId, work) {
    active(actor, clock); identifier(resourceId, 'resourceId');
    try { return await runner(repository, actor, resourceId, work); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'INCIDENT_UNAVAILABLE', 'Incident service is temporarily unavailable'); }
  }
  async function getVisit(tx, visitId) {
    const visit = await callFirst(tx, ['getVisit', 'findVisit'], visitId);
    if (!visit || (idOf(visit.id ?? visit._id) && idOf(visit.id ?? visit._id) !== visitId)) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    return visit;
  }
  function authorizeVisit(actor, visit) {
    const customer = customerIdOf(visit), sitter = sitterIdOf(visit);
    if (operational(actor) || customer === actor.userId || (hasRole(actor.roles, 'PET_SITTER') && sitter === actor.userId)) return;
    fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }
  function authorizeReport(actor, visit) {
    authorizeVisit(actor, visit);
    if (!operational(actor) && !customerIdOf(visit) && !sitterIdOf(visit)) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    if (hasRole(actor.roles, 'PET_SITTER') && !operational(actor) && sitterIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
    if (hasRole(actor.roles, 'CUSTOMER') && !operational(actor) && customerIdOf(visit) !== actor.userId) fail(404, 'RESOURCE_NOT_FOUND', 'Visit not found');
  }
  async function report({ actor, visitId, idempotencyKey: suppliedKey, expectedVersion: suppliedVersion, ...input } = {}) {
    const key = idempotency(suppliedKey); const normalized = normalizeIncident(input, clock);
    const expected = suppliedVersion === undefined ? null : version(suppliedVersion);
    const hash = payloadHash({ visitId, expectedVersion: expected, incident: normalized });
    return transaction(actor, visitId, async tx => {
      const visit = await getVisit(tx, visitId); authorizeReport(actor, visit);
      const identity = { actorRef: actor.userId, resourceRef: visitId, operation: 'INCIDENT_REPORT', key };
      const previous = await existingOperation(tx, identity, hash); if (previous) return previous;
      if (expected !== null && visit.version !== expected) fail(409, 'VERSION_CONFLICT', 'Visit changed; reload before reporting');
      if (visit.state === 'CANCELLED') fail(409, 'VISIT_NOT_ELIGIBLE', 'A cancelled visit cannot receive an incident report');
      const now = new Date(nowValue(clock)).toISOString();
      const record = { id: randomUUID(), kind: 'INCIDENT', visitId, customerId: customerIdOf(visit), sitterId: sitterIdOf(visit),
        involvedActorRefs: [customerIdOf(visit), sitterIdOf(visit), actor.userId].filter(Boolean), ...normalized,
        state: 'OPEN', version: 0, createdAt: now, openedAt: now,
        timeline: [{ type: 'INCIDENT_REPORTED', note: normalized.description, occurredAt: normalized.observedAt || now, actorId: actor.userId, actorRole: actor.roles?.[0] }],
        // Financial impact is a decision gate. Reporting never creates a charge or releases money.
        financialHold: normalized.urgency === 'EMERGENCY' || normalized.severity === 'CRITICAL' ? { state: 'PENDING_REVIEW' } : null
      };
      const saved = await callFirst(tx, ['createIncident', 'createCase', 'saveIncident'], { ...record, actorId: actor.userId, idempotencyKey: key });
      if (!saved) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident was not acknowledged by the server');
      const savedRecord = { ...record, ...saved, state: saved.state ?? record.state, kind: 'INCIDENT', visitId,
        version: Number.isSafeInteger(saved.version) ? saved.version : record.version };
      const result = { incident: safeCase(savedRecord, actor), case: safeCase(savedRecord, actor) };
      if (!result.incident?.id || result.incident.kind !== 'INCIDENT' || result.incident.visitId !== visitId) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident response is invalid');
      await callFirst(tx, ['appendAuditAndOutbox'], { type: 'IncidentReported', actorId: actor.userId, caseId: result.incident.id, visitId, at: now, urgency: normalized.urgency });
      await saveOperation(tx, identity, hash, result);
      return result;
    });
  }
  async function list({ actor, query = {} } = {}) {
    active(actor, clock);
    if (!query || typeof query !== 'object' || Array.isArray(query)) invalid();
    const allowed = new Set(['visitId', 'state', 'severity', 'urgency', 'limit', 'cursor']);
    if (Object.keys(query).some(key => !allowed.has(key))) invalid();
    const visitId = query.visitId === undefined ? null : identifier(query.visitId, 'visitId');
    const wantedState = query.state === undefined ? null : enumValue(query.state, INCIDENT_STATES, 'state', null);
    const severity = query.severity === undefined ? null : enumValue(query.severity, INCIDENT_SEVERITIES, 'severity', null);
    const urgency = query.urgency === undefined ? null : enumValue(query.urgency, INCIDENT_URGENCIES, 'urgency', null);
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('limit');
    if (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(query.cursor))) invalid('cursor');
    const filter = { visitId, state: wantedState, severity, urgency };
    let result;
    try {
      result = await (typeof repository.listIncidents === 'function' ? repository.listIncidents({ actor, filter, limit, cursor: query.cursor ?? null, projection: 'CASE_SAFE_V1' })
        : typeof repository.listCases === 'function' ? repository.listCases({ actor, kind: 'INCIDENT', filter, limit, cursor: query.cursor ?? null, projection: 'CASE_SAFE_V1' })
          : typeof repository.list === 'function' ? repository.list({ actor, kind: 'INCIDENT', filter, limit, cursor: query.cursor ?? null }) : null);
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(503, 'INCIDENT_UNAVAILABLE', 'Incident list is temporarily unavailable'); }
    if (!result) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident list is temporarily unavailable');
    const rows = Array.isArray(result) ? result : result.items;
    if (!Array.isArray(rows) || rows.length > limit) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident list response is invalid');
    const items = rows.map(row => {
      const item = safeCase({ ...row, kind: 'INCIDENT' }, actor);
      if (!item || item.kind !== 'INCIDENT' || !item.id || !item.visitId || !item.state || (wantedState && item.state !== wantedState)
        || (severity && item.severity !== severity) || (urgency && item.urgency !== urgency)) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident list response is invalid');
      return item;
    });
    const nextCursor = result.nextCursor ?? null;
    if (nextCursor !== null && (typeof nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(nextCursor))) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident cursor is invalid');
    return { items, nextCursor };
  }
  async function detail({ actor, caseId, incidentId } = {}) {
    const id = identifier(caseId ?? incidentId, 'caseId');
    return transaction(actor, id, async tx => {
      const record = await callFirst(tx, ['getCase', 'getIncident', 'findCase', 'findIncident'], id);
      if (!record || (safeId(record.id ?? record._id) && safeId(record.id ?? record._id) !== id) || record.kind !== 'INCIDENT') fail(404, 'RESOURCE_NOT_FOUND', 'Incident not found');
      const visitId = visitIdOf(record); if (!visitId) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident visit is unavailable');
      const visit = await getVisit(tx, visitId); authorizeVisit(actor, visit);
      const view = safeCase(record, actor); if (!view) fail(503, 'INCIDENT_UNAVAILABLE', 'Incident response is invalid');
      return view;
    });
  }
  async function resolve({ actor, caseId, incidentId, expectedVersion: suppliedVersion, idempotencyKey: suppliedKey, ...input } = {}) {
    active(actor, clock); if (!operational(actor)) fail(403, 'FORBIDDEN', 'Operational access required');
    const id = identifier(caseId ?? incidentId, 'caseId'); const expected = version(suppliedVersion); const key = idempotency(suppliedKey);
    const resolution = normalizeResolution(input, actor, clock);
    if (resolution.customerContacted !== true && typeof resolution.customerContacted !== 'boolean') invalid('customerContacted');
    if (resolution.veterinaryContacted !== true && typeof resolution.veterinaryContacted !== 'boolean') invalid('veterinaryContacted');
    if (resolution.financialDecision && !hasRole(actor.roles, 'ADMIN')) fail(403, 'FORBIDDEN', 'Admin approval is required for financial decisions');
    const hash = payloadHash({ caseId: id, expectedVersion: expected, resolution });
    return transaction(actor, id, async tx => {
      const current = await callFirst(tx, ['getCase', 'getIncident', 'findCase', 'findIncident'], id);
      if (!current || current.kind !== 'INCIDENT') fail(404, 'RESOURCE_NOT_FOUND', 'Incident not found');
      const visitId = visitIdOf(current); const visit = await getVisit(tx, visitId); authorizeVisit(actor, visit);
      const identity = { actorRef: actor.userId, resourceRef: id, operation: 'INCIDENT_RESOLUTION', key };
      const previous = await existingOperation(tx, identity, hash); if (previous) return previous;
      if (current.version !== expected) fail(409, 'VERSION_CONFLICT', 'Incident changed; reload before resolving');
      if (!transitions(current.state, resolution.targetState)) fail(409, 'INVALID_STATE', 'Incident cannot make that transition');
      if (resolution.targetState === 'CLOSED' && !hasRole(actor.roles, 'ADMIN')) fail(403, 'FORBIDDEN', 'Admin final decision is required to close an incident');
      const now = resolution.recordedAt;
      const final = hasRole(actor.roles, 'ADMIN') && resolution.targetState === 'CLOSED';
      const record = { ...resolution, state: resolution.targetState, final, actorId: actor.userId,
        version: expected + 1, resolvedAt: resolution.targetState === 'RESOLVED' ? now : current.resolvedAt,
        closedAt: resolution.targetState === 'CLOSED' ? now : current.closedAt };
      const saved = await callFirst(tx, ['resolveIncident', 'updateCase', 'saveIncidentResolution'], { caseId: id, incident: current, resolution: record,
        expectedVersion: expected, actorId: actor.userId, idempotencyKey: key });
      if (!saved || saved.version !== expected + 1 || !state(saved.state || record.state)) fail(503, 'INCIDENT_UNAVAILABLE', 'Resolution was not acknowledged by the server');
      const result = safeCase({ ...current, ...saved, id, kind: 'INCIDENT', visitId, version: saved.version, state: saved.state, resolution: { ...record, ...(saved.resolution || {}) } }, actor);
      if (!result) fail(503, 'INCIDENT_UNAVAILABLE', 'Resolution response is invalid');
      await callFirst(tx, ['appendAuditAndOutbox'], { type: 'IncidentResolved', actorId: actor.userId, caseId: id, visitId, state: result.state, at: now, final });
      await saveOperation(tx, identity, hash, result);
      return result;
    });
  }
  return Object.freeze({ report, create: report, list, listIncidents: list, detail, get: detail, resolve, resolveIncident: resolve });
}

export { normalizeIncident, safeCase };
