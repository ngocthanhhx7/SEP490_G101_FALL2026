import { describe, expect, jest, test } from '@jest/globals';
import { createApiSessionAdapter } from '../../src/services/session-adapter.js';

describe('FE-SESSION-02 requestLoginOtp', () => {
  test.each([
    ['UTCID01', 'EMAIL', 'customer@example.test'],
    ['UTCID02', 'PHONE', '+84912345678']
  ])('%s posts the supplied %s contact as a LOGIN challenge bootstrap', async (_id, channel, contact) => {
    // Arrange
    const request = jest.fn().mockResolvedValue({ status: 202, data: { challengeId: 'challenge-1', resendAfterSeconds: 60 } });
    const adapter = createApiSessionAdapter({ request });

    // Act
    const result = await adapter.requestLoginOtp({ channel, contact });

    // Assert
    expect(result).toEqual({ challengeId: 'challenge-1', resendAfterSeconds: 60 });
    expect(request).toHaveBeenCalledWith('/otp-challenges', {
      method: 'POST', body: { channel, contact, purpose: 'LOGIN' }, csrfBootstrap: true
    });
  });

  test('UTCID03 returns the acknowledgement DTO unchanged', async () => {
    // Arrange
    const data = { challengeId: 'challenge-2', expiresInSeconds: 300, resendAfterSeconds: 60 };
    const adapter = createApiSessionAdapter({ request: jest.fn().mockResolvedValue({ status: 202, data }) });

    // Act
    const result = await adapter.requestLoginOtp({ channel: 'EMAIL', contact: 'customer@example.test' });

    // Assert
    expect(result).toBe(data);
  });

  test('UTCID04 propagates a network error without creating an acknowledgement', async () => {
    // Arrange
    const error = new Error('NETWORK_ERROR');
    const adapter = createApiSessionAdapter({ request: jest.fn().mockRejectedValue(error) });

    // Act / Assert
    await expect(adapter.requestLoginOtp({ channel: 'EMAIL', contact: 'customer@example.test' })).rejects.toBe(error);
  });
});
