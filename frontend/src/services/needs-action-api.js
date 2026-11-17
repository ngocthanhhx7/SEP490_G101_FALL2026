import { ApiError } from './api-client.js';

// Transport for the Staff Needs action and All visits lists (R3 10.1.1) and for "Call".
export function createNeedsActionApi(request) {
  const root = '/employee-scheduling';
  const id = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(value)) throw new ApiError('INVALID_RESOURCE_ID');
    return encodeURIComponent(value);
  };
  return {
    // Empty params are left out of the URL.
    visitBoard(params = {}, { signal } = {}) {
      const query = String(new globalThis.URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')));
      return request(`${root}/visit-board${query ? `?${query}` : ''}`, { signal });
    },
    // The phone number is asked for only when Staff press Call; it is never part of a list.
    async visitContact(visitId, party, { signal } = {}) {
      const result = await request(`${root}/visits/${id(visitId)}/contact?party=${encodeURIComponent(party)}`, { signal });
      if (result.data?.party !== party || (result.data.phone !== null && typeof result.data.phone !== 'string')) throw new ApiError('INVALID_RESPONSE');
      return result;
    }
  };
}
