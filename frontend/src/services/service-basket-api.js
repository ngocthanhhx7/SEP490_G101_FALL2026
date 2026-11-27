import { createApiClient, ApiError } from './api-client.js';
import { createVisitTravelApi } from './visit-travel-api.js';

export function createServiceBasketApi(options) {
  const request = createApiClient(options);
  return {
    ...createVisitTravelApi(request),
    async rateVisit(id, body, idempotencyKey) {
      const response = await request(`/reviews/visits/${encodeURIComponent(id)}/ratings`, { method: 'POST', body, idempotencyKey });
      if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
      if (!response.data?.review?.id) throw new ApiError('INVALID_RESPONSE');
      return response;
    },
    async checkoutOptions({ signal } = {}) { return request('/checkout/options', { signal }); },
    async pickupQuote(body, { signal } = {}) {
      const result = await request('/checkout/pickup-quotes', { method: 'POST', body, signal });
      if (result.pending || typeof result.data?.allowed !== 'boolean') throw new ApiError('INVALID_RESPONSE');
      return result.data;
    },
    async availability(body, { signal } = {}) {
      const response = await request('/checkout/availability', { method: 'POST', body, signal });
      if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
      const value = response.data;
      if (!value || !Array.isArray(value.sitters) || typeof value.complete !== 'boolean' ||
        value.sitters.some(row => !row || typeof row.id !== 'string' || typeof row.displayName !== 'string' || (body.directory === true && (typeof row.eligible !== 'boolean' || !Number.isSafeInteger(row.reviewCount) || row.reviewCount < 0 || (row.reviewCount === 0 ? row.rating !== null : !Number.isFinite(row.rating) || row.rating < 1 || row.rating > 5))))) throw new ApiError('INVALID_RESPONSE');
      if (body.directory === true && value.nextPage !== null && (!Number.isSafeInteger(value.nextPage) || value.nextPage !== (body.page ?? 1) + 1)) throw new ApiError('INVALID_RESPONSE');
      return value;
    },
    async addresses({ signal } = {}) { return request('/pet-care/addresses', { signal }); },
    async confirm(body, idempotencyKey) {
      const response = await request('/checkout/bookings', { method: 'POST', body, idempotencyKey });
      if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
      if (!response.data?.id) throw new ApiError('INVALID_RESPONSE');
      return response.data;
    },
    async booking(id, { signal } = {}) { return (await request(`/checkout/bookings/${encodeURIComponent(id)}`, { signal })).data; },
    async paymentLink(id, idempotencyKey) {
      return (await request(`/checkout/bookings/${encodeURIComponent(id)}/payment-link`, { method: 'POST', body: {}, idempotencyKey })).data;
    },
    async previewCancellation(id, body, { signal } = {}) {
      const response = await request(`/checkout/bookings/${encodeURIComponent(id)}/cancellation-preview`, { method: 'POST', body, signal });
      if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
      return response.data;
    },
    async cancelBooking(id, body, idempotencyKey) {
      const response = await request(`/checkout/bookings/${encodeURIComponent(id)}/cancellations`, { method: 'POST', body, idempotencyKey });
      if (response.pending) throw new ApiError('COMMAND_PENDING', 202);
      return response.data;
    },
    async pets({ signal } = {}) {
      const response = await request('/pet-care/pets', { signal });
      if (!Array.isArray(response.data)) throw new ApiError('INVALID_RESPONSE');
      return response;
    },
    async quote(items) {
      const response = await request('/pricing/basket-quotes', { method: 'POST', body: { items } });
      const value = response.data;
      if (!value || !Number.isSafeInteger(value.totalVnd) || value.totalVnd < 0 || !Array.isArray(value.items) ||
        !['baseVnd', 'surchargeVnd', 'discountVnd', 'tierDiscountVnd'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) ||
        !value.tier || !['MEMBER', 'SILVER', 'GOLD'].includes(value.tier.code) ||
        value.totalVnd !== value.baseVnd + value.surchargeVnd - value.discountVnd - value.tierDiscountVnd ||
        !Number.isFinite(Date.parse(value.expiresAt))) throw new ApiError('INVALID_RESPONSE');
      return value;
    }
  };
}
