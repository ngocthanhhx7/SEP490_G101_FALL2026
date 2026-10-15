import { ApiError, createApiClient } from './api-client.js';

export const CARE_VISIT_ID_PATTERN = /^[a-f\d]{24}$/i;

function requireVisitId(value) {
  if (typeof value !== 'string' || !CARE_VISIT_ID_PATTERN.test(value)) throw new ApiError('INVALID_RESOURCE_ID', 400);
  return value;
}

function requireVersion(value, field = 'expectedVersion') {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(`INVALID_${field.toUpperCase()}`, 400);
  return value;
}

function pending(result) { return result?.pending ? result : null; }

function careView(result, visitId) {
  if (pending(result)) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.visitId !== visitId
    || !Number.isSafeInteger(value.version) || value.version < 0 || !value.instructions || typeof value.instructions !== 'object') {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return result;
}

function acknowledgement(result, visitId) {
  if (pending(result)) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.visitId !== visitId
    || value.acknowledged !== true || !Number.isSafeInteger(value.version) || value.version < 0) {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return result;
}

function handover(result, visitId) {
  if (pending(result)) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.visitId !== visitId
    || !['REQUIRED', 'PENDING', 'CONFIRMED', 'REVOKED'].includes(value.state)) {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return result;
}

function accessNotes(result, visitId) {
  if (pending(result)) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.visitId !== visitId
    || !Object.hasOwn(value, 'privateAccessNotes')) throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  return result;
}

function defaultKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE');
}

export function createCareInstructionsApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs,
  createIdempotencyKey = defaultKey } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };
  const api = {
    async getInstructions(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      return careView(await send(`/visits/${id}/care-instructions`, { signal: input.signal }), id);
    },

    async updateInstructions(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      const version = requireVersion(input.expectedVersion);
      if (!input.instructions || typeof input.instructions !== 'object' || Array.isArray(input.instructions)) {
        throw new ApiError('INVALID_CARE_INSTRUCTIONS', 422);
      }
      const body = { instructions: input.instructions };
      if (input.reason !== undefined) body.reason = input.reason;
      const result = await send(`/visits/${id}/care-instructions`, {
        method: 'PATCH', body, expectedVersion: version, idempotencyKey: createIdempotencyKey()
      });
      return careView(result, id);
    },

    async acknowledgeInstructions(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      const instructionVersion = requireVersion(input.instructionVersion ?? input.expectedVersion, 'instructionVersion');
      const result = await send(`/visits/${id}/care-instructions/acknowledgements`, {
        method: 'POST', body: { instructionVersion }, idempotencyKey: createIdempotencyKey()
      });
      return acknowledgement(result, id);
    },

    async getAccessNotes(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      return accessNotes(await send(`/visits/${id}/access-notes`, { signal: input.signal }), id);
    },

    async getHandover(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      return handover(await send(`/visits/${id}/handovers`, { signal: input.signal }), id);
    },

    async confirmHandover(visitIdOrOptions, options = {}) {
      const input = typeof visitIdOrOptions === 'object' && visitIdOrOptions !== null
        ? visitIdOrOptions : { ...options, visitId: visitIdOrOptions };
      const id = requireVisitId(input.visitId ?? input.id);
      const expected = requireVersion(input.expectedVersion);
      const instructionVersion = requireVersion(input.instructionVersion, 'instructionVersion');
      if (typeof input.replacementSitterId !== 'string' || !CARE_VISIT_ID_PATTERN.test(input.replacementSitterId)) {
        throw new ApiError('INVALID_REPLACEMENT_ID', 400);
      }
      const body = { replacementSitterId: input.replacementSitterId, instructionVersion };
      if (input.message !== undefined) body.message = input.message;
      const result = await send(`/visits/${id}/handovers`, {
        method: 'POST', body, expectedVersion: expected, idempotencyKey: createIdempotencyKey()
      });
      return handover(result, id);
    },
  };
  api.get = api.getInstructions;
  api.update = api.updateInstructions;
  api.acknowledge = api.acknowledgeInstructions;
  return Object.freeze(api);
}

export const careInstructionsApi = createCareInstructionsApi();
