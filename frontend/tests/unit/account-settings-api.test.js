import { describe, expect, jest, test } from '@jest/globals';
import { ApiError } from '../../src/services/api-client.js';
import { createAccountSettingsApi } from '../../src/services/account-settings-api.js';

describe('account settings API adapter', () => {
  test('reads only the contact projection attached to the current /me response', async () => {
    const contacts = [{ id: 'contact-1', channel: 'EMAIL', value: 'p*****@example.test',
      state: 'VERIFIED', verifiedAt: '2026-10-14T00:00:00.000Z' }];
    const request = jest.fn(async () => ({ data: { user: { id: 'self' }, contacts }, status: 200 }));
    const api = createAccountSettingsApi({ request });

    await expect(api.getContacts()).resolves.toEqual(contacts);
    expect(request).toHaveBeenCalledWith('/me', { signal: undefined });
    expect(JSON.stringify(request.mock.calls)).not.toContain('person@example.test');
  });

  test('starts and verifies an OTP challenge using the CONTACT_CHANGE purpose', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ data: { challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 60 }, status: 202 })
      .mockResolvedValueOnce({ data: { verified: true }, status: 200 });
    const api = createAccountSettingsApi({ request });

    await expect(api.requestContactOtp({ channel: 'PHONE', contact: '+84912345678' }))
      .resolves.toMatchObject({ challengeId: 'challenge-1' });
    await expect(api.verifyContact({ challengeId: 'challenge-1', channel: 'PHONE', contact: '+84912345678', code: '123456' }))
      .resolves.toEqual({ verified: true });
    expect(request).toHaveBeenNthCalledWith(1, '/me/contact-changes', {
      method: 'POST', body: { channel: 'PHONE', contact: '+84912345678' }
    });
    expect(request).toHaveBeenNthCalledWith(2, '/me/contact-verifications', {
      method: 'POST', body: { challengeId: 'challenge-1', channel: 'PHONE',
        contact: '+84912345678', purpose: 'CONTACT_CHANGE', code: '123456' }
    });
  });

  test('fails closed when the server response is missing the masked projection', async () => {
    const api = createAccountSettingsApi({ request: async () => ({ data: { contacts: [
      { id: 'contact-1', channel: 'EMAIL', value: 'person@example.test', state: 'VERIFIED' }
    ] }, status: 200 }) });

    await expect(api.getContacts()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('rejects an unverified challenge response', async () => {
    const api = createAccountSettingsApi({ request: async () => ({ data: { verified: false }, status: 200 }) });
    await expect(api.verifyContact({ challengeId: 'challenge-1', channel: 'EMAIL', contact: 'a@example.test', code: '123456' }))
      .rejects.toMatchObject({ code: 'OTP_INVALID_OR_EXPIRED' });
    await expect(api.verifyContact({ challengeId: 'challenge-1', channel: 'EMAIL', contact: 'a@example.test', code: 'bad' }))
      .rejects.toBeInstanceOf(ApiError);
  });
});
