import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const RATINGS = new Set([1, 2, 3, 4, 5]);
const KEY = /^[A-Za-z0-9_-]{8,128}$/;

function id(value, field) { if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422); return value; }
function version(value) { if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ApiError('INVALID_EXPECTED_VERSION', 422); }
function key(factory) { const value = factory(); if (typeof value !== 'string' || !KEY.test(value)) throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); return value; }
function defaultKey() { if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID(); throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE'); }
function view(result, visitId) {
  if (result?.pending) return result;
  const data = result?.data?.review ?? result?.data;
  if (!data || data.visitId !== visitId || data.direction !== 'SITTER_TO_CUSTOMER' || !RATINGS.has(data.rating)
    || !['SUBMITTED', 'PUBLISHED', 'WITHHELD'].includes(data.state)) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return { ...result, data: result.data?.review ? result.data : data };
}

export function createSitterReviewApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs, createIdempotencyKey = defaultKey } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const api = {
    async rateCustomer(input = {}) {
      const visitId = id(input.visitId, 'visitId'); version(input.expectedVersion);
      if (!Number.isSafeInteger(input.rating) || !RATINGS.has(input.rating)) throw new ApiError('INVALID_RATING', 422);
      if (input.comment !== undefined && (typeof input.comment !== 'string' || input.comment.length > 2000)) throw new ApiError('INVALID_COMMENT', 422);
      const body = { rating: input.rating };
      for (const field of ['expectedVersion', 'comment', 'feedback', 'tags']) if (input[field] !== undefined) body[field] = input[field];
      return view(await send(`/reviews/sitter/visits/${visitId}`, { method: 'POST', body, idempotencyKey: key(createIdempotencyKey) }), visitId);
    }
  };
  api.rate = api.rateCustomer; api.create = api.rateCustomer;
  return Object.freeze(api);
}

export const sitterReviewApi = createSitterReviewApi();
