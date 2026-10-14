import { ApiError } from './api-client.js';

export const formatVisitBoardTime = value => new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short'
}).format(new Date(value));

// Inputs are local Vietnam calendar values, independent of the browser host timezone.
export function vietnamDateTimeToUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new ApiError('INVALID_LOCAL_TIME');
  const date = new Date(value + ':00+07:00');
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16) !== value) throw new ApiError('INVALID_LOCAL_TIME');
  return date.toISOString();
}
export function vietnamToday(clock = Date.now) {
  return new Date(clock() + 7 * 3600000).toISOString().slice(0, 10);
}
export function createVisitBoardApi(request) {
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validRow = row => row && typeof row.id === 'string' && typeof row.serviceName === 'string'
    && ['PROPOSAL', 'BOOKING', 'OFFER', 'VISIT', 'CASE'].includes(row.kind)
    && typeof row.state === 'string' && typeof row.areaCode === 'string' && validTime(row.startAt)
    && Number.isSafeInteger(row.version) && row.version >= 0;
  const id = value => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) throw new ApiError('INVALID_RESOURCE_ID');
    return encodeURIComponent(value);
  };
  return Object.freeze({
    async list(filter, options = {}) {
      const params = new window.URLSearchParams({ fromAt: vietnamDateTimeToUtc(filter.date + 'T00:00'),
        toAt: vietnamDateTimeToUtc(filter.date + 'T23:59'), limit: '20' });
      // Include the final minute of the day in the exclusive interval.
      params.set('toAt', new Date(Date.parse(params.get('fromAt')) + 86400000).toISOString());
      for (const field of ['areaCode', 'kind', 'state', 'cursor']) if (filter[field]) params.set(field, filter[field]);
      if (filter.needsAction) params.set('needsAction', 'true');
      const result = await request('/staff/visit-board?' + params, options);
      if (result.pending) return result;
      if (!Array.isArray(result.data?.items) || result.data.items.length > 20
        || result.data.items.some(row => !validRow(row))
        || !(result.data.nextCursor === null || typeof result.data.nextCursor === 'string')) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    async detail(visitId, options) {
      const result = await request('/visits/' + id(visitId) + '/dispatch', options);
      if (result.pending) return result;
      const value = result.data;
      if (!value || value.id !== visitId || typeof value.serviceName !== 'string' || typeof value.areaCode !== 'string'
        || !validTime(value.startAt) || !validTime(value.endAt) || !Number.isSafeInteger(value.version)
        || value.version < 0 || typeof value.state !== 'string') throw new ApiError('INVALID_RESPONSE');
      if (value.remedy && (!Array.isArray(value.remedy.alternatives) || value.remedy.alternatives.length > 5
        || value.remedy.alternatives.some(item => !item || typeof item.id !== 'string' || !validTime(item.startAt) || !validTime(item.endAt))
        || typeof value.remedy.message !== 'string' || !validTime(value.remedy.createdAt)
        || (value.remedy.response && (typeof value.remedy.response.message !== 'string' || !validTime(value.remedy.response.respondedAt))))) throw new ApiError('INVALID_RESPONSE');
      return result;
    },
    propose: (visitId, body, idempotencyKey) => request('/visits/' + id(visitId) + '/remedies', { method: 'POST', body, idempotencyKey }),
    assign: (visitId, body, idempotencyKey) => request('/visits/' + id(visitId) + '/assignments', { method: 'POST', body, idempotencyKey })
  });
}
