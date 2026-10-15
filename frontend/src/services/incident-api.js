import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const STATES = new Set(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']);
const SEVERITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const URGENCIES = new Set(['ROUTINE', 'URGENT', 'EMERGENCY']);
const CATEGORIES = new Set(['SAFETY', 'HEALTH_OBSERVATION', 'MISSING_PET', 'ACCESS', 'PROPERTY', 'BEHAVIOUR', 'OTHER']);
function id(value, field = 'id') { if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 400); return value; }
function key(factory) { const value = factory(); if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); return value; }
function version(value) { if (!Number.isSafeInteger(value) || value < 0) throw new ApiError('INVALID_EXPECTED_VERSION', 400); return value; }
function text(value, field, optional = false) { if (value === undefined && optional) return; if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422); return value.trim(); }
function view(result, expectedId) {
  if (result?.pending) return result;
  const data = result?.data;
  if (!data || (expectedId && data.id !== expectedId) || !STATES.has(data.state) || data.kind !== 'INCIDENT') throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return result;
}
function listView(result) {
  if (result?.pending) return result;
  if (!result?.data || !Array.isArray(result.data.items) || (result.data.nextCursor !== null && typeof result.data.nextCursor !== 'string')) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return result;
}
function defaultKey() { if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID(); throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); }

export function createIncidentApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs, createIdempotencyKey = defaultKey } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const api = {
    async report(input = {}) {
      const visitId = id(input.visitId, 'visitId');
      if (input.expectedVersion !== undefined) version(input.expectedVersion);
      if (input.severity !== undefined && !SEVERITIES.has(input.severity)) throw new ApiError('INVALID_SEVERITY', 422);
      if (input.urgency !== undefined && !URGENCIES.has(input.urgency)) throw new ApiError('INVALID_URGENCY', 422);
      if (input.category !== undefined && !CATEGORIES.has(input.category)) throw new ApiError('INVALID_CATEGORY', 422);
      text(input.description ?? input.summary ?? input.details, 'description');
      const body = { visitId, description: input.description ?? input.summary ?? input.details };
      for (const field of ['expectedVersion', 'severity', 'urgency', 'category', 'type', 'observedAt', 'immediateAction', 'contactPreference', 'evidenceRefs', 'photoRefs', 'timeline', 'petId']) {
        if (input[field] !== undefined) body[field] = input[field];
      }
      const result = await send('/incidents', { method: 'POST', body, idempotencyKey: key(createIdempotencyKey) });
      if (result?.pending) return result;
      const incident = result?.data?.incident || result?.data?.case;
      if (!incident || incident.kind !== 'INCIDENT' || incident.visitId !== visitId || !STATES.has(incident.state)) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
      return result;
    },
    async list(input = {}) {
      const params = new globalThis.URLSearchParams();
      for (const field of ['visitId', 'state', 'severity', 'urgency', 'limit', 'cursor']) {
        if (input[field] !== undefined && input[field] !== null && input[field] !== '') params.set(field, String(input[field]));
      }
      if (input.visitId !== undefined) id(input.visitId, 'visitId');
      if (input.state !== undefined && !STATES.has(input.state)) throw new ApiError('INVALID_STATE', 422);
      if (input.severity !== undefined && !SEVERITIES.has(input.severity)) throw new ApiError('INVALID_SEVERITY', 422);
      if (input.urgency !== undefined && !URGENCIES.has(input.urgency)) throw new ApiError('INVALID_URGENCY', 422);
      const result = await send(`/incidents${params.toString() ? `?${params}` : ''}`, { signal: input.signal });
      return listView(result);
    },
    async get(caseIdOrOptions, options = {}) {
      const input = typeof caseIdOrOptions === 'object' && caseIdOrOptions !== null ? caseIdOrOptions : { ...options, caseId: caseIdOrOptions };
      const caseId = id(input.caseId ?? input.incidentId, 'caseId');
      return view(await send(`/cases/${caseId}`, { signal: input.signal }), caseId);
    },
    async resolve(caseIdOrOptions, options = {}) {
      const input = typeof caseIdOrOptions === 'object' && caseIdOrOptions !== null ? caseIdOrOptions : { ...options, caseId: caseIdOrOptions };
      const caseId = id(input.caseId ?? input.incidentId, 'caseId'); version(input.expectedVersion);
      text(input.summary ?? input.resolution, 'summary');
      const body = { summary: input.summary ?? input.resolution, targetState: input.targetState ?? input.state ?? 'RESOLVED' };
      for (const field of ['actionsTaken', 'customerContacted', 'veterinaryContacted', 'followUp', 'staffNotes', 'financialDecision']) {
        if (input[field] !== undefined) body[field] = input[field];
      }
      const result = await send(`/cases/${caseId}/resolutions`, { method: 'POST', body, expectedVersion: input.expectedVersion, idempotencyKey: key(createIdempotencyKey) });
      return view(result, caseId);
    }
  };
  api.create = api.report;
  api.getIncident = api.get;
  api.listIncidents = api.list;
  api.resolveIncident = api.resolve;
  return Object.freeze(api);
}

export const incidentApi = createIncidentApi();
