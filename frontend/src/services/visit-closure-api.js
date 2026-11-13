import { ApiError } from './api-client.js';

// Transport for UC-33 "Close visit": visits not checked out 2 hours after their end, and the Staff command that closes one.
export function createVisitClosureApi(request) {
  const root = '/employee-scheduling';
  return {
    closableVisits: ({ signal } = {}) => request(`${root}/closable-visits`, { signal }),
    closureDetails: (id, { signal } = {}) => request(`${root}/visits/${encodeURIComponent(id)}/closure`, { signal }),
    async closeVisit(id, body, key) {
      const result = await request(`${root}/visits/${encodeURIComponent(id)}/closures`, { method: 'POST', body, idempotencyKey: key });
      if (result.pending || result.status === 202) return result;
      if (result.data?.visitId !== id || result.data?.state !== 'STAFF_CLOSED' || result.data?.version !== body.expectedVersion + 1)
        throw new ApiError('INVALID_RESPONSE');
      return result;
    }
  };
}
