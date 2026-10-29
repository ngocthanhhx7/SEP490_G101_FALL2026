import { ApiError, SESSION_INVALIDATED_EVENT } from './api-client.js';

export const PRIVATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ID = /^[a-f\d]{64}$/i;
const TYPES = new Set(['image/png', 'image/jpeg']);
const KEY = /^[A-Za-z0-9_-]{16,128}$/;

function fetchFromCurrentRuntime(...args) {
  if (typeof globalThis.fetch !== 'function') throw new ApiError('NETWORK_ERROR');
  return globalThis.fetch(...args);
}

function invalidateSession() {
  if (typeof window !== 'undefined') window.dispatchEvent(new window.Event(SESSION_INVALIDATED_EVENT));
}

function validateFile(file) {
  if (!file || typeof file !== 'object' || !Number.isSafeInteger(file.size)
    || file.size < 1 || file.size > PRIVATE_IMAGE_MAX_BYTES || !TYPES.has(file.type)
    || typeof file.arrayBuffer !== 'function') {
    throw new ApiError('INVALID_PRIVATE_IMAGE', 422);
  }
}

function validateKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 422);
}

function validateId(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ApiError('INVALID_RESOURCE_ID', 422);
}

export function createPrivateImageApi({ fetchImpl = fetchFromCurrentRuntime, getCsrfToken = () => null,
  onUnauthorized = invalidateSession, timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function' || typeof getCsrfToken !== 'function'
    || typeof onUnauthorized !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('Private image API dependencies are invalid');
  }

  async function request(path, { method = 'GET', body, contentType, idempotencyKey, signal, consume } = {}) {
    const controller = new AbortController();
    let response;
    let interrupted = false;
    let rejectInterruption;
    const interruption = new Promise((_resolve, reject) => { rejectInterruption = reject; });
    const cancelBody = () => {
      try {
        const cancellation = response?.body?.cancel?.();
        cancellation?.catch?.(() => {});
      } catch { /* best effort */ }
    };
    const interrupt = error => {
      if (interrupted) return;
      interrupted = true;
      controller.abort();
      cancelBody();
      rejectInterruption(error);
    };
    const abort = () => interrupt(new ApiError('ABORTED'));
    if (signal?.aborted) {
      controller.abort();
      throw new ApiError('ABORTED');
    }
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => interrupt(new ApiError('TIMEOUT')), timeoutMs);
    try {
      const headers = { Accept: method === 'GET' ? 'image/png,image/jpeg' : 'application/json' };
      if (contentType) headers['Content-Type'] = contentType;
      if (method !== 'GET') {
        const csrfToken = getCsrfToken();
        if (!csrfToken) throw new ApiError('CSRF_NOT_READY');
        headers['X-CSRF-Token'] = csrfToken;
        headers['Idempotency-Key'] = idempotencyKey;
      }
      response = await Promise.race([fetchImpl(`/api/v1${path}`, {
        method, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', body,
        signal: controller.signal
      }), interruption]);
      if (response.status === 401) onUnauthorized();
      const payload = consume ? await Promise.race([
        Promise.resolve().then(() => consume(response)), interruption
      ]) : undefined;
      return { response, payload };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({
    async upload(file, { signal, idempotencyKey } = {}) {
      validateFile(file);
      validateKey(idempotencyKey);
      const { response, payload } = await request('/private-images', {
        method: 'POST', body: file, contentType: file.type, idempotencyKey, signal,
        consume: async result => {
          try { return await result.json(); } catch { return null; }
        }
      });
      const envelope = payload;
      const data = envelope?.data;
      if (!response.ok) throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status,
        { fieldErrors: envelope?.error?.fieldErrors });
      if (envelope?.meta?.schemaVersion !== 1 || !data || !ID.test(data.id)
        || data.state !== 'READY' || typeof data.replayed !== 'boolean') {
        throw new ApiError('INVALID_RESPONSE', response.status);
      }
      return { ...data, status: response.status };
    },
    async read(id, { signal } = {}) {
      validateId(id);
      const { response, payload } = await request(`/private-images/${id}/content`, {
        signal,
        consume: async result => {
          if (result.ok) return { blob: await result.blob() };
          try { return { envelope: await result.json() }; } catch { return { envelope: null }; }
        }
      });
      if (!response.ok) {
        const envelope = payload?.envelope;
        throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status);
      }
      const contentType = response.headers?.get?.('content-type')?.split(';')[0];
      if (!TYPES.has(contentType)) throw new ApiError('INVALID_RESPONSE', response.status);
      const blob = payload?.blob;
      if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > PRIVATE_IMAGE_MAX_BYTES) {
        throw new ApiError('INVALID_RESPONSE', response.status);
      }
      return { blob, contentType, status: response.status };
    }
  });
}

export const privateImageApi = createPrivateImageApi();
