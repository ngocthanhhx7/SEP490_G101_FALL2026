import { createApiClient, ApiError } from './api-client.js';

export function createServiceBasketApi(options) {
  const request = createApiClient(options);
  return {
    async pets({ signal } = {}) {
      const response = await request('/pet-care/pets', { signal });
      if (!Array.isArray(response.data)) throw new ApiError('INVALID_RESPONSE');
      return response;
    },
    async quote(items) {
      const response = await request('/pricing/basket-quotes', { method: 'POST', body: { items } });
      const value = response.data;
      if (!value || !Number.isSafeInteger(value.totalVnd) || value.totalVnd < 0 || !Array.isArray(value.items) ||
        !['baseVnd', 'surchargeVnd', 'discountVnd', 'orderFeeVnd'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0) ||
        !Number.isFinite(Date.parse(value.expiresAt))) throw new ApiError('INVALID_RESPONSE');
      return value;
    }
  };
}
