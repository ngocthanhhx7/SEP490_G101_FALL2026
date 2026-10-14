import { describe, expect, jest, test } from '@jest/globals';
import { ApiError } from '../../src/services/api-client.js';
import { createApiSessionAdapter } from '../../src/services/session-adapter.js';

describe('API session adapter', () => {
  test('maps the authenticated GET /me projection without exposing extra fields', async () => {
    const request = jest.fn(async () => ({ data: { user: {
      id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer',
      roles: ['CUSTOMER', 'CUSTOMER'], contact: 'private@example.test'
    } }, status: 200 }));
    const adapter = createApiSessionAdapter({ request });
    const signal = new AbortController().signal;

    await expect(adapter.resolve({ signal })).resolves.toEqual({ status: 'authenticated', user: {
      id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer', roles: ['CUSTOMER']
    } });
    expect(request).toHaveBeenCalledWith('/me', { signal });
  });

  test('maps only HTTP 401 to guest and leaves unavailable API as an error', async () => {
    const unauthorized = createApiSessionAdapter({
      request: async () => { throw new ApiError('UNAUTHENTICATED', 401); }
    });
    await expect(unauthorized.resolve()).resolves.toEqual({ status: 'guest' });

    const unavailable = createApiSessionAdapter({
      request: async () => { throw new ApiError('HTTP_ERROR', 503); }
    });
    await expect(unavailable.resolve()).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 503 });
  });

  test('rejects malformed and unrecognized role data', async () => {
    const adapter = createApiSessionAdapter({ request: async () => ({ data: { user: {
      id: 'synthetic-id', displayName: 'Synthetic User', roles: ['ROOT']
    } }, status: 200 }) });
    await expect(adapter.resolve()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
