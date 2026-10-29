import { ApiError } from './api-client.js';

// P34 supplies an authenticated createApiClient with CSRF. No fixture fallback.
export function createSettlementApi(request) {
  return Object.freeze({
    async load({ signal } = {}) { return (await request('/settlement-requests', { signal })).data; },
    async withdraw(requestId, expectedVersion, idempotencyKey) {
      return (await request(`/settlement-requests/${encodeURIComponent(requestId)}/withdrawals`,
        { method: 'POST', body: { expectedVersion }, idempotencyKey })).data;
    },
    async submit(earningIds, idempotencyKey) {
      return (await request('/settlement-requests', { method: 'POST', body: { earningIds }, idempotencyKey })).data;
    }
  });
}

export const pendingSettlementApi = Object.freeze({
  load: async () => { throw new ApiError('INTEGRATION_PENDING'); },
  withdraw: async () => { throw new ApiError('INTEGRATION_PENDING'); },
  submit: async () => { throw new ApiError('INTEGRATION_PENDING'); }
});
