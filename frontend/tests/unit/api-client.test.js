import { ApiError, createApiClient } from '../../src/services/api-client.js';

const envelope = (data = []) => ({ data, meta: { schemaVersion: 1 } });
const response = (status, data) => ({ status, ok: status >= 200 && status < 300,
  json: async () => data });

test('reads v1 DTO with same-origin cookie and no private cache', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(200, envelope([])));
  expect(await createApiClient({ fetchImpl })('/services')).toMatchObject({ data: [], pending: false });
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/services', expect.objectContaining({
    credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  }));
});

test.each(['https://example.com', '//example.com', '/a/../sessions', '/%2e%2e/me', '/a\\b', '/me#x'])
('rejects unsafe path %s before fetching', async (path) => {
  const fetchImpl = jest.fn();
  await expect(createApiClient({ fetchImpl })(path)).rejects.toMatchObject({ code: 'INVALID_API_PATH' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('blocks writes until CSRF is ready', async () => {
  const fetchImpl = jest.fn();
  await expect(createApiClient({ fetchImpl })('/bookings', { method: 'POST', body: {} }))
    .rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('carries CSRF, stable operation key and expected version without automatic replay', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(202, envelope({ operationId: 'synthetic' })));
  const result = await createApiClient({ fetchImpl, getCsrfToken: () => 'synthetic-csrf' })
    ('/bookings', { method: 'POST', body: { petIds: [] }, expectedVersion: 2, idempotencyKey: 'synthetic-op' });
  expect(result.pending).toBe(true);
  const options = fetchImpl.mock.calls[0][1];
  expect(options.headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  expect(options.headers.get('Idempotency-Key')).toBe('synthetic-op');
  expect(JSON.parse(options.body).expectedVersion).toBe(2);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each([401, 403, 409, 422, 503])('preserves HTTP failure %s and safe error details', async (status) => {
  const onUnauthorized = jest.fn();
  const fetchImpl = jest.fn().mockResolvedValue(response(status, {
    error: { code: 'SYNTHETIC_ERROR', message: 'do not display server detail', decisionIds: ['FIN-01'] },
  }));
  await expect(createApiClient({ fetchImpl, onUnauthorized })('/me')).rejects.toMatchObject({
    status, code: 'SYNTHETIC_ERROR', decisionIds: ['FIN-01'], message: 'SYNTHETIC_ERROR',
  });
  expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
});

test('401 invalidates session even when server returns HTML', async () => {
  const onUnauthorized = jest.fn();
  const fetchImpl = jest.fn().mockResolvedValue({ status: 401, ok: false, json: async () => { throw Error(); } });
  await expect(createApiClient({ fetchImpl, onUnauthorized })('/me')).rejects.toMatchObject({ status: 401 });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test('rejects malformed success and supports no-content logout', async () => {
  await expect(createApiClient({ fetchImpl: async () => response(200, { data: [] }) })('/services'))
    .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(await createApiClient({ fetchImpl: async () => response(204), getCsrfToken: () => 'synthetic' })
    ('/sessions/current', { method: 'DELETE' })).toEqual({ data: null, status: 204 });
});

test('timeout aborts request and never retries mutation after lost acknowledgement', async () => {
  jest.useFakeTimers();
  try {
    const fetchImpl = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const request = createApiClient({ fetchImpl, timeoutMs: 25, getCsrfToken: () => 'synthetic' });
    const check = expect(request('/bookings', { method: 'POST', body: {}, idempotencyKey: 'synthetic' }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    await jest.advanceTimersByTimeAsync(25);
    await check;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

test('caller cancellation differs from network failure', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchImpl = async () => { throw new DOMException('Aborted', 'AbortError'); };
  await expect(createApiClient({ fetchImpl })('/me', { signal: controller.signal }))
    .rejects.toMatchObject({ code: 'ABORTED' });
  await expect(createApiClient({ fetchImpl: async () => { throw Error(); } })('/me'))
    .rejects.toBeInstanceOf(ApiError);
});
