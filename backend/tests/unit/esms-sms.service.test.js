import { describe, expect, jest, test } from '@jest/globals';
import { AppError } from '../../src/utils/app-error.js';
import { createSmsPortOverrides, loadEsmsConfig } from '../../src/services/esms-sms.service.js';

const validEnv = { SMS_ENABLED: 'true', ESMS_API_KEY: 'synthetic-api-key', ESMS_SECRET_KEY: 'synthetic-secret',
  ESMS_BRANDNAME: 'PawWorld', SMS_TIMEOUT_MS: '10000', ESMS_SANDBOX: 'false' };

describe('eSMS configuration and contact delivery port', () => {
  test('disabled returns null and leaves P02 fail-closed provider in place', () => {
    expect(loadEsmsConfig({})).toBeNull();
    expect(loadEsmsConfig({ SMS_ENABLED: 'false' })).toBeNull();
    expect(createSmsPortOverrides({ env: { SMS_ENABLED: 'false' } })).toEqual({});
  });

  test('validates missing credentials and bounded timeout without exposing values', () => {
    expect(() => loadEsmsConfig({ ...validEnv, ESMS_SECRET_KEY: '' })).toThrow(AppError);
    expect(() => loadEsmsConfig({ ...validEnv, SMS_TIMEOUT_MS: '99999' })).toThrow(AppError);
    try { loadEsmsConfig({ ...validEnv, ESMS_API_KEY: '' }); } catch (error) {
      expect(error.code).toBe('SMS_CONFIGURATION_INVALID');
      expect(error.details.fields).toContain('ESMS_API_KEY');
      expect(JSON.stringify(error)).not.toContain('synthetic-secret');
    }
  });

  test('routes only SMS OTP commands and uses injected fake provider', async () => {
    const fetchImpl = jest.fn(async () => ({ status: 200, ok: true, json: async () => ({ CodeResult: '100' }) }));
    const { contactDelivery } = createSmsPortOverrides({ env: validEnv, fetchImpl, clock: () => Date.parse('2026-10-14T00:00:00.000Z') });
    const invalid = await contactDelivery.send({ channel: 'EMAIL', kind: 'OTP' });
    expect(invalid.code).toBe('INVALID_REQUEST');
    const result = await contactDelivery.send({ channel: 'SMS', kind: 'OTP', to: '+84901234567',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'REGISTER', code: '012345',
      expiresAt: '2026-10-14T00:05:00.000Z' });
    expect(result.status).toBe('ACCEPTED');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
