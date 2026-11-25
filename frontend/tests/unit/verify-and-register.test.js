import { describe, expect, jest, test } from '@jest/globals';
import { createCustomerRegistrationApi } from '../../src/services/customer-registration-api.js';

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const input = { challengeId: 'challenge-1', channel: 'EMAIL', contact: 'hello@example.test', code: '123456', displayName: 'Sample User', policyVersions: { terms: 'v1', privacy: 'v1' } };

describe('FE-REG-03 verifyAndRegister', () => {
  test('UTCID01 posts verification, consent versions, and returns authenticated acknowledgement', async () => {
    const data = { authenticated: true, user: { id: 'user-1' } };
    const fetchImpl = jest.fn().mockResolvedValue(response(200, { data, meta: { schemaVersion: 1 } }));
    await expect(createCustomerRegistrationApi({ fetchImpl }).verifyAndRegister(input)).resolves.toEqual(data);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ ...input, purpose: 'REGISTER' });
  });

  test('UTCID02 rejects acknowledgement without completed authenticated user', async () => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockResolvedValue(response(200, { data: { verified: true, authenticated: false }, meta: { schemaVersion: 1 } })) });
    await expect(api.verifyAndRegister(input)).rejects.toMatchObject({ code: 'REGISTRATION_NOT_COMPLETED', status: 200 });
  });

  test.each([['UTCID03', 'OTP_INCORRECT', 400], ['UTCID04', 'CONTACT_ALREADY_LINKED', 409]])('%s maps verification/contact error', async (_id, code, status) => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockResolvedValue(response(status, { error: { code }, meta: { schemaVersion: 1 } })) });
    await expect(api.verifyAndRegister(input)).rejects.toMatchObject({ code, status });
  });

  test('UTCID05 rejects malformed success envelope', async () => {
    const api = createCustomerRegistrationApi({ fetchImpl: jest.fn().mockResolvedValue(response(200, { data: {} })) });
    await expect(api.verifyAndRegister(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });
});
