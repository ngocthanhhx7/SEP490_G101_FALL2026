import { describe, expect, jest, test } from '@jest/globals';
import { createSmsDelivery } from '../../src/services/sms-delivery.service.js';

const NOW = Date.parse('2026-10-14T00:00:00.000Z');
const command = overrides => ({ channel: 'SMS', kind: 'OTP', to: '+84901234567',
  operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', purpose: 'LOGIN', code: '012345',
  expiresAt: new Date(NOW + 300000).toISOString(), ...overrides });
const response = (CodeResult, status = 200) => ({ status, ok: status >= 200 && status < 300,
  json: async () => ({ CodeResult, SMSID: 'synthetic-provider-id' }) });
const create = options => createSmsDelivery({ apiKey: 'synthetic-api-key', secretKey: 'synthetic-secret',
  brandname: 'PawWorld', fetchImpl: jest.fn(async () => response('100')),
  clock: () => NOW, timeoutMs: 100, ...options });

describe('eSMS SMS delivery adapter (fake HTTP provider only)', () => {
  test('sends a single JSON request with E.164 converted to provider digits and operation id as RequestId', async () => {
    const fetchImpl = jest.fn(async () => response('100'));
    const delivery = create({ fetchImpl, sandbox: true });
    const result = await delivery.send(command());
    expect(result).toEqual({ status: 'ACCEPTED', code: 'ESMS_ACCEPTED', retryable: false, uncertain: false, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({ Phone: '84901234567', Brandname: 'PawWorld', SmsType: '2',
      IsUnicode: '0', Sandbox: '1', RequestId: command().operationId });
    expect(body.Content).toContain('012345');
    expect(body).toHaveProperty('ApiKey', 'synthetic-api-key');
    expect(body).toHaveProperty('SecretKey', 'synthetic-secret');
  });

  test('coalesces concurrent same-operation calls and rejects payload reuse with a different OTP', async () => {
    let release;
    const fetchImpl = jest.fn(() => new Promise(resolve => { release = () => resolve(response('100')); }));
    const delivery = create({ fetchImpl });
    const first = delivery.send(command());
    const second = delivery.send(command());
    await Promise.resolve();
    const conflict = await delivery.send(command({ code: '999999' }));
    expect(conflict.code).toBe('OPERATION_CONFLICT');
    release();
    expect(await Promise.all([first, second])).toEqual([
      { status: 'ACCEPTED', code: 'ESMS_ACCEPTED', retryable: false, uncertain: false, attempts: 1 },
      { status: 'ACCEPTED', code: 'ESMS_ACCEPTED', retryable: false, uncertain: false, attempts: 1 }
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('maps provider configuration, invalid number, duplicate, throttling and rejection safely', async () => {
    for (const [providerCode, code, uncertain] of [
      ['101', 'CONFIGURATION_EXPIRED', false],
      ['104', 'CONFIGURATION_INVALID', false],
      ['108', 'INVALID_PHONE', false],
      ['124', 'OPERATION_UNKNOWN', true],
      ['160', 'RATE_LIMITED', false],
      ['99', 'PROVIDER_REJECTED', false],
      ['999', 'PROVIDER_ERROR', true]
    ]) {
      const result = await create({ fetchImpl: jest.fn(async () => response(providerCode)) }).send(command());
      expect(result).toMatchObject({ status: 'FAILED', code, uncertain, attempts: 1 });
    }
    const limited = await create({ fetchImpl: jest.fn(async () => response('100', 429)) }).send(command());
    expect(limited).toMatchObject({ code: 'RATE_LIMITED', retryable: true, uncertain: false });
  });

  test('does not retry ambiguous timeout or server errors', async () => {
    const fetchImpl = jest.fn((url, options) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
    }));
    const timeout = await create({ fetchImpl, timeoutMs: 5 }).send(command());
    expect(timeout).toMatchObject({ code: 'TIMEOUT', retryable: false, uncertain: true, attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const serverErrorFetch = jest.fn(async () => response('500', 500));
    const serverError = await create({ fetchImpl: serverErrorFetch }).send(command());
    expect(serverError).toMatchObject({ code: 'PROVIDER_ERROR', retryable: false, uncertain: true, attempts: 1 });
    expect(serverErrorFetch).toHaveBeenCalledTimes(1);
  });

  test('does not leak OTP, recipient, or credentials to logger', async () => {
    const logger = jest.fn();
    await create({ logger }).send(command());
    const logs = JSON.stringify(logger.mock.calls);
    expect(logs).not.toContain('012345');
    expect(logs).not.toContain('84901234567');
    expect(logs).not.toContain('synthetic-secret');
    expect(logger).toHaveBeenCalledWith({ event: 'SMS_ATTEMPT', status: 'ACCEPTED', code: 'ESMS_ACCEPTED' });
  });
});
