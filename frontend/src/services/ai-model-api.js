import { ApiError } from './api-client.js';
const model = row => row && /^[a-f0-9]{24}$/.test(row.id) && typeof row.version === 'string' && row.version.length > 0 &&
  ['DRAFT', 'APPROVED', 'RETIRED'].includes(row.state) && Number.isSafeInteger(row.reviewVersion) && row.reviewVersion >= 0 &&
  ['trainingRows', 'testMae', 'baselineMae'].every(key => Number.isFinite(row[key]) && row[key] >= 0);
export function createAiModelApi(request) {
  async function write(path, body, key, expectedId) {
    const result = await request(path, { method: 'POST', body, idempotencyKey: key });
    if (result.pending || result.status === 202) return result;
    if (!model(result.data) || expectedId && result.data.id !== expectedId) throw new ApiError('INVALID_RESPONSE', result.status);
    return result;
  }
  return {
    async trainingReadiness({ signal } = {}) {
      const result = await request('/ai/admin/training-readiness', { signal });
      const data = result.data;
      if (!data || !['scanned', 'eligibleRows', 'bookingGroups', 'scanLimit', 'missingObservations', 'missingBookingGroups'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0) ||
        typeof data.readyForTraining !== 'boolean' || typeof data.truncated !== 'boolean' || !data.excluded ||
        !Object.values(data.excluded).every(value => Number.isSafeInteger(value) && value >= 0)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async status({ signal } = {}) {
      const result = await request('/ai/admin/status', { signal });
      if (!result.data || !['EXPLAINABLE_RULES', 'APPROVED_ADDITIVE_MODEL'].includes(result.data.rankingSource) ||
        !Array.isArray(result.data.models) || !result.data.models.every(model) || !result.data.data ||
        result.data.activeModel && !model(result.data.activeModel) ||
        result.data.rankingSource === 'APPROVED_ADDITIVE_MODEL' && !result.data.activeModel ||
        !['outcomes', 'verifiedCandidates', 'capturedVisits', 'minimumObservations', 'minimumBookingGroups'].every(key => Number.isSafeInteger(result.data.data[key]) && result.data.data[key] >= 0)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    importModel: (body, key) => write('/ai/admin/model-imports', body, key),
    reviewModel: (id, body, key) => write(`/ai/admin/models/${encodeURIComponent(id)}/reviews`, body, key, id)
  };
}
