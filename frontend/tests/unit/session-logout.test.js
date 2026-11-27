import { describe, expect, jest, test } from '@jest/globals';
import { createApiSessionAdapter } from '../../src/services/session-adapter.js';

describe('FE-SESSION-04 logout', () => {
  test('UTCID01 deletes the current session and clears the in-memory CSRF token', async () => {
    // Arrange
    const request = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: { authenticated: true, csrfToken: 'csrf-1', user: { id: 'id-1', displayName: 'Customer', roles: ['CUSTOMER'] } } })
      .mockResolvedValueOnce({ status: 204, data: null });
    const adapter = createApiSessionAdapter({ request });
    await adapter.login();

    // Act
    const result = await adapter.logout();

    // Assert
    expect(result).toBeUndefined();
    expect(request).toHaveBeenLastCalledWith('/sessions/current', { method: 'DELETE' });
    expect(adapter.getCsrfToken()).toBeNull();
  });

  test('UTCID02 propagates a logout network error and keeps the existing CSRF token', async () => {
    // Arrange
    const error = new Error('NETWORK_ERROR');
    const request = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: { authenticated: true, csrfToken: 'csrf-1', user: { id: 'id-1', displayName: 'Customer', roles: ['CUSTOMER'] } } })
      .mockRejectedValueOnce(error);
    const adapter = createApiSessionAdapter({ request });
    await adapter.login();

    // Act / Assert
    await expect(adapter.logout()).rejects.toBe(error);
    expect(adapter.getCsrfToken()).toBe('csrf-1');
  });
});
