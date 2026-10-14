import { ApiError } from './api-client.js';

const ADDRESS_ID = /^[a-f\d]{24}$/i;
const ADDRESS_PAGE_SIZE = 20;

function makeIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `address-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function addressPath(addressId) {
  if (typeof addressId !== 'string' || !ADDRESS_ID.test(addressId)) {
    throw new ApiError('INVALID_ADDRESS_ID');
  }
  return `/addresses/${addressId}`;
}

export function createCustomerAddressAdapter(request) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');

  return Object.freeze({
    list: ({ cursor, signal } = {}) => {
      const query = new globalThis.URLSearchParams({ limit: String(ADDRESS_PAGE_SIZE) });
      if (cursor) query.set('cursor', cursor);
      return request(`/addresses?${query.toString()}`, { signal });
    },

    create: values => request('/addresses', {
      method: 'POST', body: values, idempotencyKey: makeIdempotencyKey()
    }),

    update: (addressId, values) => request(addressPath(addressId), {
      method: 'PATCH', body: values, idempotencyKey: makeIdempotencyKey()
    }),

    archive: (addressId, values) => request(`${addressPath(addressId)}/archives`, {
      method: 'POST', body: values, idempotencyKey: makeIdempotencyKey()
    }),

    accessNotes: (visitId, { signal } = {}) => {
      if (typeof visitId !== 'string' || !ADDRESS_ID.test(visitId)) {
        throw new ApiError('INVALID_VISIT_ID');
      }
      return request(`/visits/${visitId}/access-notes`, { signal });
    }
  });
}

export { ADDRESS_PAGE_SIZE };
