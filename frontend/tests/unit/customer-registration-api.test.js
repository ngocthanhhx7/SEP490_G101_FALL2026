import { createCustomerRegistrationApi, normalizeDisplayName, normalizeRegistrationContact,
  RegistrationApiError } from '../../src/services/customer-registration-api.js';

function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test('canonicalizes email and Vietnamese phone without storing a password', () => {
  expect(normalizeDisplayName('  Nguyễn   Văn A ')).toBe('Nguyễn Văn A');
  expect(normalizeRegistrationContact('EMAIL', ' HELLO@PawWorld.com ')).toBe('hello@pawworld.com');
  expect(normalizeRegistrationContact('PHONE', '0912 345 678')).toBe('+84912345678');
  expect(normalizeRegistrationContact('PHONE', '+1 (202) 555-0123')).toBe('+12025550123');
  expect(normalizeRegistrationContact('EMAIL', 'bad-address')).toBeNull();
  expect(normalizeRegistrationContact('PHONE', '123')).toBeNull();
});

test('uses same-origin guest requests and reports accepted OTP as pending', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(202, {
    data: { challengeId: 'challenge-id', expiresInSeconds: 300, resendAfterSeconds: 60 },
    meta: { schemaVersion: 1 },
  }));
  const api = createCustomerRegistrationApi({ fetchImpl });
  await expect(api.requestOtp({ channel: 'EMAIL', contact: 'hello@pawworld.com' }))
    .resolves.toMatchObject({ challengeId: 'challenge-id', expiresInSeconds: 300 });
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/otp-challenges', expect.objectContaining({
    method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
  }));
  const [, request] = fetchImpl.mock.calls[0];
  expect(request.headers).not.toHaveProperty('X-CSRF-Token');
  expect(JSON.parse(request.body)).toEqual({ channel: 'EMAIL', contact: 'hello@pawworld.com', purpose: 'REGISTER' });
  expect(JSON.stringify(request.body)).not.toMatch(/password/i);
});

test('accepts session only when registration response explicitly confirms it', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(response(200, { data: { authenticated: true, user: { id: 'synthetic-id' } }, meta: { schemaVersion: 1 } }))
    .mockResolvedValueOnce(response(200, { data: { verified: true, authenticated: false }, meta: { schemaVersion: 1 } }));
  const api = createCustomerRegistrationApi({ fetchImpl });
  await expect(api.verifyAndRegister({ challengeId: 'id', channel: 'EMAIL', contact: 'a@example.invalid', code: '012345', displayName: 'Sample' }))
    .resolves.toMatchObject({ authenticated: true });
  await expect(api.verifyAndRegister({ challengeId: 'id', channel: 'EMAIL', contact: 'a@example.invalid', code: '012345', displayName: 'Sample' }))
    .rejects.toMatchObject({ code: 'REGISTRATION_NOT_COMPLETED' });
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
    challengeId: 'id', channel: 'EMAIL', contact: 'a@example.invalid', purpose: 'REGISTER', code: '012345', displayName: 'Sample',
  });
});

test('maps HTTP rate limits and hides response details from the public error', async () => {
  const api = createCustomerRegistrationApi({ fetchImpl: async () => response(429, {
    error: { code: 'OTP_RATE_LIMITED', message: 'Private message', retryAfterSeconds: 60 }, meta: { schemaVersion: 1 },
  }) });
  await expect(api.requestOtp({ channel: 'PHONE', contact: '+84912345678' }))
    .rejects.toMatchObject({ code: 'OTP_RATE_LIMITED', status: 429, retryAfterSeconds: 60 });
});

test('rejects malformed envelopes and maps network failure safely', async () => {
  const malformed = createCustomerRegistrationApi({ fetchImpl: async () => response(200, { data: {} }) });
  await expect(malformed.requestOtp({ channel: 'EMAIL', contact: 'a@example.invalid' }))
    .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  const unavailable = createCustomerRegistrationApi({ fetchImpl: async () => { throw Error('provider credentials'); } });
  await expect(unavailable.requestOtp({ channel: 'EMAIL', contact: 'a@example.invalid' }))
    .rejects.toBeInstanceOf(RegistrationApiError);
  await expect(unavailable.requestOtp({ channel: 'EMAIL', contact: 'a@example.invalid' }))
    .rejects.toMatchObject({ code: 'NETWORK_ERROR' });
});
