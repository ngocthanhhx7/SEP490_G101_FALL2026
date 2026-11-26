import { describe, expect, jest, test } from '@jest/globals';
import { createApiClient } from '../../src/services/api-client.js';

const envelope = data => ({ data, meta: { schemaVersion: 1 } });
const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

describe('FE-HTTP-01 request', () => {
  test('UTCID01 sends a safe GET with same-origin transport options', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(200, envelope([])));
    const request = createApiClient({ fetchImpl });
    await expect(request('/services')).resolves.toMatchObject({ data: [], status: 200, pending: false });
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/services', expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  });

  test.each([['UTCID02', 'https://bad.test', 'INVALID_API_PATH'], ['UTCID03', '/a/../me', 'INVALID_API_PATH'], ['UTCID04', '/me', 'INVALID_METHOD']])('%s rejects invalid path or method before fetch', async (_id, path, code) => {
    const fetchImpl = jest.fn();
    await expect(createApiClient({ fetchImpl })(path, { method: code === 'INVALID_METHOD' ? 'TRACE' : 'GET' })).rejects.toMatchObject({ code });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('UTCID05 requires CSRF for ordinary mutations and sends payload, version, and key when supplied', async () => {
    const blocked = createApiClient({ fetchImpl: jest.fn() });
    await expect(blocked('/bookings', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
    const fetchImpl = jest.fn().mockResolvedValue(response(202, envelope({ operationId: 'op-1' })));
    const result = await createApiClient({ fetchImpl, getCsrfToken: () => 'csrf-1' })('/bookings', { method: 'POST', body: { petIds: [] }, expectedVersion: 2, idempotencyKey: 'key-1' });
    expect(result.pending).toBe(true);
    const options = fetchImpl.mock.calls[0][1];
    expect(options.headers.get('X-CSRF-Token')).toBe('csrf-1');
    expect(options.headers.get('Idempotency-Key')).toBe('key-1');
    expect(JSON.parse(options.body)).toEqual({ petIds: [], expectedVersion: 2 });
  });

  test('UTCID06 permits only LOGIN bootstrap POSTs without CSRF', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(202, envelope({ challengeId: 'challenge-1' })));
    await expect(createApiClient({ fetchImpl })('/otp-challenges', { method: 'POST', body: {}, csrfBootstrap: true })).resolves.toMatchObject({ pending: true });
    expect(fetchImpl.mock.calls[0][1].headers.has('X-CSRF-Token')).toBe(false);
    await expect(createApiClient({ fetchImpl })('/bookings', { method: 'POST', body: {}, csrfBootstrap: true })).rejects.toMatchObject({ code: 'INVALID_CSRF_MODE' });
  });

  test('UTCID07 invokes unauthorized callback for 401 and maps HTTP error details', async () => {
    const onUnauthorized = jest.fn();
    const fetchImpl = jest.fn().mockResolvedValue(response(401, { error: { code: 'UNAUTHENTICATED' }, meta: { correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }));
    await expect(createApiClient({ fetchImpl, onUnauthorized })('/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('UTCID08 returns no-content acknowledgement for 204', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(204));
    await expect(createApiClient({ fetchImpl, getCsrfToken: () => 'csrf-1' })('/sessions/current', { method: 'DELETE' })).resolves.toEqual({ data: null, status: 204 });
  });

  test('UTCID09 rejects malformed success envelopes', async () => {
    await expect(createApiClient({ fetchImpl: jest.fn().mockResolvedValue(response(200, { data: [] })) })('/services')).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  test('UTCID10 maps timeout without retrying the request', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
      const request = createApiClient({ fetchImpl, timeoutMs: 25, getCsrfToken: () => 'csrf-1' });
      const pending = expect(request('/bookings', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'TIMEOUT' });
      await jest.advanceTimersByTimeAsync(25);
      await pending;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally { jest.useRealTimers(); }
  });

  test('UTCID11 distinguishes caller abort from network failure', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(createApiClient({ fetchImpl: async () => { throw new DOMException('Abort', 'AbortError'); } })('/me', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    await expect(createApiClient({ fetchImpl: async () => { throw Error('offline'); } })('/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
