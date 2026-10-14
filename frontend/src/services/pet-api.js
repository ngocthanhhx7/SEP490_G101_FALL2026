import { ApiError, createApiClient } from './api-client.js';

const PET_ID_PATTERN = /^[a-f\d]{24}$/i;
const PET_SPECIES = new Set(['DOG', 'CAT']);
const PET_STATES = new Set(['ACTIVE', 'ARCHIVED']);
const DEFAULT_PAGE_SIZE = 20;

function invalidResponse(status) {
  return new ApiError('INVALID_RESPONSE', status);
}

function isPetView(value) {
  return Boolean(value && typeof value === 'object'
    && typeof value.id === 'string' && PET_ID_PATTERN.test(value.id)
    && typeof value.name === 'string' && value.name.trim()
    && PET_SPECIES.has(value.species)
    && PET_STATES.has(value.state)
    && Number.isSafeInteger(value.version) && value.version >= 0);
}

function readPetPage(data, meta, status) {
  const isArrayResponse = Array.isArray(data);
  const items = isArrayResponse ? data : data?.items;
  const nextCursor = isArrayResponse ? meta?.nextCursor ?? null : data?.nextCursor ?? meta?.nextCursor ?? null;
  if (!Array.isArray(items) || !items.every(isPetView)
    || (nextCursor !== null && (typeof nextCursor !== 'string' || nextCursor.length === 0))
    || (items.length === 0 && nextCursor !== null)) {
    throw invalidResponse(status);
  }
  return { items, nextCursor };
}

function requireIdempotencyKey(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  }
}

export function createPetOperationKey() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new ApiError('IDEMPOTENCY_KEY_UNAVAILABLE');
  }
  return globalThis.crypto.randomUUID();
}

export function createPetApi({ request } = {}) {
  const apiRequest = request || ((...args) => createApiClient()(...args));
  if (typeof apiRequest !== 'function') throw new TypeError('An API request function is required');

  return Object.freeze({
    async listPets({ signal, cursor } = {}) {
      const cursorQuery = cursor === undefined || cursor === null ? ''
        : `&cursor=${encodeURIComponent(cursor).replace(/%2F/gi, '/')}`;
      const result = await apiRequest(`/pets?limit=${DEFAULT_PAGE_SIZE}${cursorQuery}`, { signal });
      if (result.pending) return { ...result, data: [], meta: { ...result.meta, nextCursor: null } };
      const page = readPetPage(result.data, result.meta, result.status);
      return { ...result, data: page.items, meta: { ...result.meta, nextCursor: page.nextCursor } };
    },

    async createPet({ name, species, idempotencyKey } = {}) {
      requireIdempotencyKey(idempotencyKey);
      const result = await apiRequest('/pets', {
        method: 'POST', body: { name, species }, idempotencyKey,
      });
      if (!result.pending && result.status !== 204 && !isPetView(result.data)) {
        throw invalidResponse(result.status);
      }
      return result;
    },

    async archivePet({ petId, expectedVersion, idempotencyKey } = {}) {
      if (typeof petId !== 'string' || !PET_ID_PATTERN.test(petId)) {
        throw new ApiError('INVALID_RESOURCE_ID');
      }
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        throw new ApiError('EXPECTED_VERSION_REQUIRED');
      }
      requireIdempotencyKey(idempotencyKey);
      return apiRequest(`/pets/${petId}/archives`, {
        method: 'POST', body: {}, expectedVersion, idempotencyKey,
      });
    },
  });
}

export const petApi = createPetApi();
