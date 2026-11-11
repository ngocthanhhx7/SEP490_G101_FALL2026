import { ApiError } from './api-client.js';
const validCode = code => typeof code === 'string' && /^(PROVINCE|COMMUNE|CITY|DISTRICT)_[A-Z0-9_-]{1,56}$/.test(code);
export function createServiceAreaManagementApi(request) {
  return {
    async list(query, signal) {
      const result = await request('/admin/service-areas?' + new globalThis.URLSearchParams(query), { signal });
      const data = result.data;
      if (!data || !Array.isArray(data.items) || data.items.length > 100 || !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 0 ||
        data.items.some(row => !validCode(row.code) || typeof row.label !== 'string' || typeof row.enabled !== 'boolean') ||
        data.nextCursor !== null && !validCode(data.nextCursor)) throw new ApiError('INVALID_RESPONSE');
      return data;
    },
    async change(body, key) {
      const result = await request('/admin/service-areas', { method: 'PUT', body, idempotencyKey: key });
      const data = result.data;
      if (result.pending || !data || data.expectedVersion !== body.expectedVersion + 1 || data.enabled !== body.enabled ||
        !Array.isArray(data.codes) || [...data.codes].sort().join('|') !== [...body.codes].sort().join('|')) throw new ApiError('INVALID_RESPONSE');
      return data;
    }
  };
}
