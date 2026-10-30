import { createApiClient } from './api-client.js';

export function createWorkspaceApi(options = {}) {
  let client;
  const request = (...args) => { client ??= options.request ?? createApiClient(options); return client(...args); };
  return {
    async analytics(kind, days, { signal } = {}) {
      if (!['users', 'services', 'admin', 'staff', 'sitter', 'customer'].includes(kind)) throw new TypeError('Invalid workspace');
      const result = await request(`/workspaces/${kind}/analytics?days=${days}`, { signal });
      const data = result.data;
      const count = value => Number.isSafeInteger(value) && value >= 0;
      const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
      if (!result.pending && (!data || data.kind !== kind || !Number.isFinite(Date.parse(data.asOf))
        || !day(data.from) || !day(data.to) || !Array.isArray(data.metrics) || data.metrics.length > 8
        || !data.metrics.every(row => typeof row.label === 'string' && count(row.value))
        || !Array.isArray(data.trend) || data.trend.length > 90 || !data.trend.every(row => day(row.date) && count(row.value))
        || !Array.isArray(data.distribution) || !data.distribution.every(row => typeof row.key === 'string' && count(row.value)))) throw new Error('Invalid analytics response');
      return result;
    }
  };
}
