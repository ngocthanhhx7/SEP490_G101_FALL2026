import { createVisitTravelApi } from './visit-travel-api.js';
import { ApiError } from './api-client.js';

export function createEmployeeSchedulingApi(request, { privateImages } = {}) {
  const root = '/employee-scheduling';
  const get = (path, signal) => request(`${root}${path}`, { signal });
  const mutate = (path, body, idempotencyKey, method = 'POST', signal) => request(`${root}${path}`, { method, body, idempotencyKey, signal });
  return {
    ...createVisitTravelApi(request),
    async execution(id, { signal } = {}) {
      const result = await request(`/visits/${encodeURIComponent(id)}/execution`, { signal });
      const row = result.data;
      if (row?.visitId !== id || !Number.isSafeInteger(row.version) || row.version < 0 ||
        !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'].includes(row.state) || !Array.isArray(row.checklist) ||
        row.checklistItemIds !== null && (!Array.isArray(row.checklistItemIds) || row.checklistItemIds.some(item => typeof item !== 'string'))) {
        throw new ApiError('INVALID_RESPONSE');
      }
      return result;
    },
    uploadEvidence: privateImages ? (file, key) => privateImages.upload(file, { idempotencyKey: key }) : undefined,
    async executeVisit(id, action, body, key) {
      if (!['check-ins', 'checklists', 'check-outs'].includes(action)) throw new ApiError('INVALID_API_PATH');
      const result = await request(`/visits/${encodeURIComponent(id)}/${action}`, {
        method: action === 'checklists' ? 'PATCH' : 'POST', body, idempotencyKey: key
      });
      if (result.pending || result.status === 202 || result.data?.visitId !== id || result.data?.version !== body.expectedVersion + 1 ||
        result.data?.state !== (action === 'check-outs' ? 'COMPLETED' : 'IN_PROGRESS')) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    getAvailability: ({ signal } = {}) => get('/availability', signal),
    listCalendar: ({ fromLocalDate, toLocalDate, signal }) => get(`/calendar?${new globalThis.URLSearchParams({ fromLocalDate, toLocalDate })}`, signal),
    saveAvailability: ({ idempotencyKey, ...body }) => mutate('/availability', body, idempotencyKey, 'PUT'),
    load: ({ signal } = {}) => get('/work-areas', signal),
    save: ({ idempotencyKey, signal, ...body }) => mutate('/work-areas', body, idempotencyKey, 'PUT', signal),
    offers: ({ signal, cursor } = {}) => get(`/offers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, signal),
    assignments: ({ signal, cursor } = {}) => get(`/assignments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, signal),
    care: (id, { signal } = {}) => get(`/visits/${encodeURIComponent(id)}/care`, signal),
    acknowledgeCare: (id, version, key) => mutate(`/visits/${encodeURIComponent(id)}/care/acknowledgements`, { version }, key),
    accessNotes: id => get(`/visits/${encodeURIComponent(id)}/access-notes`),
    queue: ({ signal } = {}) => get('/dispatch', signal),
    candidates: (id, query, { signal } = {}) => get(`/visits/${encodeURIComponent(id)}/candidates?${new globalThis.URLSearchParams(query)}`, signal),
    plans: ({ signal } = {}) => get('/care-plans', signal),
    respond: (id, decision, expectedVersion, key) => mutate(`/offers/${encodeURIComponent(id)}/${decision}`, { expectedVersion }, key),
    invite: (id, expectedVersion, key, sitterId) => mutate(`/visits/${encodeURIComponent(id)}/invitations`, { expectedVersion, ...(sitterId ? { sitterId } : {}) }, key),
    preview: (id, body) => mutate(`/care-plans/${encodeURIComponent(id)}/preview`, body),
    finalize: (id, body, key) => mutate(`/care-plans/${encodeURIComponent(id)}/finalization`, body, key),
    propose: (id, body, key) => mutate(`/visits/${encodeURIComponent(id)}/schedule-proposals`, body, key),
    getProposal: ({ proposalId, signal }) => get(`/proposals/${encodeURIComponent(proposalId)}`, signal),
    async confirmProposal(id, { idempotencyKey, ...body }) {
      const result = await mutate(`/proposals/${encodeURIComponent(id)}/confirmation`, body, idempotencyKey);
      if (result.pending || result.status === 202 || result.data?.proposal?.id !== id || result.data?.proposal?.state !== 'CONFIRMED' ||
        result.data?.offer?.state !== 'PENDING' || !result.data?.offer?.id) throw new ApiError('INVALID_RESPONSE');
      return result;
    }
  };
}
