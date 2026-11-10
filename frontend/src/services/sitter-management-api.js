import { ApiError, createApiClient } from './api-client.js';

const ID = /^[a-f0-9]{24}$/i;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const count = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string';
const cursor = value => value === null || (text(value) && value.length <= 2048);
const row = value => value && ID.test(value.id) && text(value.displayName) && typeof value.demo === 'boolean'
  && text(value.status) && text(value.accountState) && text(value.employmentType) && text(value.profileState)
  && Array.isArray(value.areas) && value.areas.every(text);

const nullableCount = value => value === null || count(value);
const staffRow = value => row(value) && value.accountState === 'ACTIVE' && value.status === 'ACTIVE' && text(value.code)
  && (value.rating === null || (Number.isFinite(value.rating) && value.rating >= 1 && value.rating <= 5))
  && nullableCount(value.withdrawals) && nullableCount(value.lateCheckIns) && value.shift === null && value.approvedLeave === null
  && Array.isArray(value.workingWindows) && value.workingWindows.every(window => window
    && Number.isInteger(window.weekday) && window.weekday >= 1 && window.weekday <= 7
    && /^\d{2}:\d{2}$/u.test(window.startLocalTime) && /^\d{2}:\d{2}$/u.test(window.endLocalTime));

export function createSitterManagementApi(request = createApiClient()) {
  function path(query = {}) {
    const params = new globalThis.URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value !== '' && value !== null && value !== undefined) params.set(key, value); });
    return params.size ? '?' + params.toString() : '';
  }
  async function read(url, validate, signal) {
    const result = await request(url, { signal });
    if (!result.pending && (!validDate(result.data?.asOf) || !validate(result.data))) throw new ApiError('INVALID_RESPONSE');
    return result;
  }
  const target = value => { if (!ID.test(value)) throw new ApiError('INVALID_API_PATH'); return '/sitter-management/' + value; };
  return {
    list: (query, { signal } = {}) => read('/sitter-management' + path(query), data => Array.isArray(data.items)
      && data.items.length <= 50 && data.items.every(query?.view === 'staffList' ? staffRow : row) && count(data.total) && cursor(data.nextCursor)
      && Array.isArray(data.areas) && data.areas.every(a => text(a.code) && text(a.label))
      && (query?.view !== 'staffList' || (typeof data.withdrawalsAvailable === 'boolean'
        && ['all', 'partTime', 'fullTime'].every(key => count(data.tabCounts?.[key])))), signal),
    reports: (query, { signal } = {}) => read('/sitter-management/reports' + path(query), data => data.counts
      && ['total', 'demo', 'real', 'active', 'suspended', 'missingContract'].every(key => count(data.counts[key]))
      && Array.isArray(data.work) && data.work.every(w => text(w.state) && count(w.count))
      && Array.isArray(data.coverage) && data.coverage.every(a => text(a.code) && count(a.count)) && typeof data.visitsAvailable === 'boolean', signal),
    get: (userId, { signal } = {}) => read(target(userId), data => row(data) && data.id === userId
      && Array.isArray(data.contracts) && Array.isArray(data.audit) && data.permissions
      && typeof data.permissions.manageStatus === 'boolean' && typeof data.permissions.reviewApplication === 'boolean'
      && (data.permissions.manageContract === undefined || typeof data.permissions.manageContract === 'boolean')
      && (!data.permissions.manageContract || count(data.contractVersion))
      && (data.availability === null || (Array.isArray(data.availability?.workingWindows) && Array.isArray(data.availability.dayOffDates)))
      && (data.capabilities === null || (Array.isArray(data.capabilities?.services) && Array.isArray(data.capabilities.species)))
      && (data.application === null || (text(data.application?.experience) && Array.isArray(data.application.requestedServices))), signal),
    activity: (userId, query, { signal } = {}) => read(target(userId) + '/activity' + path(query), data => Array.isArray(data.items)
      && data.items.every(v => ID.test(v.id) && validDate(v.startAt) && text(v.state)) && cursor(data.nextCursor), signal),
    async saveCapability(userId, body, key) {
      const result = await request(target(userId) + '/capability', { method: 'PUT', body, idempotencyKey: key });
      if (result.pending || result.data?.userId !== userId || result.data?.version !== body.expectedVersion + 1) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async changeStatus({ applicationId, action, reason, expectedVersion, idempotencyKey }) {
      if (!ID.test(applicationId)) throw new ApiError('INVALID_API_PATH');
      const result = await request(`/applications/${applicationId}/sitter-status`, {
        method: 'POST', body: { action, reason, expectedVersion }, idempotencyKey
      });
      if (result.pending || !['ACTIVE', 'SUSPENDED'].includes(result.data?.status) || !count(result.data?.version)) throw new ApiError('INVALID_RESPONSE');
      return result;
    }
  };
}
