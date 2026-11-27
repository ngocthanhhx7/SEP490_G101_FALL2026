import { ApiError, createApiClient } from './api-client.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function requireId(value, name) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ApiError(`INVALID_${name.toUpperCase()}`, 400);
  }
  return value;
}

export function createVisitCareInstructionsApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) {
      defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    }
    return defaultRequest(...args);
  };

  return Object.freeze({
    async getBookingCareInstructions(bookingId, { signal } = {}) {
      const id = requireId(bookingId, 'booking_id');
      const result = await send(`/checkout/bookings/${encodeURIComponent(id)}/care-instructions`, { signal });
      if (result?.pending) return result;
      if (!result?.data || !Array.isArray(result.data.visits)) {
        throw new ApiError('INVALID_RESPONSE', result?.status || 0);
      }
      return result;
    },

    async confirmVisitCareInstructions(bookingId, visitId, body) {
      const bId = requireId(bookingId, 'booking_id');
      const vId = requireId(visitId, 'visit_id');
      const result = await send(
        `/checkout/bookings/${encodeURIComponent(bId)}/visits/${encodeURIComponent(vId)}/care-instructions`,
        { method: 'PUT', body }
      );
      if (result?.pending) return result;
      if (!result?.data || !Array.isArray(result.data.visits)) {
        throw new ApiError('INVALID_RESPONSE', result?.status || 0);
      }
      return result;
    }
  });
}
