import { ApiError, createApiClient } from './api-client.js';

const isId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const isDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function bookingPath(bookingId) {
  if (!isId(bookingId)) throw new ApiError('INVALID_BOOKING_ID', 422);
  return '/bookings/' + bookingId;
}

function validVisit(visit) {
  return isId(visit?.id) && isDate(visit.startAt) && isDate(visit.endAt) && Date.parse(visit.endAt) > Date.parse(visit.startAt)
    && typeof visit.canSelect === 'boolean' && typeof visit.keepsOldTime === 'boolean';
}

export function createBookingChangeApi({ getCsrfToken } = {}) {
  const request = createApiClient({ getCsrfToken });
  return {
    async options(bookingId, { signal } = {}) {
      const result = await request(bookingPath(bookingId) + '/change-options', { signal });
      const { data } = result;
      if (data?.bookingId !== bookingId || !isDate(data.serverNow) || typeof data.canChangeBooking !== 'boolean' ||
        !Array.isArray(data.slotNumbers) || !data.slotNumbers.every(slot => slot === 1 || slot === 2) ||
        !Array.isArray(data.visits) || !data.visits.every(validVisit))
        throw new ApiError('INVALID_RESPONSE', result.status);
      return result;
    },

    async submit(bookingId, body, idempotencyKey) {
      const result = await request(bookingPath(bookingId) + '/change-requests', { method: 'POST', body, idempotencyKey });
      if (result.status !== 201 || result.data?.bookingId !== bookingId || !isId(result.data.id) ||
        result.data.state !== 'PENDING' || result.data.messageCode !== 'MSG53')
        throw new ApiError('INVALID_RESPONSE', result.status);
      return result;
    }
  };
}
