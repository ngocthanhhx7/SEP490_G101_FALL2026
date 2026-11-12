import { ApiError, createApiClient, SESSION_INVALIDATED_EVENT } from './api-client.js';
import { apiSessionAdapter } from './session-adapter.js';
export const avatarPath = petId => petId ? `/avatars/pets/${encodeURIComponent(petId)}` : '/avatars/me';
export function createAvatarApi(options = {}) {
  const request = createApiClient({ fetchImpl: (...args) => globalThis.fetch(...args), getCsrfToken: () => apiSessionAdapter.getCsrfToken(), ...options });
  const checked = async promise => {
    const result = await promise;
    if (result.pending || !Number.isSafeInteger(result.data?.version) || result.data.version < 0 || typeof result.data.present !== 'boolean') throw new ApiError('INVALID_RESPONSE', result.status);
    return result;
  };
  async function content(path, signal) {
    if (!/^\/avatars\/(me|pets\/[a-f0-9]{24})$/i.test(path)) throw new ApiError('INVALID_API_PATH');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    let timedOut = false; const timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs ?? 15000);
    try {
      const response = await (options.fetchImpl ?? globalThis.fetch)(`/api/v1${path}/content`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'image/jpeg' }, signal: controller.signal });
      if (response.status === 401) {
        if (options.onUnauthorized) options.onUnauthorized();
        else if (typeof window !== 'undefined') window.dispatchEvent(new window.Event(SESSION_INVALIDATED_EVENT));
      }
      if (!response.ok) throw new ApiError('AVATAR_CONTENT_UNAVAILABLE', response.status);
      if (response.headers?.get?.('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') throw new ApiError('INVALID_RESPONSE', response.status);
      const blob = await response.blob();
      if (!blob.size || blob.size > 512 * 1024) throw new ApiError('INVALID_RESPONSE', response.status);
      return blob;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(signal?.aborted ? 'ABORTED' : timedOut ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  return {
    content,
    get: (path, signal) => checked(request(path, { signal })),
    save: (path, attempt, signal) => checked(attempt.remove
      ? request(path, { method: 'DELETE', body: { expectedVersion: attempt.version }, idempotencyKey: attempt.key, signal })
      : request(`${path}?version=${attempt.version}`, { method: 'PUT', binaryBody: attempt.file, idempotencyKey: attempt.key, signal }))
  };
}
export const avatarApi = createAvatarApi();
export const AVATAR_CHANGED = 'pwc:avatar-changed';
