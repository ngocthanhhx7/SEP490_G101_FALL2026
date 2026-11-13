import { ApiError, createApiClient } from './api-client.js';

const path = '/staff/booking-change-requests';
const states = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CLOSED'];
const isId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function requestPath(id) {
  if (!isId(id)) throw new ApiError('INVALID_BOOKING_CHANGE_ID', 422);
  return path + '/' + id;
}

function validItem(item) {
  return isId(item?.visitId) && [item.oldStartAt, item.oldEndAt, item.newStartAt, item.newEndAt].every(isDate);
}

function validRequest(data) {
  return isId(data?.id) && isId(data.bookingId) && states.includes(data.state)
    && ['VISIT', 'BOOKING'].includes(data.scope) && Number.isSafeInteger(data.version) && data.version >= 0
    && isDate(data.sentAt) && isDate(data.expiresAt) && Array.isArray(data.items) && data.items.every(validItem);
}

export function createStaffBookingChangeApi({ getCsrfToken } = {}) {
  const request = createApiClient({ getCsrfToken });
  return {
    async list({ bookingId, cursor, signal } = {}) {
      const query = new globalThis.URLSearchParams({ limit: '20' });
      if (bookingId) query.set('bookingId', bookingId);
      if (cursor) query.set('cursor', cursor);
      const result = await request(path + '?' + query, { signal });
      const { data } = result;
      if (!Array.isArray(data?.items) || !data.items.every(row => validRequest(row) && row.state === 'PENDING'
        && (!bookingId || row.bookingId === bookingId)) || !(data.nextCursor === null || typeof data.nextCursor === 'string'))
        throw new ApiError('INVALID_RESPONSE', result.status);
      return result;
    },
    async detail(id, { signal } = {}) {
      const result = await request(requestPath(id), { signal });
      const { data } = result;
      if (!validRequest(data) || data.id !== id || !isDate(data.serverNow))
        throw new ApiError('INVALID_RESPONSE', result.status);
      return result;
    },
    async decide(id, { action, expectedVersion }, idempotencyKey) {
      const result = await request(requestPath(id) + '/decision', { method: 'POST', idempotencyKey, body: { action, expectedVersion } });
      const approved = action === 'APPROVE';
      const { data } = result;
      if (data?.id !== id || data.state !== (approved ? 'APPROVED' : 'REJECTED') || data.messageCode !== (approved ? 'MSG126' : 'MSG127'))
        throw new ApiError('INVALID_RESPONSE', result.status);
      return result;
    }
  };
}
