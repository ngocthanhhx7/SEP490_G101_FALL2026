import { ApiError, createApiClient } from './api-client.js';

const CHANNELS = new Set(['EMAIL', 'PHONE']);
const OTP_PURPOSE = 'CONTACT_CHANGE';

function invalidResponse(status = 0) {
  return new ApiError('INVALID_RESPONSE', status);
}

export function createAccountSettingsApi({ request = createApiClient() } = {}) {
  if (typeof request !== 'function') throw new TypeError('An API request function is required');

  return Object.freeze({
    async getContacts({ signal } = {}) {
      const response = await request('/me', { signal });
      const contacts = response?.data?.contacts;
      if (!Array.isArray(contacts) || contacts.some(contact => !contact
        || typeof contact.id !== 'string' || !CHANNELS.has(contact.channel)
        || typeof contact.value !== 'string' || contact.state !== 'VERIFIED'
        || typeof contact.verifiedAt !== 'string')) {
        throw invalidResponse(response?.status);
      }
      return contacts.map(contact => ({ ...contact }));
    },

    async requestContactOtp({ channel, contact }) {
      if (!CHANNELS.has(channel) || typeof contact !== 'string' || !contact) {
        throw new ApiError('VALIDATION_FAILED', 422);
      }
      const response = await request('/me/contact-changes', {
        method: 'POST', body: { channel, contact }
      });
      if (response?.status !== 202 || typeof response.data?.challengeId !== 'string'
        || !Number.isInteger(response.data.expiresInSeconds)
        || !Number.isInteger(response.data.resendAfterSeconds)) {
        throw invalidResponse(response?.status);
      }
      return response.data;
    },

    async verifyContact({ challengeId, channel, contact, code }) {
      if (typeof challengeId !== 'string' || !CHANNELS.has(channel)
        || typeof contact !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        throw new ApiError('VALIDATION_FAILED', 422);
      }
      const response = await request('/me/contact-verifications', {
        method: 'POST', body: { challengeId, channel, contact, purpose: OTP_PURPOSE, code }
      });
      if (response?.data?.verified !== true) throw new ApiError('OTP_INVALID_OR_EXPIRED', response?.status);
      return response.data;
    }
  });
}
