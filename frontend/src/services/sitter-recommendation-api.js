import { ApiError, createApiClient } from './api-client.js';
import { normalizePublicCatalog } from './public-catalog-api.js';

const ID = /^[a-f0-9]{24}$/i;
const STATUSES = new Set(['READY_FOR_OFFER_SHORTLIST', 'ROUTING_UNAVAILABLE', 'SEARCH_INCOMPLETE', 'INSUFFICIENT_ELIGIBLE_SITTERS']);
function invalid() { throw new ApiError('INVALID_RESPONSE'); }
function identity(item) {
  const id = item?.id ?? item?._id;
  if (!ID.test(id ?? '')) invalid();
  return id;
}

export function createSitterRecommendationApi({ request = createApiClient() } = {}) {
  return Object.freeze({
    async setup({ signal } = {}) {
      const [catalog, pets, addresses, care] = await Promise.all([
        request('/services', { signal }), request('/pet-care/pets', { signal }),
        request('/pet-care/addresses', { signal }), request('/pet-care/catalog', { signal })
      ]);
      if ([catalog, pets, addresses, care].some(result => result.pending)) throw new ApiError('SETUP_PENDING');
      if (!Array.isArray(pets.data) || !Array.isArray(addresses.data) || !Array.isArray(care.data?.breeds)) invalid();
      return { services: normalizePublicCatalog(catalog.data).services,
        pets: pets.data.map(pet => ({ id: identity(pet), name: String(pet.name ?? ''), species: pet.species,
          confirmed: pet.careNeedsConfirmed === true })),
        addresses: addresses.data.map(address => ({ id: identity(address), label: String(address.label ?? ''),
          confirmed: Boolean(address.pointConfirmedAt) })),
        breeds: care.data.breeds.map(breed => ({ code: breed.code, name: breed.name, species: breed.species })),
        workAreas: care.data.workAreas?.length ? care.data.workAreas : [{ code: 'HN', label: 'Hà Nội' }] };
    },
    async createPet(body) { return request('/pet-care/pets', { method: 'POST', body }); },
    async createAddress(body) { return request('/pet-care/addresses', { method: 'POST', body }); },
    async searchAddress(query) { return request('/maps/search', { method: 'POST', body: { query } }); },
    async recommend(body, { signal } = {}) {
      const response = await request('/ai/recommendations', { method: 'POST', body, signal });
      const result = response.data;
      if (response.pending || !result || !STATUSES.has(result.status) || !ID.test(result.matchId ?? '')
        || !Number.isFinite(Date.parse(result.expiresAt)) || !Array.isArray(result.candidates)
        || result.candidates.length > 20 || !Number.isSafeInteger(result.shortfall) || result.shortfall < 0
        || !['EXPLAINABLE_RULES', 'APPROVED_ADDITIVE_MODEL'].includes(result.rankingSource)
        || typeof result.searchTruncated !== 'boolean') invalid();
      for (const item of result.candidates) {
        if (!ID.test(item.sitterId ?? '') || typeof item.displayName !== 'string'
          || !Number.isFinite(item.score) || item.score < 0 || item.score > 100
          || !['ESTABLISHED', 'LIMITED_HISTORY'].includes(item.confidence)
          || !Array.isArray(item.breakdown) || item.breakdown.length !== 5
          || item.breakdown.some(line => typeof line.explanation !== 'string' || !Number.isFinite(line.points))
          || !Number.isFinite(item.plan?.extraTravelMinutes)) invalid();
      }
      return result;
    }
  });
}
