import { ApiError, createApiClient } from './api-client.js';
import { apiSessionAdapter } from './session-adapter.js';

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
  getCsrfToken = () => apiSessionAdapter.getCsrfToken(),
  timeoutMs = 15000 } = {}) {
  if (typeof fetchImpl !== 'function' || (uploadDocumentImpl !== undefined && typeof uploadDocumentImpl !== 'function')
    || typeof keyFactory !== 'function') throw new TypeError('Sitter application API dependencies are invalid');

  async function uploadDocument(file, { signal, documentType } = {}) {
    if (!uploadDocumentImpl) throw new ApiError('PROVIDER_UNAVAILABLE', 503);
    return uploadDocumentImpl(file, { signal, documentType });
  }

  async function submit(body, { signal, key = keyFactory() } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const csrfToken = getCsrfToken();
      if (!csrfToken) throw new ApiError('CSRF_UNAVAILABLE');
      const response = await fetchImpl('/api/v1/applications', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': key, 'X-CSRF-Token': csrfToken },
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: controller.signal, body: JSON.stringify(body)
      });
      let envelope;
      try { envelope = await response.json(); }
      catch { throw new ApiError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status); }
      if (!response.ok) throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status, {
        fieldErrors: envelope?.error?.fieldErrors
      });
      if (envelope?.meta?.schemaVersion !== 1 || !envelope?.data || typeof envelope.data.id !== 'string'
        || !/^[A-Za-z0-9_-]{22,128}$/.test(envelope.data.applicationCode ?? '')
        || !['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'REJECTED'].includes(envelope.data.state)) {
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

  const request = createApiClient({ fetchImpl, getCsrfToken });
  return Object.freeze({ uploadDocument, submit, createIdempotencyKey: keyFactory, uploadsAvailable: Boolean(uploadDocumentImpl),
    async loadIntake({ signal } = {}) { return request('/applications/intake', { signal }); } });
}

const uploadKeys = new WeakMap();
async function uploadApplicantImage(file, { signal } = {}) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    throw new ApiError('INVALID_DOCUMENT', 422);
  }
  const csrf = apiSessionAdapter.getCsrfToken();
  if (!csrf) throw new ApiError('CSRF_UNAVAILABLE');
  if (!uploadKeys.has(file)) uploadKeys.set(file, idempotencyKey());
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetchFromCurrentRuntime('/api/v1/applicant-documents', {
      method: 'POST', body: file, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': file.type, 'X-CSRF-Token': csrf, 'Idempotency-Key': uploadKeys.get(file) }
    });
    const result = await response.json();
    if (!response.ok) throw new ApiError(result?.error?.code ?? 'HTTP_ERROR', response.status, { fieldErrors: result?.error?.fieldErrors });
    if (result?.meta?.schemaVersion !== 1 || result.data?.state !== 'READY' || !/^[a-f0-9]{64}$/.test(result.data?.id)) {
      throw new ApiError('INVALID_RESPONSE');
    }
    return { documentId: result.data.id, storageRef: result.data.id };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(signal?.aborted ? 'ABORTED' : controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export const sitterApplicationApi = createSitterApplicationApi({ uploadDocumentImpl: uploadApplicantImage });

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
