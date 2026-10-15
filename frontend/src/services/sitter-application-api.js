import { ApiError, createApiClient } from './api-client.js';

function fetchFromCurrentRuntime(...args) {
  if (typeof globalThis.fetch !== 'function') throw new ApiError('NETWORK_ERROR');
  return globalThis.fetch(...args);
}

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(random);
  return Array.from(random, value => value.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`;
}

export function createSitterApplicationApi({ fetchImpl = fetchFromCurrentRuntime, uploadDocumentImpl, keyFactory = idempotencyKey,
  timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function' || (uploadDocumentImpl !== undefined && typeof uploadDocumentImpl !== 'function')
    || typeof keyFactory !== 'function') throw new TypeError('Sitter application API dependencies are invalid');

  async function uploadDocument(file, { signal } = {}) {
    if (!uploadDocumentImpl) throw new ApiError('PROVIDER_UNAVAILABLE', 503);
    return uploadDocumentImpl(file, { signal });
  }

  async function submit(body, { signal, key = keyFactory() } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const response = await fetchImpl('/api/v1/applications', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': key },
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: controller.signal, body: JSON.stringify(body)
      });
      let envelope;
      try { envelope = await response.json(); }
      catch { throw new ApiError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status); }
      if (!response.ok) throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status, {
        fieldErrors: envelope?.error?.fieldErrors
      });
      if (envelope?.meta?.schemaVersion !== 1 || !envelope?.data || typeof envelope.data.id !== 'string') {
        throw new ApiError('INVALID_RESPONSE', response.status);
      }
      return { ...envelope.data, status: response.status };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError('ABORTED');
      throw new ApiError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  return Object.freeze({ uploadDocument, submit, createIdempotencyKey: keyFactory, uploadsAvailable: Boolean(uploadDocumentImpl) });
}

export const sitterApplicationApi = createSitterApplicationApi();

export function createSitterApplicationAdminApi({ request = createApiClient({ fetchImpl: fetchFromCurrentRuntime }), keyFactory = idempotencyKey } = {}) {
  if (typeof request !== 'function' || typeof keyFactory !== 'function') {
    throw new TypeError('Admin application API dependencies are invalid');
  }
  return Object.freeze({
    list({ signal, state = '', search = '', cursor = '' } = {}) {
      const params = new globalThis.URLSearchParams();
      if (state) params.set('state', state);
      if (search.trim()) params.set('search', search.trim());
      if (cursor) params.set('cursor', cursor);
      const suffix = params.size ? `?${params.toString()}` : '';
      return request(`/applications${suffix}`, { signal });
    },
    get({ applicationId, signal }) { return request(`/applications/${encodeURIComponent(applicationId)}`, { signal }); },
    startReview({ applicationId, expectedVersion, signal }) {
      return request(`/applications/${encodeURIComponent(applicationId)}/review`, {
        method: 'POST', body: { expectedVersion }, idempotencyKey: keyFactory(), signal
      });
    },
    startInterview({ applicationId, expectedVersion, signal }) {
      return request(`/applications/${encodeURIComponent(applicationId)}/interview`, {
        method: 'POST', body: { expectedVersion }, idempotencyKey: keyFactory(), signal
      });
    },
    decide({ applicationId, action, reason, interviewNote, expectedVersion, signal }) {
      return request(`/applications/${encodeURIComponent(applicationId)}/decisions`, {
        method: 'POST', body: { action, reason, interviewNote, expectedVersion }, idempotencyKey: keyFactory(), signal
      });
    },
    changeSitterStatus({ applicationId, action, reason, expectedVersion, signal }) {
      return request(`/applications/${encodeURIComponent(applicationId)}/sitter-status`, {
        method: 'POST', body: { action, reason, expectedVersion }, idempotencyKey: keyFactory(), signal
      });
    },
    documentUrl({ applicationId, documentId }) {
      if (!/^[a-f\d]{24}$/i.test(applicationId) || typeof documentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(documentId)) {
        throw new ApiError('INVALID_API_PATH');
      }
      return `/api/v1/applications/${applicationId}/documents/${encodeURIComponent(documentId)}`;
    }
  });
}

export const sitterApplicationAdminApi = createSitterApplicationAdminApi();
