import { describe, expect, jest, test } from '@jest/globals';
import { createCustomerRegistrationApi } from '../../src/services/customer-registration-api.js';

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const accepted = { data: { challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 60 }, meta: { schemaVersion: 1 } };

describe('FE-REG-02 requestOtp', () => {
  test('UTCID01 posts REGISTER purpose and returns accepted challenge DTO', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(202, accepted));
    const result = await createCustomerRegistrationApi({ fetchImpl }).requestOtp({ channel: 'EMAIL', contact: 'hello@example.test' });
    expect(result).toEqual(accepted.data);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ channel: 'EMAIL', contact: 'hello@example.test', purpose: 'REGISTER' });
  });

  test('UTCID02 rejects a non-202 or incomplete acknowledgement', async () => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockResolvedValue(response(200, { data: {}, meta: { schemaVersion: 1 } })) });
    await expect(api.requestOtp({ channel: 'EMAIL', contact: 'hello@example.test' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  test('UTCID03 maps contract errors without server message', async () => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockResolvedValue(response(429, { error: { code: 'OTP_RATE_LIMITED', retryAfterSeconds: 60, message: 'private' }, meta: { schemaVersion: 1 } })) });
    await expect(api.requestOtp({ channel: 'EMAIL', contact: 'hello@example.test' })).rejects.toMatchObject({ code: 'OTP_RATE_LIMITED', status: 429, retryAfterSeconds: 60, message: 'OTP_RATE_LIMITED' });
  });

  test('UTCID04 maps network rejection safely', async () => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockRejectedValue(new Error('offline')) });
    await expect(api.requestOtp({ channel: 'EMAIL', contact: 'hello@example.test' })).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
