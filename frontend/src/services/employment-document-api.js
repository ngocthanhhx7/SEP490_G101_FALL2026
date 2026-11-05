import { ApiError } from './api-client.js';
export function createEmploymentDocumentApi(request) {
  const root = id => `/applications/${encodeURIComponent(id)}/employment-contract`;
  const checked = result => { if (!result?.data?.id || !result.data.terms || result.pending) throw new ApiError('INVALID_RESPONSE'); return result.data; };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const validPrefill = value => value === undefined || object(value) && object(value.terms) && Object.values(value.terms).every(item=>typeof item==='string') && object(value.sources) && Object.values(value.sources).every(item=>typeof item==='string') && Array.isArray(value.warnings) && value.warnings.every(item=>typeof item==='string');
  return { get: async (id, signal) => { const result = await request(root(id), { signal }); if (!result.data || !Array.isArray(result.data.history) || !validPrefill(result.data.prefill)) throw new ApiError('INVALID_RESPONSE'); return result.data; },
    save: async (id, body, key) => checked(await request(root(id), { method: 'POST', body, idempotencyKey: key })),
    decide: async (id, documentId, body, key) => checked(await request(`${root(id)}/${encodeURIComponent(documentId)}/decisions`, { method: 'POST', body, idempotencyKey: key })) };
}
