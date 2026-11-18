export class ApiError extends Error {
  constructor(code, status = 0, details = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = details.fieldErrors;
    // Per-field reasons from a 422, e.g. { name: 'REQUIRED', sellingPrice: 'WHOLE_NUMBER' }.
    this.fields = details.fields;
    this.available = Number.isSafeInteger(details.available) && details.available >= 0 ? details.available : undefined;
    this.productId = /^[a-f\d]{24}$/i.test(details.productId ?? '') ? details.productId : undefined;
    this.time = typeof details.time === 'string' && Number.isFinite(Date.parse(details.time)) ? details.time : undefined;
    this.pet = typeof details.pet === 'string' && details.pet.length <= 120 ? details.pet : undefined;
    // Per-line reasons from a 422 on a list of lines, by line number from 0: { 0: { quantityReceived: 'INVALID' } }.
    this.lineFields = details.lineFields;
    this.decisionIds = details.decisionIds;
    this.retryAfterSeconds = Number.isSafeInteger(details.retryAfterSeconds) && details.retryAfterSeconds > 0 ? details.retryAfterSeconds : undefined;
    this.correlationId = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(details.correlationId ?? '') ? details.correlationId : undefined;
  }
}

export const SESSION_INVALIDATED_EVENT = 'pwc:session-invalidated';

// Same-origin only. P34 must amend the auth ADR before cross-site deployment.
export function createApiClient({ fetchImpl = fetch, getCsrfToken = () => null,
  onUnauthorized = () => {
    if (typeof window !== 'undefined') window.dispatchEvent(new window.Event(SESSION_INVALIDATED_EVENT));
  }, timeoutMs = 15000 } = {}) {
  return async function request(path, { method = 'GET', body, signal,
    idempotencyKey, expectedVersion, csrfBootstrap = false, binaryBody, productVersion } = {}) {
    if (!/^\/[a-zA-Z0-9]/.test(path) || /[\\#]/.test(path)
      || path.split(/[/?]/).includes('..') || /%2e|%2f|%5c/i.test(path)) {
      throw new ApiError('INVALID_API_PATH');
    }
    method = method.toUpperCase();
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      throw new ApiError('INVALID_METHOD');
    }
    const headers = new Headers({ Accept: 'application/json' });
    if (binaryBody !== undefined) {
      if (body !== undefined || expectedVersion !== undefined || !['image/jpeg', 'image/png', 'image/webp'].includes(binaryBody?.type)
        || !Number.isSafeInteger(binaryBody?.size) || binaryBody.size < 1 || binaryBody.size > 5 * 1024 * 1024) throw new ApiError('INVALID_PRODUCT_PHOTO', 422);
      headers.set('Content-Type', binaryBody.type);
    }
    if (productVersion !== undefined) {
      if (!Number.isSafeInteger(productVersion) || productVersion < 0) throw new ApiError('INVALID_PRODUCT_VERSION', 422);
      headers.set('X-Product-Version', String(productVersion));
    }
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const bootstrapAllowed = csrfBootstrap && method === 'POST' && ['/otp-challenges', '/sessions'].includes(path);
    if (csrfBootstrap && !bootstrapAllowed) throw new ApiError('INVALID_CSRF_MODE');
    if (!['GET'].includes(method) && !bootstrapAllowed) {
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
        body: binaryBody ?? (payload === undefined ? undefined : JSON.stringify(payload)),
      });
      if (response.status === 401) onUnauthorized();
      if (response.status === 204 && response.ok) return { data: null, status: 204 };
      let envelope;
      try { envelope = await response.json(); }
      catch { throw new ApiError(response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status, {
        retryAfterSeconds: Number(response.headers?.get('Retry-After')), correlationId: response.headers?.get('X-Request-ID')
      }); }
      if (!response.ok) {
        throw new ApiError(envelope?.error?.code || 'HTTP_ERROR', response.status, {
          fieldErrors: envelope?.error?.fieldErrors, fields: envelope?.error?.fields, lineFields: envelope?.error?.lineFields, decisionIds: envelope?.error?.decisionIds,
          available: envelope?.error?.available, productId: envelope?.error?.productId,
          time: envelope?.error?.time, pet: envelope?.error?.pet,
          retryAfterSeconds: envelope?.error?.retryAfterSeconds ?? Number(response.headers?.get('Retry-After')),
          correlationId: envelope?.meta?.correlationId ?? response.headers?.get('X-Request-ID'),
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
