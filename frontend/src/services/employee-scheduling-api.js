import { createServiceWorkflowApi } from './service-workflow-api.js';
import { createVisitTravelApi } from './visit-travel-api.js';
import { createVisitClosureApi } from './visit-closure-api.js';
import { createNeedsActionApi } from './needs-action-api.js';
import { ApiError } from './api-client.js';

export function createEmployeeSchedulingApi(request, { privateImages } = {}) {
  const root = '/employee-scheduling';
  const get = (path, signal) => request(`${root}${path}`, { signal });
  const mutate = (path, body, idempotencyKey, method = 'POST', signal) => request(`${root}${path}`, { method, body, idempotencyKey, signal });
  return {
    saveWorkflowTask: createServiceWorkflowApi(request).saveTask,
    visitWorkflow: createServiceWorkflowApi(request).visit,
    reviewWorkflow: createServiceWorkflowApi(request).review,
    ...createVisitTravelApi(request),
    dogWalk: createVisitTravelApi(request, { dogWalk: true }),
    ...createVisitClosureApi(request),
    ...createNeedsActionApi(request),
    async assignedVisitSummary(id, { signal } = {}) {
      const result = await request(`/visits/${encodeURIComponent(id)}/assigned-summary`, { signal });
      const row = result.data;
      if (row?.visitId !== id || typeof row.state !== 'string' || !Number.isFinite(Date.parse(row.startAt))
        || !Number.isFinite(Date.parse(row.endAt))) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async execution(id, { signal } = {}) {
      const result = await request(`/visits/${encodeURIComponent(id)}/execution`, { signal });
      const row = result.data;
      if (row?.visitId !== id || !Number.isSafeInteger(row.version) || row.version < 0 ||
        !['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'STAFF_CLOSED', 'CANCELLED'].includes(row.state) || !Number.isFinite(Date.parse(row.startAt)) || !Number.isFinite(Date.parse(row.endAt)) || !Array.isArray(row.checklist) ||
        row.checklistItemIds !== null && (!Array.isArray(row.checklistItemIds) || row.checklistItemIds.some(item => typeof item !== 'string'))) {
        throw new ApiError('INVALID_RESPONSE');
      }
      return result;
    },
    readEvidence: privateImages ? (id, options) => privateImages.read(id, options) : undefined,
    uploadEvidence: privateImages ? (file, key, visitId) => privateImages.upload(file, { idempotencyKey: key, visitId }) : undefined,
    async executeVisit(id, action, body, key) {
      if (!['check-ins', 'checklists', 'check-outs'].includes(action)) throw new ApiError('INVALID_API_PATH');
      const result = await request(`/visits/${encodeURIComponent(id)}/${action}`, {
        method: action === 'checklists' ? 'PATCH' : 'POST', body, idempotencyKey: key
      });
      if (result.pending || result.status === 202 || result.data?.visitId !== id || result.data?.version !== body.expectedVersion + 1 ||
        result.data?.state !== (action === 'check-outs' ? 'COMPLETED' : 'IN_PROGRESS')) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    getOrigins: ({ signal } = {}) => get('/day-origins', signal),
    saveOrigin: (body, key) => mutate('/day-origins', body, key, 'PUT'),
    getAvailability: ({ signal } = {}) => get('/availability', signal),
    listCalendar: ({ fromLocalDate, toLocalDate, signal }) => get(`/calendar?${new globalThis.URLSearchParams({ fromLocalDate, toLocalDate })}`, signal),
    saveAvailability: ({ idempotencyKey, ...body }) => mutate('/availability', body, idempotencyKey, 'PUT'),
    load: ({ signal } = {}) => get('/work-areas', signal),
    save: ({ idempotencyKey, signal, ...body }) => mutate('/work-areas', body, idempotencyKey, 'PUT', signal),
    offer: (id, { signal } = {}) => get('/offers/' + encodeURIComponent(id), signal),
    offers: ({ signal, cursor, state } = {}) => {
      const query = new globalThis.URLSearchParams({ ...(cursor ? { cursor } : {}), ...(state ? { state } : {}) });
      return get('/offers' + (query.size ? '?' + query : ''), signal);
    },
    assignments: ({ signal, cursor } = {}) => get(`/assignments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, signal),
    async withdrawalOptions(id, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/withdrawal-options`, signal);
      const row = result.data;
      if (row?.visitId !== id || !['EARLY', 'LATE'].includes(row.mode) || !Number.isSafeInteger(row.version) ||
        !Number.isFinite(Date.parse(row.startAt)) || !Number.isFinite(Date.parse(row.serverNow)) ||
        !Array.isArray(row.reasonCodes)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async withdraw(id, body, key) {
      const result = await mutate(`/visits/${encodeURIComponent(id)}/withdrawals`, body, key);
      if (result.pending || result.status === 202) return result;
      if (result.data?.visitId !== id || result.data?.mode !== body.expectedMode ||
        result.data?.version !== body.expectedVersion + 1 || !Number.isFinite(Date.parse(result.data?.startAt)))
        throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async handover(id, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/handover`, signal);
      if (result.pending) return result;
      const row = result.data;
      if (row?.visitId !== id || !['PENDING', 'CONFIRMED', 'NOT_REQUIRED'].includes(row.state) ||
        (row.state === 'PENDING' && (!Number.isSafeInteger(row.version) || !/^[a-f0-9]{64}$/.test(row.care?.version ?? '') ||
          !row.note || !Array.isArray(row.pets) || !Array.isArray(row.reports) || !Array.isArray(row.care?.pets) ||
          !Array.isArray(row.care?.tasks) || !['startAt', 'endAt', 'accessOpensAt', 'checkInOpensAt'].every(field => Number.isFinite(Date.parse(row[field]))))))
        throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async handoverEarlierReport(id, reportVisitId, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/handover/reports/${encodeURIComponent(reportVisitId)}`, signal);
      if (result.pending) return result;
      const row = result.data;
      if (row?.id !== reportVisitId || !Array.isArray(row.checklist) || !Array.isArray(row.evidence)) {
        throw new ApiError('INVALID_RESPONSE');
      }
      return result;
    },
    async confirmHandover(id, body, key) {
      const result = await mutate(`/visits/${encodeURIComponent(id)}/handover-confirmations`, body, key);
      if (result.pending || result.status === 202) return result;
      const row = result.data;
      if (row?.visitId !== id || row.state !== 'CONFIRMED' || row.version !== body.expectedVersion + 1 ||
        !Number.isFinite(Date.parse(row.acceptedAt)) || !Number.isFinite(Date.parse(row.checkInOpensAt))) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    care: (id, { signal } = {}) => get(`/visits/${encodeURIComponent(id)}/care`, signal),
    acknowledgeCare: (id, version, key) => mutate(`/visits/${encodeURIComponent(id)}/care/acknowledgements`, { version }, key),
    accessNotes: id => get(`/visits/${encodeURIComponent(id)}/access-notes`),
    queue: ({ signal } = {}) => get('/dispatch', signal),
    async withdrawalReview(id, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/withdrawal-review`, signal);
      if (result.pending) return result;
      if (result.data?.visitId !== id || !Number.isSafeInteger(result.data.version)
        || !Number.isFinite(Date.parse(result.data.startAt)) || !Number.isFinite(Date.parse(result.data.endAt))) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async decideWithdrawal(id, body, key) {
      const result = await mutate(`/visits/${encodeURIComponent(id)}/withdrawal-decisions`, body, key);
      if (result.pending || result.status === 202) return result;
      if (result.data?.visitId !== id || result.data.version !== body.expectedVersion + 1 || result.data.decision !== body.decision)
        throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async dispatchDetails(id, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/dispatch`, signal);
      if (result.pending) return result;
      if (result.data?.id !== id || !Number.isSafeInteger(result.data.version)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async reassignment(id, { signal } = {}) {
      const result = await get(`/visits/${encodeURIComponent(id)}/reassignment`, signal);
      const row = result.data;
      if (row?.visit?.id !== id || !Number.isSafeInteger(row.visit.version) || !Number.isFinite(Date.parse(row.visit.startAt)) || !row.currentSitter?.id
        || !Array.isArray(row.items) || !Array.isArray(row.blocked)) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async reassign(id, body, key) {
      const result = await mutate(`/visits/${encodeURIComponent(id)}/reassignments`, body, key);
      if (result.pending || result.status === 202) return result;
      if (result.data?.visitId !== id || result.data.sitterId !== body.sitterId || result.data.version !== body.expectedVersion + 1
        || !Number.isFinite(Date.parse(result.data.startAt))) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    candidates: (id, query, { signal } = {}) => get(`/visits/${encodeURIComponent(id)}/candidates?${new globalThis.URLSearchParams(query)}`, signal),
    plans: ({ signal } = {}) => get('/care-plans', signal),
    respond: (id, decision, expectedVersion, key, extra) =>
      mutate(`/offers/${encodeURIComponent(id)}/${decision}`, { expectedVersion, ...(extra ?? {}) }, key),
    invite: (id, expectedVersion, key, sitterId, expectedAction) => mutate(`/visits/${encodeURIComponent(id)}/invitations`, { expectedVersion, ...(sitterId ? { sitterId } : {}), ...(expectedAction ? { expectedAction } : {}) }, key),
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
