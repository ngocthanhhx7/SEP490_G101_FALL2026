import { ApiError, createApiClient } from '../../services/api-client.js';

const PET_SPECIES = new Set(['DOG', 'CAT']);

function requestCatalog(path, options) {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== 'function') return Promise.reject(new ApiError('NETWORK_ERROR'));
  return createApiClient({ fetchImpl: fetchImpl.bind(globalThis) })(path, options);
}
function invalidResponse() {
  throw new ApiError('INVALID_RESPONSE', 200);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeService(service) {
  if (!service || typeof service !== 'object' || Array.isArray(service)
    || !nonEmptyString(service.id) || !nonEmptyString(service.name)
    || typeof service.description !== 'string' || typeof service.scope !== 'string'
    || !Array.isArray(service.species) || service.species.length === 0
    || service.species.some((species) => !PET_SPECIES.has(species))
    || new Set(service.species).size !== service.species.length) invalidResponse();

  const price = service.price;
  if (!price || !Number.isSafeInteger(price.amountVnd) || price.amountVnd < 0
    || price.currency !== 'VND' || !nonEmptyString(price.unitLabel)) invalidResponse();

  const policy = service.policy;
  if (!policy || !Number.isSafeInteger(policy.version) || policy.version < 1
    || !nonEmptyString(policy.title) || typeof policy.body !== 'string'
    || !nonEmptyString(policy.effectiveAt) || !Number.isFinite(Date.parse(policy.effectiveAt))) {
    invalidResponse();
  }

  return Object.freeze({
    id: service.id,
    name: service.name.trim(),
    description: service.description.trim(),
    scope: service.scope.trim(),
    species: Object.freeze([...service.species]),
    price: Object.freeze({
      amountVnd: price.amountVnd,
      currency: 'VND',
      unitLabel: price.unitLabel.trim(),
    }),
    policy: Object.freeze({
      version: policy.version,
      title: policy.title.trim(),
      body: policy.body,
      effectiveAt: policy.effectiveAt,
    }),
  });
}

export function normalizePublicCatalog(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || typeof data.available !== 'boolean' || !Array.isArray(data.services)
    || (!data.available && data.services.length > 0)) invalidResponse();

  return Object.freeze({
    available: data.available,
    services: Object.freeze(data.services.map(normalizeService)),
  });
}

function normalizeServiceAreas(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || typeof data.available !== 'boolean' || !Array.isArray(data.areas)
    || (!data.available && data.areas.length > 0)) invalidResponse();

  const areas = data.areas.map((area) => {
    if (!area || typeof area !== 'object' || Array.isArray(area)
      || !nonEmptyString(area.id) || !nonEmptyString(area.name)
      || (area.description !== undefined && typeof area.description !== 'string')) {
      invalidResponse();
    }
    return Object.freeze({
      id: area.id,
      name: area.name.trim(),
      description: (area.description || '').trim(),
    });
  });

  return Object.freeze({ available: data.available, areas: Object.freeze(areas) });
}

export async function loadPublicCatalog({ signal } = {}) {
  const response = await requestCatalog('/services', { signal });
  if (response.pending) return response;
  return { ...response, data: normalizePublicCatalog(response.data) };
}

export async function loadPublicServiceAreas({ signal } = {}) {
  const response = await requestCatalog('/service-areas', { signal });
  if (response.pending) return response;
  return { ...response, data: normalizeServiceAreas(response.data) };
}

export function formatCatalogPrice(price) {
  if (!price || !Number.isSafeInteger(price.amountVnd) || price.amountVnd < 0
    || price.currency !== 'VND' || !nonEmptyString(price.unitLabel)) return null;

  const amount = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(price.amountVnd);

  return amount + ' / ' + price.unitLabel.trim();
}

export function formatPolicyDate(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(timestamp);
}