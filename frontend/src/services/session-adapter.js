import { ApiError, createApiClient } from './api-client.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function createApiSessionAdapter({ request, getCsrfToken = () => null } = {}) {
  if (request !== undefined && typeof request !== 'function') throw new TypeError('An API request function is required');
  if (typeof getCsrfToken !== 'function') throw new TypeError('A CSRF token provider is required');
  const getRequest = () => request ?? createApiClient({ getCsrfToken });
  return Object.freeze({
    async resolve({ signal } = {}) {
      try {
        const response = await getRequest()('/me', { signal });
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
    },
    getCsrfToken,
    async logout() { await getRequest()('/sessions/current', { method: 'DELETE' }); }
  });
}

export const apiSessionAdapter = createApiSessionAdapter();

// Keep the UI in an explicit pending state until the OTP UI and CSRF handoff are wired.
export const pendingSessionAdapter = {
  async resolve() { return { status: 'pending' }; },
};
