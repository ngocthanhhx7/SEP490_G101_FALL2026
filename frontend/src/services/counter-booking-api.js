import { createApiClient } from './api-client.js';
import { normalizeCounterBookingService } from '../utils/counter-booking.js';

// The new counter-bookings endpoints belong to PR-2 backend. Do not substitute the
// existing product counter-sale endpoint: it creates product orders, not care bookings.
export function createCounterBookingApi({ getCsrfToken } = {}) {
  const request = createApiClient({ getCsrfToken });
  const root = '/counter-bookings';
  return Object.freeze({
    async catalog({ signal } = {}) {
      const response = await request(root + '/services', { signal });
      return (response.data?.services ?? []).map(normalizeCounterBookingService)
        .filter(service => service.id && service.locations.length && service.priceVnd !== null);
    },
    async lookup(phone) {
      return (await request(root + '/customer-lookups', { method: 'POST', body: { phone } })).data;
    },
    async createCustomer(body) {
      const response = await request(root + '/customers', { method: 'POST', body });
      return response.data?.customer;
    },
    async petCatalog() {
      return (await request(root + '/pet-catalog')).data;
    },
    async createPet(customerId, body) {
      return (await request(root + '/customers/' + encodeURIComponent(customerId) + '/pets', {
        method: 'POST', body, idempotencyKey: globalThis.crypto.randomUUID()
      })).data;
    },
    async slots(date, { customerId, pets } = {}) {
      return (await request(root + '/slots', { method: 'POST', body: { customerId, date, pets } })).data;
    },
    async pickupQuote(body) {
      return (await request(root + '/pickup-quotes', { method: 'POST', body })).data;
    },
    async preview(body) {
      return (await request(root + '/previews', { method: 'POST', body })).data;
    },
    async paymentStatus(receiptId) {
      return (await request(root + '/receipts/' + encodeURIComponent(receiptId) + '/status', { method: 'POST', body: {} })).data;
    },
    async cancelPayment(receiptId) {
      return (await request(root + '/receipts/' + encodeURIComponent(receiptId) + '/cancel', { method: 'POST', body: {} })).data;
    },
    async checkout(body, idempotencyKey) {
      return (await request(root, { method: 'POST', body, idempotencyKey })).data;
    }
  });
}
