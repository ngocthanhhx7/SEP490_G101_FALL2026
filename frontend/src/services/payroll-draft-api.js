import { ApiError } from './api-client.js';
export function createPayrollDraftApi(request) {
  return {
    async employees({ signal } = {}) {
      const result = await request('/payroll/employees', { signal });
      if (!Array.isArray(result.data?.items)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async preview(body) {
      const result = await request('/payroll/statements/preview', { method: 'POST', body });
      if (!/^[a-f0-9]{64}$/.test(result.data?.sourceHash ?? '') || !result.data?.breakdown || !Array.isArray(result.data.calendar) || !Array.isArray(result.data.warnings)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async prepare(body, key) {
      const result = await request('/payroll/statements/from-sources', { method: 'POST', body, idempotencyKey: key });
      if (result.pending || !/^[a-f0-9]{24}$/.test(result.data?.id ?? '') || result.data?.status !== 'PREPARED') throw new ApiError('INVALID_RESPONSE');
      return result;
    }
  };
}
