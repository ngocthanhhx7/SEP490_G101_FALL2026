export class ApiError extends Error {
  constructor(code, status = 0, details = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = details.fieldErrors;
    this.decisionIds = details.decisionIds;
  }
}

// Same-origin only. P34 must amend the auth ADR before cross-site deployment.
export function createApiClient({ fetchImpl = fetch, getCsrfToken = () => null,
  onUnauthorized = () => {}, timeoutMs = 15000 } = {}) {
  return async function request(path, { method = 'GET', body, signal,
    idempotencyKey, expectedVersion } = {}) {
    if (!/^\/[a-zA-Z0-9]/.test(path) || /[\\#]/.test(path)
      || path.split(/[/?]/).includes('..') || /%2e|%2f|%5c/i.test(path)) {
      throw new ApiError('INVALID_API_PATH');
    }
    method = method.toUpperCase();
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      throw new ApiError('INVALID_METHOD');
    }
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (!['GET'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (!csrfToken) throw new ApiError('CSRF_NOT_READY');
      headers.set('X-CSRF-Token', csrfToken);
    }
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const payload = expectedVersion === undefined ? body : { ...body, expectedVersion };
      const response = await fetchImpl(`/api/v1${path}`, {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal: controller.signal,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      if (response.status === 401) onUnauthorized();
      if (response.status === 204 && response.ok) return { data: null, status: 204 };
      let envelope;
      try { envelope = await response.json(); }
      catch { throw new ApiError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status); }
      if (!response.ok) {
        throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status, {
          fieldErrors: envelope?.error?.fieldErrors, decisionIds: envelope?.error?.decisionIds,
        });
      }
      if (envelope?.meta?.schemaVersion !== 1 || !Object.hasOwn(envelope, 'data')) {
        throw new ApiError('INVALID_RESPONSE', response.status);
      }
      return { ...envelope, status: response.status, pending: response.status === 202 };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (signal?.aborted) throw new ApiError('ABORTED');
      throw new ApiError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
