import { ApiError } from './api-client.js';

export function createCustomerCareApi(request) {
  const path = (kind, id) => {
    if (!['pets', 'addresses'].includes(kind) || (id && !/^[a-f0-9]{24}$/i.test(id))) throw new ApiError('INVALID_RESOURCE_ID');
    return `/pet-care/${kind}${id ? `/${id}` : ''}`;
  };
  return Object.freeze({
    async load(kind, { signal } = {}) {
      const [rows, catalog] = await Promise.all([request(`${path(kind)}${kind === 'addresses' ? '/manage' : ''}`, { signal }), request('/pet-care/catalog', { signal })]);
      if (rows.pending || catalog.pending) return { data: null, pending: true };
      if (!Array.isArray(rows.data) || !Array.isArray(catalog.data?.breeds)) throw new ApiError('INVALID_RESPONSE');
      return { data: { items: rows.data, ...catalog.data } };
    },
    save(kind, id, body, idempotencyKey) {
      return request(path(kind, id), { method: id ? 'PATCH' : 'POST', body, idempotencyKey });
    },
    archive(kind, id, expectedVersion, idempotencyKey) {
      return request(`${path(kind, id)}/archives`, { method: 'POST', body: { expectedVersion }, idempotencyKey });
    },
    searchAddress: query => request('/maps/search', { method: 'POST', body: { query } }),
    resolveAddress: body => request('/maps/places/resolve', { method: 'POST', body })
  });
}
