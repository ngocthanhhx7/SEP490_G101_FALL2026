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

  test('delegates CSRF-backed logout to the injected session request', async () => {
    const request = jest.fn(async () => ({ data: null, status: 204 }));
    const getCsrfToken = () => 'synthetic-csrf-token';
    const adapter = createApiSessionAdapter({ request, getCsrfToken });
    expect(adapter.getCsrfToken()).toBe('synthetic-csrf-token');
    await adapter.logout();
    expect(request).toHaveBeenCalledWith('/sessions/current', { method: 'DELETE' });
  });

  test('requests a login OTP and establishes a session', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ data: { challengeId: 'challenge-1', resendAfterSeconds: 60 }, status: 202 })
      .mockResolvedValueOnce({ data: {
        authenticated: true, csrfToken: 'csrf-1', user: {
          id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer', roles: ['CUSTOMER']
        }
      }, status: 200 });
    const adapter = createApiSessionAdapter({ request });
    await expect(adapter.requestLoginOtp({ channel: 'EMAIL', contact: 'person@example.test' }))
      .resolves.toMatchObject({ challengeId: 'challenge-1' });
    await expect(adapter.login({ challengeId: 'challenge-1', channel: 'EMAIL', contact: 'person@example.test', code: '123456' }))
      .resolves.toEqual({ status: 'authenticated', user: {
        id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer', roles: ['CUSTOMER']
      } });
    expect(request).toHaveBeenNthCalledWith(1, '/otp-challenges', {
      method: 'POST', body: { channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN' }, csrfBootstrap: true
    });
    expect(request).toHaveBeenNthCalledWith(2, '/sessions', {
      method: 'POST', body: { challengeId: 'challenge-1', channel: 'EMAIL', contact: 'person@example.test', purpose: 'LOGIN', code: '123456' }, csrfBootstrap: true
    });
    expect(adapter.getCsrfToken()).toBe('csrf-1');
  });
});


test('restores in-memory CSRF after browser reload and clears it after logout', async () => {
  const request = jest.fn().mockResolvedValueOnce({ data: { csrfToken: 'resumed-csrf', user: {
    id: 'synthetic-customer', displayName: 'Customer', roles: ['CUSTOMER']
  } } }).mockResolvedValueOnce({ status: 204 });
  const adapter = createApiSessionAdapter({ request });
  expect(adapter.getCsrfToken()).toBeNull();
  await adapter.resolve();
  expect(adapter.getCsrfToken()).toBe('resumed-csrf');
  await adapter.logout();
  expect(adapter.getCsrfToken()).toBeNull();
});

test.each(['login', 'logout'])('late session reads cannot overwrite CSRF after %s', async action => {
  let finish;
  const user = { id: 'synthetic', displayName: 'Customer', roles: ['CUSTOMER'] };
  const request = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ status: 200, data: { authenticated: true, user, csrfToken: 'new-csrf' } });
  const adapter = createApiSessionAdapter({ request });
  const pending = adapter.resolve();
  await adapter[action]();
  finish({ data: { user, csrfToken: 'stale-csrf' } });
  await pending;
  expect(adapter.getCsrfToken()).toBe(action === 'login' ? 'new-csrf' : null);
});

test('a late unauthorized session read cannot erase a successful login CSRF', async () => {
  let reject;
  const user = { id: 'synthetic', displayName: 'Customer', roles: ['CUSTOMER'] };
  const request = jest.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
    .mockResolvedValueOnce({ status: 200, data: { authenticated: true, user, csrfToken: 'new-csrf' } });
  const adapter = createApiSessionAdapter({ request });
  const pending = adapter.resolve();
  await adapter.login();
  reject(new ApiError('UNAUTHENTICATED', 401));
  await pending;
  expect(adapter.getCsrfToken()).toBe('new-csrf');
});
