import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const STATES = new Set(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED', 'ESCALATED']);
const CATEGORIES = new Set(['SERVICE_QUALITY', 'PET_SAFETY', 'SITTER_CONDUCT', 'ACCESS', 'BILLING', 'OTHER']);
const KEY = /^[A-Za-z0-9_-]{8,128}$/;

function id(value, field) { if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422); return value; }
function version(value) { if (!Number.isSafeInteger(value) || value < 0) throw new ApiError('INVALID_EXPECTED_VERSION', 422); return value; }
function key(factory) { const value = factory(); if (typeof value !== 'string' || !KEY.test(value)) throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); return value; }
function text(value, field, optional = false, max = 4000) { if (value === undefined && optional) return; if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422); return value.trim(); }
function category(value) { if (value !== undefined && !CATEGORIES.has(value)) throw new ApiError('INVALID_CATEGORY', 422); }
function state(value) { if (value !== undefined && !STATES.has(value)) throw new ApiError('INVALID_STATE', 422); }
function complaintView(result, complaintId) {
  if (result?.pending) return result;
  const data = result?.data?.complaint ?? result?.data;
  if (!data || (complaintId && data.id !== complaintId) || data.kind !== 'COMPLAINT' || !STATES.has(data.state)) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  if (data.evidenceRefs?.some(item => item.readUrl || item.url)) throw new ApiError('PRIVATE_MEDIA_LEAK', result?.status || 0);
  return result;
}
function defaultKey() { if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID(); throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); }

export function createComplaintApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs, createIdempotencyKey = defaultKey } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const command = async (path, input, fields, expectedRequired = false) => {
    if (expectedRequired) version(input.expectedVersion); else if (input.expectedVersion !== undefined) version(input.expectedVersion);
    const body = {};
    fields.forEach(field => { if (input[field] !== undefined) body[field] = input[field]; });
    return send(path, { method: 'POST', body, idempotencyKey: key(input.idempotencyKey ? () => input.idempotencyKey : createIdempotencyKey) });
  };
  const api = {
    async submit(input = {}) {
      if (input.scope !== undefined) {
        if (!['VISIT', 'BOOKING'].includes(input.scope)) throw new ApiError('INVALID_SCOPE', 422);
        id(input.bookingId, 'bookingId');
        if (input.scope === 'VISIT') id(input.visitId, 'visitId');
        const description = text(input.description, 'description', false, 1000);
        const result = await command('/complaints', { ...input, description }, [
          'scope', 'bookingId', ...(input.scope === 'VISIT' ? ['visitId'] : []), 'expectedVersion', 'description', 'evidenceRefs'
        ]);
        return complaintView(result, result?.data?.complaint?.id);
      }
      const visitId = id(input.visitId, 'visitId'); category(input.category);
      text(input.summary, 'summary', false, 500); text(input.description ?? input.details ?? input.message, 'description');
      const result = await command(`/complaints/visits/${visitId}`, input,
        ['expectedVersion', 'category', 'summary', 'subject', 'description', 'details', 'message', 'evidenceRefs', 'photoRefs', 'requestedOutcome']);
      if (result?.pending) return result;
      return complaintView(result, result?.data?.complaint?.id);
    },
    async eligibility({ bookingId, signal } = {}) {
      const result = await send('/complaints/eligibility/bookings/' + id(bookingId, 'bookingId'), { signal });
      if (!result?.pending && (result?.data?.booking?.id !== bookingId ||
        !Array.isArray(result.data.visits) || typeof result.data.wholeBooking?.eligible !== 'boolean')) {
        throw new ApiError('INVALID_RESPONSE', result?.status || 0);
      }
      return result;
    },
    async list(input = {}) {
      state(input.state); category(input.category); if (input.visitId) id(input.visitId, 'visitId');
      const params = new globalThis.URLSearchParams();
      for (const field of ['visitId', 'state', 'category', 'limit', 'cursor', 'q', 'sort']) if (input[field] !== undefined && input[field] !== '') params.set(field, String(input[field]));
      const result = await send(`/complaints${params.toString() ? `?${params}` : ''}`, { signal: input.signal });
      if (result?.pending) return result;
      if (!result?.data || !Array.isArray(result.data.items) || result.data.items.some(item => item.kind !== 'COMPLAINT' || !STATES.has(item.state))) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
      return result;
    },
    async get(input = {}) {
      const complaintId = id(typeof input === 'string' ? input : input.complaintId, 'complaintId');
      return complaintView(await send(`/complaints/${complaintId}`, { signal: typeof input === 'object' ? input.signal : undefined }), complaintId);
    },
    async review(input = {}) { const complaintId = id(input.complaintId, 'complaintId'); text(input.summary ?? input.resolution, 'summary'); return complaintView(await command(`/complaints/${complaintId}/review`, input, ['expectedVersion', 'summary', 'resolution', 'actionsTaken', 'followUp', 'staffNotes', 'financialHold'], true), complaintId); },
    async resolve(input = {}) {
      const complaintId = id(input.complaintId, 'complaintId');
      if (input.customerResult !== undefined) {
        text(input.customerResult, 'customerResult');
        text(input.handlingNotes, 'handlingNotes', false, 8000);
      } else text(input.summary ?? input.resolution, 'summary');
      const result = await command(`/complaints/${complaintId}/resolution`, input, [
        'expectedVersion', 'handlingNotes', 'customerResult', 'proposal',
        'summary', 'resolution', 'actionsTaken', 'followUp', 'staffNotes', 'financialHold'
      ], true);
      return complaintView(result, complaintId);
    },
    async disagree(input = {}) { const complaintId = id(input.complaintId, 'complaintId'); text(input.reason ?? input.message, 'reason'); return complaintView(await command(`/complaints/${complaintId}/objections`, input, ['expectedVersion', 'reason', 'message', 'evidenceRefs'], true), complaintId); },
    async decide(input = {}) {
      const complaintId = id(input.complaintId, 'complaintId');
      if (input.customerResult !== undefined) text(input.customerResult, 'customerResult');
      else text(input.summary ?? input.decision, 'summary');
      const result = await command(`/complaints/${complaintId}/decision`, input, [
        'expectedVersion', 'customerResult', 'amountVnd', 'summary', 'decision', 'actionsTaken', 'financialHold', 'financialDecision'
      ], true);
      return complaintView(result, complaintId);
    }
  };
  api.create = api.submit; api.createComplaint = api.submit; api.object = api.disagree; api.finalize = api.decide;
  return Object.freeze(api);
}

export const complaintApi = createComplaintApi();
