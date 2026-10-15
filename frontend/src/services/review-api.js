import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const RATINGS = new Set([1, 2, 3, 4, 5]);
const keyPattern = /^[A-Za-z0-9_-]{8,128}$/;

function requireId(value, field = 'id') {
  if (typeof value !== 'string' || !ID.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 422);
  return value;
}

function requireKey(factory) {
  const value = factory();
  if (typeof value !== 'string' || !keyPattern.test(value)) throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE');
  return value;
}

function requireRating(value) {
  if (!Number.isSafeInteger(value) || !RATINGS.has(value)) throw new ApiError('INVALID_RATING', 422);
  return value;
}

function requireVersion(value) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new ApiError('INVALID_EXPECTED_VERSION', 422);
}

function reviewView(result, visitId) {
  if (result?.pending) return result;
  const data = result?.data?.review ?? result?.data;
  if (!data || data.visitId !== visitId || !RATINGS.has(data.rating)
    || !['SUBMITTED', 'PUBLISHED', 'WITHHELD'].includes(data.state)) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return { ...result, data: result.data?.review ? result.data : data };
}

function defaultKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE');
}

export function createReviewApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs, createIdempotencyKey = defaultKey } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const api = {
    async rateVisit(input = {}) {
      const visitId = requireId(input.visitId, 'visitId');
      requireRating(input.rating); requireVersion(input.expectedVersion);
      if (input.comment !== undefined && (typeof input.comment !== 'string' || input.comment.length > 2000)) throw new ApiError('INVALID_COMMENT', 422);
      const body = { rating: input.rating };
      for (const field of ['expectedVersion', 'comment', 'feedback', 'tags']) if (input[field] !== undefined) body[field] = input[field];
      const result = await send(`/reviews/visits/${visitId}`, { method: 'POST', body, expectedVersion: undefined,
        idempotencyKey: requireKey(createIdempotencyKey) });
      return reviewView(result, visitId);
    },
    async get(input = {}) {
      const reviewId = requireId(typeof input === 'string' ? input : input.reviewId, 'reviewId');
      return send(`/reviews/${reviewId}`, { signal: typeof input === 'object' ? input.signal : undefined });
    }
  };
  api.rate = api.rateVisit; api.create = api.rateVisit; api.getReview = api.get;
  return Object.freeze(api);
}

export const reviewApi = createReviewApi();
