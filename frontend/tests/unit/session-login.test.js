import { describe, expect, jest, test } from '@jest/globals';
import { ApiError } from '../../src/services/api-client.js';
import { createApiSessionAdapter } from '../../src/services/session-adapter.js';

const user = { id: '507f1f77bcf86cd799439011', displayName: 'Synthetic Customer', roles: ['CUSTOMER'] };
const credentials = { challengeId: 'challenge-1', channel: 'EMAIL', contact: 'customer@example.test', code: '123456' };

describe('FE-SESSION-03 login', () => {
  test('UTCID01 posts LOGIN credentials and stores CSRF after authenticated acknowledgement', async () => {
    // Arrange
    const request = jest.fn().mockResolvedValue({ status: 200, data: { authenticated: true, csrfToken: 'csrf-1', user } });
    const adapter = createApiSessionAdapter({ request });

    // Act
    const result = await adapter.login(credentials);

    // Assert
    expect(result).toEqual({ status: 'authenticated', user });
    expect(adapter.getCsrfToken()).toBe('csrf-1');
    expect(request).toHaveBeenCalledWith('/sessions', {
      method: 'POST', body: { ...credentials, purpose: 'LOGIN' }, csrfBootstrap: true
    });
  });

  test('UTCID02 includes rememberDevice only when supplied', async () => {
    // Arrange
    const request = jest.fn().mockResolvedValue({ status: 200, data: { authenticated: true, csrfToken: 'csrf-1', user } });
    const adapter = createApiSessionAdapter({ request });

    // Act
    await adapter.login({ ...credentials, rememberDevice: true });

    // Assert
    expect(request).toHaveBeenCalledWith('/sessions', expect.objectContaining({
      body: { ...credentials, purpose: 'LOGIN', rememberDevice: true }
    }));
  });

  test('UTCID03 returns registration guidance only when the acknowledgement says so', async () => {
    // Arrange
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 200, data: { authenticated: false, reason: 'REGISTRATION_REQUIRED' } }) });

    // Act
    const result = await adapter.login(credentials);

    // Assert
    expect(result).toEqual({ status: 'guest', reason: 'REGISTRATION_REQUIRED' });
    expect(adapter.getCsrfToken()).toBeNull();
  });

  test('UTCID04 maps a non-authenticated acknowledgement without registration reason to guest', async () => {
    // Arrange
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 200, data: { authenticated: false, reason: 'OTP_INCORRECT' } }) });

    // Act
    const result = await adapter.login(credentials);

    // Assert
    expect(result).toEqual({ status: 'guest' });
  });

  test('UTCID05 rejects an authenticated acknowledgement missing CSRF', async () => {
    // Arrange
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 200, data: { authenticated: true, user } }) });

    // Act / Assert
    await expect(adapter.login(credentials)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  test('UTCID06 rejects an authenticated acknowledgement with an invalid user DTO', async () => {
    // Arrange
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 200, data: { authenticated: true, csrfToken: 'csrf-1', user: { ...user, roles: ['ROOT'] } } }) });

    // Act / Assert
    await expect(adapter.login(credentials)).rejects.toBeInstanceOf(ApiError);
    expect(adapter.getCsrfToken()).toBeNull();
  });
});
