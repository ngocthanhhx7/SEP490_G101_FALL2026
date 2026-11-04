import { ApiError } from './api-client.js';
export function createAiModelApi(request) {
  return {
    async status({ signal } = {}) {
      const result = await request('/ai/admin/status', { signal });
      if (!result.data || !['EXPLAINABLE_RULES', 'APPROVED_ADDITIVE_MODEL'].includes(result.data.rankingSource) ||
        !Array.isArray(result.data.models) || !result.data.data) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    importModel: (body, key) => request('/ai/admin/model-imports', { method: 'POST', body, idempotencyKey: key }),
    reviewModel: (id, body, key) => request(`/ai/admin/models/${encodeURIComponent(id)}/reviews`, { method: 'POST', body, idempotencyKey: key })
  };
}
