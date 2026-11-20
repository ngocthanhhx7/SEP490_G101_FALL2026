import { ApiError } from './api-client.js';

const factors = ['fit', 'travel', 'quality', 'reliability', 'workload'];

export function createSitterRankingPolicyApi(request) {
  return {
    async status({ signal } = {}) {
      const result = await request('/ai/admin/status', { signal });
      const { data } = result;
      const weights = factors.map(factor => data?.policyWeights?.[factor]);
      if (data?.rankingSource !== 'EXPLAINABLE_RULES' || !Number.isSafeInteger(data.policyVersion) || data.policyVersion < 1 ||
          weights.some(weight => !Number.isFinite(weight) || weight < 0 || weight > 100) ||
          Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.00001) {
        throw new ApiError('INVALID_RESPONSE');
      }
      return result;
    }
  };
}
