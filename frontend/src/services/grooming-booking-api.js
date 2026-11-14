import { ApiError, createApiClient } from './api-client.js';

const text = value => typeof value === 'string' && value.length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new ApiError('INVALID_RESPONSE', 200); };
const pending = response => { if (response.pending) throw new ApiError('COMMAND_PENDING', 202); return response; };

function checkOptions(data) {
  if (!data || !Array.isArray(data.services) || !Array.isArray(data.questions) || !text(data.window?.firstDate) || !text(data.window?.lastDate)
    || data.services.some(row => !text(row?.id) || !text(row.name) || !Array.isArray(row.species) || typeof row.bookable !== 'boolean')) invalid();
  return data;
}
function checkQuote(data) {
  if (!data || !Array.isArray(data.pets) || !count(data.subtotalVnd) || !count(data.totalVnd) || !data.tier || !count(data.tier.discountVnd)
    || data.pets.some(row => !text(row?.petId) || !count(row.priceVnd) || !Array.isArray(row.lines))) invalid();
  return data;
}
function checkSlots(data) {
  if (!data || !Array.isArray(data.slots) || data.slots.some(row => !text(row?.startAt) || !text(row.time) || !['AVAILABLE', 'FULL'].includes(row.state))) invalid();
  return data;
}
function checkAppointment(data) {
  if (!data || !text(data.id) || !/^GR-\d{4,}$/u.test(data.code ?? '') || !text(data.slot?.startAt) || !text(data.slot.localDate) || !count(data.pricing?.totalVnd)) invalid();
  return data;
}

// Transport of the customer shop grooming booking (`/api/v1/grooming`). The shared client keeps only the error code, but the
// booking needs the server sentence and details (pet name, new total, hotline), so each call reads them from the error
// response it already received: `serverMessage` and `details` are added to the thrown ApiError.
export function createGroomingBookingApi({ getCsrfToken = () => null, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  async function call(path, options) {
    let envelope = null;
    const request = createApiClient({ getCsrfToken, fetchImpl: async (url, init) => {
      const response = await fetchImpl(url, init);
      if (!response.ok) envelope = await (response.clone ? response.clone() : response).json().catch(() => null);
      return response;
    } });
    try {
      return pending(await request(path, options));
    } catch (error) {
      if (error instanceof ApiError && envelope?.error) {
        const { code, message, ...details } = envelope.error;
        error.serverMessage = typeof message === 'string' ? message : undefined;
        error.details = details;
      }
      throw error;
    }
  }
  return {
    async options({ signal } = {}) { return checkOptions((await call('/grooming/options', { signal })).data); },
    async pets({ signal } = {}) {
      const data = (await call('/pet-care/pets', { signal })).data;
      if (!Array.isArray(data) || data.some(row => !text(row?.id ?? row?._id) || !text(row.name) || !['DOG', 'CAT'].includes(row.species))) invalid();
      return data.map(row => ({ ...row, id: row.id ?? row._id }));
    },
    async slots(body, { signal } = {}) { return checkSlots((await call('/grooming/slots', { method: 'POST', body, signal })).data); },
    async quote(body, { signal } = {}) { return checkQuote((await call('/grooming/quotes', { method: 'POST', body, signal })).data); },
    async book(body, idempotencyKey) { return checkAppointment((await call('/grooming/appointments', { method: 'POST', body, idempotencyKey })).data); }
  };
}
