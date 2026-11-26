import { describe, expect, jest, test } from '@jest/globals';
import { ApiError } from '../../src/services/api-client.js';
import { createApiSessionAdapter } from '../../src/services/session-adapter.js';

const user = { id: 'user-1', displayName: 'Customer', roles: ['CUSTOMER'] };

describe('FE-SESSION-01 resolve', () => {
  test('UTCID01 maps authenticated session and stores CSRF', async () => {
    const request = jest.fn().mockResolvedValue({ status: 200, data: { user, csrfToken: 'csrf-1' } });
    const adapter = createApiSessionAdapter({ request });
    await expect(adapter.resolve()).resolves.toEqual({ status: 'authenticated', user });
    expect(adapter.getCsrfToken()).toBe('csrf-1');
  });

  test('UTCID02 forwards caller AbortSignal to GET /me', async () => {
    const controller = new AbortController(); const request = jest.fn().mockResolvedValue({ status: 200, data: { user } });
    await createApiSessionAdapter({ request }).resolve({ signal: controller.signal });
    expect(request).toHaveBeenCalledWith('/me', { signal: controller.signal });
  });

  test('UTCID03 maps only HTTP 401 to guest and clears CSRF', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: { user, csrfToken: 'csrf-1' } })
      .mockRejectedValueOnce(new ApiError('UNAUTHENTICATED', 401));
    const adapter = createApiSessionAdapter({ request });
    await adapter.resolve();
    await expect(adapter.resolve()).resolves.toEqual({ status: 'guest' });
    expect(adapter.getCsrfToken()).toBeNull();
  });

  test('UTCID04 rejects malformed user DTO', async () => {
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 200, data: { user: { ...user, roles: ['ROOT'] } } }) });
    await expect(adapter.resolve()).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  test('UTCID05 propagates non-401 API error', async () => {
    const error = new ApiError('HTTP_ERROR', 503);
    await expect(createApiSessionAdapter({ request: jest.fn().mockRejectedValue(error) }).resolve()).rejects.toBe(error);
  });
});
