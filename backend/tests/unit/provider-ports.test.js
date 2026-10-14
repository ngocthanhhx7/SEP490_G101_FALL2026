import { describe, expect, jest, test } from '@jest/globals';
import { createProviderPortOverrides } from '../../src/config/provider-ports.js';

const fallback = { send: jest.fn(async () => ({ status: 'FAILED', code: 'PROVIDER_UNAVAILABLE' })) };
const contact = '+84912345678';
const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('P11/P12 provider port composition', () => {
  test('preserves the fail-closed base when both providers are disabled', () => {
    expect(createProviderPortOverrides({
      env: { EMAIL_ENABLED: 'false', SMS_ENABLED: 'false' }, fallbackContactDelivery: fallback
    })).toEqual({});
  });

  test('routes email to SMTP and maps PHONE to SMS without real network calls', async () => {
    const mails = [];
    const smsRequests = [];
    const overrides = createProviderPortOverrides({
      env: {
        EMAIL_ENABLED: 'true', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587',
        SMTP_USER: 'synthetic-user', SMTP_PASSWORD: 'synthetic-password', EMAIL_FROM: 'noreply@example.test',
        SMS_ENABLED: 'true', ESMS_API_KEY: 'synthetic-key', ESMS_SECRET_KEY: 'synthetic-secret',
        ESMS_BRANDNAME: 'Paw Care', ESMS_SANDBOX: 'true'
      },
      fallbackContactDelivery: fallback,
      createTransport: () => ({
        sendMail: async mail => { mails.push(mail); return { accepted: [mail.to], rejected: [] }; },
        close() {}
      }),
      fetchImpl: async (_url, options) => {
        smsRequests.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ CodeResult: '100' }) };
      }
    });

    const emailCommand = {
      kind: 'OTP', channel: 'EMAIL', to: 'owner@example.test', purpose: 'LOGIN',
      operationId, code: '004201', expiresAt: new Date(Date.now() + 60000).toISOString()
    };
    const phoneCommand = {
      kind: 'OTP', channel: 'PHONE', to: contact, purpose: 'LOGIN',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: '004202',
      expiresAt: new Date(Date.now() + 60000).toISOString()
    };

    await expect(overrides.contactDelivery.send(emailCommand)).resolves.toMatchObject({ status: 'ACCEPTED' });
    await expect(overrides.contactDelivery.send(phoneCommand)).resolves.toMatchObject({
      status: 'FAILED', code: 'SANDBOX_VALIDATED'
    });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: emailCommand.to, subject: expect.any(String) });
    expect(smsRequests).toHaveLength(1);
    expect(smsRequests[0]).toMatchObject({ Phone: '84912345678', Sandbox: '1' });
    expect(JSON.stringify(smsRequests[0])).toContain(phoneCommand.code);
    expect(fallback.send).not.toHaveBeenCalled();
  });
});
