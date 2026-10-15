import { ApiError, createApiClient } from './api-client.js';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const STATES = new Set(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED']);

function invalid(status) { return new ApiError('INVALID_RESPONSE', status); }
function requireId(value, field = 'resource') {
  if (typeof value !== 'string' || !ID.test(value)) throw new ApiError('VALIDATION_FAILED', 422);
  return value;
}
function requireVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError('VALIDATION_FAILED', 422);
  return value;
}
function requireKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new ApiError('VALIDATION_FAILED', 422);
  return value;
}
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function hasOnlyKeys(value, allowed) { return value && Object.keys(value).every(key => allowed.includes(key)); }
function validPet(pet) { return pet && hasOnlyKeys(pet, ['id', 'name', 'species']) && typeof pet.id === 'string' && typeof pet.name === 'string' && typeof pet.species === 'string'; }
function validOffer(item) {
  return item && hasOnlyKeys(item, ['id', 'visitId', 'sitterId', 'state', 'version', 'offeredAt', 'deadline', 'startAt', 'endAt', 'serviceName', 'areaCode', 'pets', 'canRespond'])
    && typeof item.id === 'string' && typeof item.visitId === 'string' && typeof item.sitterId === 'string'
    && STATES.has(item.state) && Number.isSafeInteger(item.version) && item.version >= 0
    && validTime(item.offeredAt) && validTime(item.deadline) && validTime(item.startAt) && validTime(item.endAt)
    && typeof item.serviceName === 'string' && typeof item.areaCode === 'string' && Array.isArray(item.pets)
    && item.pets.length <= 10 && item.pets.every(validPet) && typeof item.canRespond === 'boolean';
}
function validAssignment(item) {
  return item && hasOnlyKeys(item, ['id', 'visitId', 'state', 'version', 'startAt', 'endAt', 'serviceName', 'areaCode', 'pets', 'handoverRequired', 'handoverAccepted'])
    && typeof item.id === 'string' && typeof item.visitId === 'string'
    && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'].includes(item.state)
    && Number.isSafeInteger(item.version) && item.version >= 0 && validTime(item.startAt) && validTime(item.endAt)
    && typeof item.serviceName === 'string' && typeof item.areaCode === 'string' && Array.isArray(item.pets)
    && item.pets.length <= 10 && item.pets.every(validPet);
}
function checkPage(response, validator) {
  if (response?.pending) return response;
  if (!Array.isArray(response?.data?.items) || response.data.items.length > (response.data.limit ?? 50)
    || response.data.items.some(item => !validator(item))
    || !(response.data.nextCursor === null || typeof response.data.nextCursor === 'string')) throw invalid(response?.status);
  return response;
}

export function createSitterOperationsApi({ request } = {}) {
  const apiRequest = request ?? (typeof globalThis.fetch === 'function'
    ? createApiClient({ fetchImpl: globalThis.fetch.bind(globalThis) })
    : async () => { throw new ApiError('NETWORK_ERROR'); });
  if (typeof apiRequest !== 'function') throw new TypeError('An API request function is required');
  const page = query => {
    const params = new window.URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    return params.toString() ? `?${params}` : '';
  };
  const responseData = async (promise, validator) => {
    const response = await promise;
    if (response?.pending) return response;
    if (!validator(response?.data)) throw invalid(response?.status);
    return response;
  };
  return Object.freeze({
    async listOffers(query = {}, options = {}) {
      return checkPage(await apiRequest(`/offers${page(query)}`, options), validOffer);
    },
    async getOffer(offerId, options = {}) {
      const id = requireId(offerId, 'offerId');
      return responseData(apiRequest(`/offers/${id}`, options), value => validOffer(value));
    },
    acceptOffer(offerId, expectedVersion, idempotencyKey) {
      const id = requireId(offerId, 'offerId');
      return apiRequest(`/offers/${id}/acceptances`, { method: 'POST', body: { expectedVersion: requireVersion(expectedVersion) }, idempotencyKey: requireKey(idempotencyKey) });
    },
    declineOffer(offerId, expectedVersion, idempotencyKey) {
      const id = requireId(offerId, 'offerId');
      return apiRequest(`/offers/${id}/declines`, { method: 'POST', body: { expectedVersion: requireVersion(expectedVersion) }, idempotencyKey: requireKey(idempotencyKey) });
    },
    async listAssignments(query = {}, options = {}) {
      return checkPage(await apiRequest(`/assignments${page(query)}`, options), validAssignment);
    },
    async getVisit(visitId, options = {}) {
      const id = requireId(visitId, 'visitId');
      return responseData(apiRequest(`/visits/${id}`, options), value => value && hasOnlyKeys(value, ['visitId', 'version', 'state', 'startAt', 'endAt', 'serviceName', 'areaCode', 'pets', 'handoverRequired', 'handoverAccepted', 'canCheckIn', 'canCheckOut']) && value.visitId === id
        && ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'].includes(value.state)
        && Number.isSafeInteger(value.version) && value.version >= 0 && validTime(value.startAt) && validTime(value.endAt)
        && typeof value.serviceName === 'string' && typeof value.areaCode === 'string' && Array.isArray(value.pets)
        && value.pets.length <= 10 && value.pets.every(validPet) && typeof value.handoverRequired === 'boolean'
        && typeof value.handoverAccepted === 'boolean' && typeof value.canCheckIn === 'boolean' && typeof value.canCheckOut === 'boolean');
    },
    async getAccessNotes(visitId, options = {}) {
      const id = requireId(visitId, 'visitId');
      return responseData(apiRequest(`/visits/${id}/access-notes`, options), value => value && hasOnlyKeys(value, ['visitId', 'privateAccessNotes']) && value.visitId === id
        && typeof value.privateAccessNotes === 'string');
    },
    withdrawVisit(visitId, command, idempotencyKey) {
      const id = requireId(visitId, 'visitId');
      if (!command || !Number.isSafeInteger(command.expectedVersion) || typeof command.reason !== 'string' || !command.reason.trim()) throw new ApiError('VALIDATION_FAILED', 422);
      return apiRequest(`/visits/${id}/withdrawals`, { method: 'POST', body: { expectedVersion: command.expectedVersion, reason: command.reason }, idempotencyKey: requireKey(idempotencyKey) });
    },
    reassignVisit(visitId, command, idempotencyKey) {
      const id = requireId(visitId, 'visitId');
      if (!command || !Number.isSafeInteger(command.expectedVersion) || typeof command.newSitterId !== 'string'
        || typeof command.reason !== 'string' || !command.reason.trim()) throw new ApiError('VALIDATION_FAILED', 422);
      return apiRequest(`/visits/${id}/reassignments`, { method: 'POST', body: { expectedVersion: command.expectedVersion,
        newSitterId: requireId(command.newSitterId, 'sitterId'), reason: command.reason }, idempotencyKey: requireKey(idempotencyKey) });
    }
  });
}

export const sitterOperationsApi = createSitterOperationsApi();
