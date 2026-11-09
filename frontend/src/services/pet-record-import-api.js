import { ApiError, createApiClient, SESSION_INVALIDATED_EVENT } from './api-client.js';
import { PET_CARE_LABELS } from '../utils/customer-pet-profile.js';
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
        const data = envelope.data, entries = data?.entries, warnings = data?.warnings;
        if (envelope.meta?.schemaVersion !== 1 || data?.requiresReview !== true || !Array.isArray(entries) || entries.length > 8 || !Array.isArray(warnings) || warnings.length > 8
          || warnings.some(value => typeof value !== 'string' || value.length > 400)
          || new Set(entries.map(entry => entry?.field)).size !== entries.length
          || entries.some(entry => !entry || !Object.hasOwn(PET_CARE_LABELS, entry.field) || !['KNOWN', 'UNKNOWN'].includes(entry.status)
            || typeof entry.value !== 'string' || entry.value.length > 2000 || (entry.status === 'KNOWN' ? !entry.value.trim() : entry.value !== '')
            || typeof entry.sourceText !== 'string' || !entry.sourceText.trim() || entry.sourceText.length > 400 || !Number.isSafeInteger(entry.page) || entry.page < 1 || entry.page > 1000)) throw new ApiError('INVALID_RESPONSE', response.status);
        return envelope.data;
      } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('PET_RECORD_PROVIDER_UNAVAILABLE'); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    }
  };
}
