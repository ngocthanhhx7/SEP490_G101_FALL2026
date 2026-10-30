import { createVisitTravelApi } from './visit-travel-api.js';

export function createEmployeeSchedulingApi(request) {
  const root = '/employee-scheduling';
  const get = (path, signal) => request(`${root}${path}`, { signal });
  const mutate = (path, body, idempotencyKey, method = 'POST', signal) => request(`${root}${path}`, { method, body, idempotencyKey, signal });
  return {
    ...createVisitTravelApi(request),
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
    plans: ({ signal } = {}) => get('/care-plans', signal),
    respond: (id, decision, expectedVersion, key) => mutate(`/offers/${encodeURIComponent(id)}/${decision}`, { expectedVersion }, key),
    invite: (id, expectedVersion, key) => mutate(`/visits/${encodeURIComponent(id)}/invitations`, { expectedVersion }, key),
    preview: (id, body) => mutate(`/care-plans/${encodeURIComponent(id)}/preview`, body),
    finalize: (id, body, key) => mutate(`/care-plans/${encodeURIComponent(id)}/finalization`, body, key),
    propose: (id, body, key) => mutate(`/visits/${encodeURIComponent(id)}/schedule-proposals`, body, key),
    getProposal: ({ proposalId, signal }) => get(`/proposals/${encodeURIComponent(proposalId)}`, signal),
    confirmProposal: (id, { idempotencyKey, ...body }) => mutate(`/proposals/${encodeURIComponent(id)}/confirmation`, body, idempotencyKey)
  };
}
