import { ApiError, createApiClient } from './api-client.js';
import { apiSessionAdapter } from './session-adapter.js';
export const avatarPath = petId => petId ? `/avatars/pets/${encodeURIComponent(petId)}` : '/avatars/me';
export function createAvatarApi(options = {}) {
  const request = createApiClient({ fetchImpl: (...args) => globalThis.fetch(...args), getCsrfToken: () => apiSessionAdapter.getCsrfToken(), ...options });
  const checked = async promise => {
    const result = await promise;
    if (result.pending || !Number.isSafeInteger(result.data?.version) || result.data.version < 0 || typeof result.data.present !== 'boolean') throw new ApiError('INVALID_RESPONSE', result.status);
    return result;
  };
  return {
    get: (path, signal) => checked(request(path, { signal })),
    save: (path, attempt, signal) => checked(attempt.remove
      ? request(path, { method: 'DELETE', body: { expectedVersion: attempt.version }, idempotencyKey: attempt.key, signal })
      : request(`${path}?version=${attempt.version}`, { method: 'PUT', binaryBody: attempt.file, idempotencyKey: attempt.key, signal }))
  };
}
export const avatarApi = createAvatarApi();
export const AVATAR_CHANGED = 'pwc:avatar-changed';
