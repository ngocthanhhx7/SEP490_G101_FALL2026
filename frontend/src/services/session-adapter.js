import { ApiError, createApiClient } from './api-client.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function createApiSessionAdapter({ request } = {}) {
  if (request !== undefined && typeof request !== 'function') throw new TypeError('An API request function is required');
  return Object.freeze({
    async resolve({ signal } = {}) {
      try {
        const response = await (request ?? createApiClient())('/me', { signal });
        const user = response?.data?.user;
        if (typeof user?.id !== 'string' || !user.id
          || typeof user.displayName !== 'string'
          || !Array.isArray(user.roles) || user.roles.length === 0
          || user.roles.some(role => !ROLES.has(role))) {
          throw new ApiError('INVALID_RESPONSE', response?.status ?? 0);
        }
        return { status: 'authenticated', user: {
          id: user.id,
          displayName: user.displayName,
          roles: [...new Set(user.roles)]
        } };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return { status: 'guest' };
        throw error;
      }
    }
  });
}

export const apiSessionAdapter = createApiSessionAdapter();

// Keep the UI in an explicit pending state until the OTP UI and CSRF handoff are wired.
export const pendingSessionAdapter = {
  async resolve() { return { status: 'pending' }; },
};
