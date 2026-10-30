import { ApiError, createApiClient } from './api-client.js';

const ROLES = new Set(['CUSTOMER', 'PET_SITTER', 'STAFF', 'ADMIN']);

export function createApiSessionAdapter({ request, getCsrfToken = () => null } = {}) {
  if (request !== undefined && typeof request !== 'function') throw new TypeError('An API request function is required');
  if (typeof getCsrfToken !== 'function') throw new TypeError('A CSRF token provider is required');
  let csrfToken = null;
  let generation = 0;
  const readCsrfToken = () => csrfToken ?? getCsrfToken();
  const getRequest = () => request ?? createApiClient({ getCsrfToken: readCsrfToken });
  function mapUser(response) {
    const user = response?.data?.user;
    if (typeof user?.id !== 'string' || !user.id || typeof user.displayName !== 'string'
      || !Array.isArray(user.roles) || user.roles.length === 0
      || user.roles.some(role => !ROLES.has(role))) {
      throw new ApiError('INVALID_RESPONSE', response?.status ?? 0);
    }
    return { id: user.id, displayName: user.displayName, roles: [...new Set(user.roles)] };
  }
  return Object.freeze({
    async resolve({ signal } = {}) {
      const current = ++generation;
      try {
        const response = await getRequest()('/me', { signal });
        const user = mapUser(response);
        if (current === generation && !signal?.aborted
          && typeof response.data?.csrfToken === 'string' && response.data.csrfToken) csrfToken = response.data.csrfToken;
        return { status: 'authenticated', user };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          if (current === generation && !signal?.aborted) csrfToken = null;
          return { status: 'guest' };
        }
        throw error;
      }
    },
    getCsrfToken: readCsrfToken,
    async requestLoginOtp({ channel, contact } = {}) {
      const response = await getRequest()('/otp-challenges', {
        method: 'POST', body: { channel, contact, purpose: 'LOGIN' }, csrfBootstrap: true
      });
      return response.data;
    },
    async login({ challengeId, channel, contact, code, rememberDevice } = {}) {
      const current = ++generation;
      const response = await getRequest()('/sessions', {
        method: 'POST', body: { challengeId, channel, contact, purpose: 'LOGIN', code,
          ...(rememberDevice !== undefined ? { rememberDevice } : {}) }, csrfBootstrap: true
      });
      if (response.data?.authenticated !== true) return { status: 'guest',
        ...(response.data?.reason === 'REGISTRATION_REQUIRED' ? { reason: 'REGISTRATION_REQUIRED' } : {}) };
      const user = mapUser(response);
      if (typeof response.data.csrfToken !== 'string' || !response.data.csrfToken) {
        throw new ApiError('INVALID_RESPONSE', response.status);
      }
      if (current === generation) csrfToken = response.data.csrfToken;
      return { status: 'authenticated', user };
    },
    async logout() {
      ++generation;
      await getRequest()('/sessions/current', { method: 'DELETE' });
      csrfToken = null;
    }
  });
}

export const apiSessionAdapter = createApiSessionAdapter();

// Keep the UI in an explicit pending state until the OTP UI and CSRF handoff are wired.
export const pendingSessionAdapter = {
  async resolve() { return { status: 'pending' }; },
};
