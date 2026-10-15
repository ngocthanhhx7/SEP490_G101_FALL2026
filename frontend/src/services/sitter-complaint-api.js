import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const STATES = new Set(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED']);
const CATEGORIES = new Set(['SERVICE_QUALITY', 'PET_SAFETY', 'SITTER_CONDUCT', 'ACCESS', 'BILLING', 'OTHER']);

function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422);
  return value;
}

function safeItem(item) {
  if (!item || item.kind !== 'COMPLAINT' || !ID.test(item.id || '') || !ID.test(item.visitId || '') || !STATES.has(item.state)
    || (item.category !== undefined && !CATEGORIES.has(item.category))
    || Object.hasOwn(item, 'staffNotes') || Object.hasOwn(item, 'financialHold')
    || Object.hasOwn(item, 'settlement') || Object.hasOwn(item, 'objection')) throw new ApiError('INVALID_RESPONSE');
  if (item.evidenceRefs?.some(ref => ref?.readUrl || ref?.url)) throw new ApiError('PRIVATE_MEDIA_LEAK');
  return item;
}

function listView(result) {
  if (result?.pending) return result;
  if (!result?.data || !Array.isArray(result.data.items)) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  result.data.items.forEach(safeItem);
  return result;
}

function detailView(result, complaintId) {
  if (result?.pending) return result;
  const item = result?.data?.complaint ?? result?.data;
  safeItem(item);
  if (item.id !== complaintId) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return { ...result, data: result.data?.complaint ? result.data : item };
}

export function createSitterComplaintApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const api = {
    async list(input = {}) {
      if (input.visitId !== undefined) id(input.visitId, 'visitId');
      if (input.state !== undefined && !STATES.has(input.state)) throw new ApiError('INVALID_STATE', 422);
      if (input.category !== undefined && !CATEGORIES.has(input.category)) throw new ApiError('INVALID_CATEGORY', 422);
      const params = new globalThis.URLSearchParams();
      for (const field of ['visitId', 'state', 'category', 'limit', 'cursor']) if (input[field] !== undefined && input[field] !== '') params.set(field, String(input[field]));
      return listView(await send(`/complaints${params.toString() ? `?${params}` : ''}`, { signal: input.signal }));
    },
    async get(input = {}) {
      const complaintId = id(typeof input === 'string' ? input : input.complaintId, 'complaintId');
      return detailView(await send(`/complaints/${complaintId}`, { signal: typeof input === 'object' ? input.signal : undefined }), complaintId);
    }
  };
  api.detail = api.get;
  return Object.freeze(api);
}

export const sitterComplaintApi = createSitterComplaintApi();
