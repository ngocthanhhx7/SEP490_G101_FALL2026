import { describe, expect, jest, test } from '@jest/globals';
import { ApiError } from '../../src/services/api-client.js';
import { createPrivateImageApi, PRIVATE_IMAGE_MAX_BYTES } from '../../src/services/private-image-api.js';

const id = 'a'.repeat(64);
const file = { size: 3, type: 'image/png', arrayBuffer: async () => new ArrayBuffer(3) };

function response(body, status = 201, headers = { 'content-type': 'application/json' }, options = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: key => headers[key] },
    body: options.body,
    json: options.json ?? (async () => body),
    blob: options.blob ?? (async () => new globalThis.Blob(['png'], { type: 'image/png' })) };
}

describe('private image API adapter', () => {
  test('sends raw image with CSRF and idempotency headers and validates the envelope', async () => {
    const fetchImpl = jest.fn(async (_path, options) => {
      expect(options.body).toBe(file);
      expect(options.headers).toMatchObject({ 'Content-Type': 'image/png', 'X-CSRF-Token': 'csrf', 'Idempotency-Key': 'private-image-command-1' });
      return response({ data: { id, state: 'READY', replayed: false }, meta: { schemaVersion: 1 } });
    });
    const api = createPrivateImageApi({ fetchImpl, getCsrfToken: () => 'csrf' });
    await expect(api.upload(file, { idempotencyKey: 'private-image-command-1' })).resolves.toMatchObject({ id, status: 201 });
  });

  test('rejects invalid input before network and maps unauthorized reads', async () => {
    const fetchImpl = jest.fn(async () => response({ error: { code: 'UNAUTHENTICATED' } }, 401));
    const unauthorized = jest.fn();
    const api = createPrivateImageApi({ fetchImpl, getCsrfToken: () => 'csrf', onUnauthorized: unauthorized });
    await expect(api.upload({ ...file, type: 'image/gif' }, { idempotencyKey: 'private-image-command-1' })).rejects.toMatchObject({ code: 'INVALID_PRIVATE_IMAGE' });
    await expect(api.upload({ ...file, size: PRIVATE_IMAGE_MAX_BYTES + 1 }, { idempotencyKey: 'private-image-command-1' })).rejects.toMatchObject({ code: 'INVALID_PRIVATE_IMAGE' });
    await expect(api.read(id)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('returns private bytes without constructing a public URL', async () => {
    const fetchImpl = jest.fn(async () => response(null, 200, { 'content-type': 'image/png' }));
    const api = createPrivateImageApi({ fetchImpl });
    const result = await api.read(id);
    expect(result.contentType).toBe('image/png');
    expect(result.blob).toBeInstanceOf(globalThis.Blob);
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/v1/private-images/${id}/content`);
  });

  test('requires CSRF for upload and validates ids', async () => {
    const api = createPrivateImageApi({ fetchImpl: jest.fn(), getCsrfToken: () => null });
    await expect(api.upload(file, { idempotencyKey: 'private-image-command-1' })).rejects.toBeInstanceOf(ApiError);
    await expect(api.read('bad')).rejects.toMatchObject({ code: 'INVALID_RESOURCE_ID' });
  });

  test('requires the caller to preserve an idempotency key across retries', async () => {
    const fetchImpl = jest.fn(async () => response({ error: { code: 'PROVIDER_UNAVAILABLE' } }, 503));
    const api = createPrivateImageApi({ fetchImpl, getCsrfToken: () => 'csrf' });
    await expect(api.upload(file)).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('retries a lost acknowledgement with the same key and uses a new key for a new command', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ error: { code: 'PROVIDER_UNAVAILABLE' } }, 503))
      .mockResolvedValueOnce(response({ data: { id, state: 'READY', replayed: true }, meta: { schemaVersion: 1 } }, 200))
      .mockResolvedValueOnce(response({ data: { id: 'b'.repeat(64), state: 'READY', replayed: false }, meta: { schemaVersion: 1 } }));
    const api = createPrivateImageApi({ fetchImpl, getCsrfToken: () => 'csrf' });
    await expect(api.upload(file, { idempotencyKey: 'private-image-command-1' })).rejects.toMatchObject({ status: 503 });
    await expect(api.upload(file, { idempotencyKey: 'private-image-command-1' })).resolves.toMatchObject({ id, status: 200 });
    await api.upload(file, { idempotencyKey: 'private-image-command-2' });
    expect(fetchImpl.mock.calls.map(([, options]) => options.headers['Idempotency-Key']))
      .toEqual(['private-image-command-1', 'private-image-command-1', 'private-image-command-2']);
  });

  test('keeps timeout through a response JSON body and cancels the body stream', async () => {
    const cancel = jest.fn(() => Promise.resolve());
    const fetchImpl = jest.fn(async () => response(null, 201, { 'content-type': 'application/json' }, {
      body: { cancel }, json: () => new Promise(() => {})
    }));
    const api = createPrivateImageApi({ fetchImpl, getCsrfToken: () => 'csrf', timeoutMs: 5 });
    await expect(api.upload(file, { idempotencyKey: 'private-image-command-1' }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test('keeps timeout through a response Blob body and maps caller abort after headers', async () => {
    const cancel = jest.fn(() => Promise.resolve());
    const fetchImpl = jest.fn(async () => response(null, 200, { 'content-type': 'image/png' }, {
      body: { cancel }, blob: () => new Promise(() => {})
    }));
    const api = createPrivateImageApi({ fetchImpl, timeoutMs: 5 });
    await expect(api.read(id)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(cancel).toHaveBeenCalledTimes(1);

    const caller = new AbortController();
    const aborted = createPrivateImageApi({ fetchImpl: jest.fn(async () => response(null, 200,
      { 'content-type': 'image/png' }, { body: { cancel }, blob: () => new Promise(() => {}) })) });
    const pending = aborted.read(id, { signal: caller.signal });
    await Promise.resolve();
    caller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });

  test('default 401 handling emits the shared session invalidation event once', async () => {
    const listener = jest.fn();
    window.addEventListener('pwc:session-invalidated', listener);
    const api = createPrivateImageApi({ fetchImpl: async () => response({ error: { code: 'UNAUTHENTICATED' } }, 401) });
    await expect(api.read(id)).rejects.toMatchObject({ status: 401 });
    window.removeEventListener('pwc:session-invalidated', listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
