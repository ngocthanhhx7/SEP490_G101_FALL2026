import { ApiError, createApiClient, SESSION_INVALIDATED_EVENT } from './api-client.js';
export function createPetRecordImportApi({ getCsrfToken, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const request = createApiClient({ getCsrfToken, fetchImpl });
  return {
    metadata: signal => request('/pet-record-import', { signal }),
    async extract(file, signal) {
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file?.type) || !file.size || file.size > 5 * 1024 * 1024) throw new ApiError('INVALID_PET_RECORD', 422);
      const token = getCsrfToken(); if (!token) throw new ApiError('CSRF_NOT_READY');
      const controller = new AbortController(), abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
      const timer = setTimeout(abort, 65000);
      try {
        const response = await fetchImpl('/api/v1/pet-record-import', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/json', 'Content-Type': file.type, 'X-CSRF-Token': token, 'X-Pet-Record-Consent': 'google-gemini' }, body: file });
        if (response.status === 401) window.dispatchEvent(new window.Event(SESSION_INVALIDATED_EVENT));
        const envelope = await response.json();
        if (!response.ok) throw new ApiError(envelope.error?.code || 'PET_RECORD_PROVIDER_UNAVAILABLE', response.status);
        if (envelope.meta?.schemaVersion !== 1 || envelope.data?.requiresReview !== true || !Array.isArray(envelope.data.entries) || envelope.data.entries.length > 8) throw new ApiError('INVALID_RESPONSE', response.status);
        return envelope.data;
      } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('PET_RECORD_PROVIDER_UNAVAILABLE'); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
  };
}
