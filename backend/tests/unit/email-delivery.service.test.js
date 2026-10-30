import { describe, test, expect, jest } from '@jest/globals';
import { createEmailDelivery, mapSmtpError } from '../../src/services/email-delivery.service.js';
import { renderEmail } from '../../src/services/email-template.service.js';
import { createEmailPortOverrides, loadSmtpConfig } from '../../src/services/smtp-email.service.js';
import { createPorts } from '../../src/config/ports.js';

const now = Date.parse('2026-10-14T12:00:00Z');
const command = { channel: 'EMAIL', kind: 'OTP', purpose: 'LOGIN', to: 'customer@example.invalid',
  code: '012345', operationId: 'ea745364-8737-49f9-b0b4-15aaf7c1e109', expiresAt: new Date(now + 300000).toISOString() };
const env = { EMAIL_ENABLED: 'true', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587',
  SMTP_USER: 'synthetic-user', SMTP_PASSWORD: 'synthetic-password', EMAIL_FROM: 'noreply@example.invalid' };
function fixture(options = {}) {
  const transport = { sendMail: jest.fn().mockResolvedValue({ accepted: [command.to], rejected: [],
    response: 'private raw provider response' }), close: jest.fn() };
  const logger = jest.fn();
  const sleep = jest.fn().mockResolvedValue();
  const createAttempt = jest.fn(() => transport);
  const service = createEmailDelivery({ from: env.EMAIL_FROM, createAttempt, clock: () => now,
    timeoutMs: 20, logger, sleep, ...options });
  return { service, transport, logger, sleep, createAttempt };
}

describe('email template and private command validation', () => {
  test('six digits with leading zero, exact UTC expiry and no-share warning', () => {
    const template = renderEmail(command, now);
    expect(template.text).toContain('012345');
    expect(template.text).toContain(command.expiresAt);
    expect(template.text).toContain('Không chia sẻ');
    expect(template.to).toBe(command.to);
  });
  test.each([
    { to: 'a@example.invalid\r\nBcc: b@example.invalid' }, { to: 'a@example.invalid,b@example.invalid' },
    { to: 'Customer <a@example.invalid>' }, { channel: 'SMS' }, { purpose: 'ARBITRARY' },
    { code: 123456 }, { code: '12345' }, { operationId: 'untrusted' }, { kind: 'OTHER' },
    { expiresAt: 'bad' }, { expiresAt: new Date(now + 300001).toISOString() }
  ])('rejects malformed command %j before transport', async patch => {
    const { service, createAttempt } = fixture();
    expect(await service.send({ ...command, ...patch })).toMatchObject({ code: 'INVALID_REQUEST', attempts: 0 });
    expect(createAttempt).not.toHaveBeenCalled();
  });
  test('expiry is exclusive and never sends at deadline', async () => {
    const { service, createAttempt } = fixture();
    expect(await service.send({ ...command, expiresAt: new Date(now).toISOString() })).toMatchObject({ code: 'EXPIRED' });
    expect(createAttempt).not.toHaveBeenCalled();
  });
  test('system content is plain text/escaped HTML, cannot inject headers', () => {
    const system = { ...command, kind: 'SYSTEM', title: 'Visit update', message: '<img src="x"> & hello' };
    expect(renderEmail(system, now).html).toContain('&lt;img src=&quot;x&quot;&gt; &amp;');
    expect(renderEmail({ ...system, title: 'a\nBcc: x' }, now).error).toBe('INVALID_REQUEST');
  });
});

describe('SMTP adapter (all transports injected; no network)', () => {
  test('correct recipient/template; SMTP accepted is not delivered; logs contain no sensitive input', async () => {
    const { service, transport, logger } = fixture();
    expect(await service.send(command)).toEqual({ status: 'ACCEPTED', code: 'SMTP_ACCEPTED', retryable: false, uncertain: false, attempts: 1 });
    const mail = transport.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ from: env.EMAIL_FROM, to: command.to, disableFileAccess: true, disableUrlAccess: true });
    expect(mail.text).toContain(command.code);
    const logs = JSON.stringify(logger.mock.calls);
    for (const secret of [command.code, command.to, env.SMTP_PASSWORD, 'private raw']) expect(logs).not.toContain(secret);
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
  test.each([
    [{ code: 'EAUTH', responseCode: 535, command: 'AUTH' }, 'AUTHENTICATION_FAILED', false, false],
    [{ code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' }, 'INVALID_ADDRESS', false, false],
    [{ code: 'ETIMEDOUT', command: 'CONN' }, 'TIMEOUT', false, false],
    [{ code: 'ETIMEDOUT', command: 'DATA' }, 'TIMEOUT', false, true],
    [{ code: 'ECONNECTION', command: 'CONN' }, 'PROVIDER_UNAVAILABLE', true, false],
    [{ code: 'ECONNRESET', command: 'DATA' }, 'PROVIDER_ERROR', false, true],
    [{ responseCode: 451, command: 'DATA' }, 'THROTTLED', true, false],
    [{ responseCode: 554, command: 'DATA' }, 'PROVIDER_ERROR', false, false]
  ])('safe mapping %j', (error, code, retryable, uncertain) => {
    expect(mapSmtpError({ ...error, message: '012345 synthetic-password', response: 'private' }))
      .toEqual({ status: 'FAILED', code, retryable, uncertain });
  });
  test('temporary rejection retries identical message within bound', async () => {
    const { service, transport, sleep } = fixture({ maxAttempts: 3 });
    transport.sendMail.mockRejectedValue({ responseCode: 421, command: 'CONN', message: command.code });
    expect(await service.send(command)).toMatchObject({ code: 'THROTTLED', retryable: true, attempts: 3 });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(transport.sendMail.mock.calls).toHaveLength(3);
    expect(transport.sendMail.mock.calls[0][0]).toEqual(transport.sendMail.mock.calls[2][0]);
  });
  test('auth failure never retries, even if logging fails', async () => {
    const { service, transport, sleep } = fixture({ logger: () => { throw Error('log failed'); } });
    transport.sendMail.mockRejectedValue({ code: 'EAUTH', message: 'secret' });
    expect(await service.send(command)).toMatchObject({ code: 'AUTHENTICATION_FAILED', attempts: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });
  test('hard deadline returns uncertain without retry and handles late settlement', async () => {
    const { service, transport, sleep } = fixture();
    let lateReject;
    transport.sendMail.mockImplementation(() => new Promise((_, reject) => { lateReject = reject; }));
    expect(await service.send(command)).toMatchObject({ code: 'TIMEOUT', uncertain: true, retryable: false, attempts: 1 });
    lateReject(Error('late raw secret'));
    await Promise.resolve();
    expect(sleep).not.toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalled();
  });
  test('expires during retry wait and never sends second time', async () => {
    let time = now;
    const { service, transport } = fixture({ clock: () => time, sleep: async () => { time += 300000; } });
    transport.sendMail.mockRejectedValue({ responseCode: 451, command: 'MAIL FROM' });
    expect(await service.send(command)).toMatchObject({ code: 'EXPIRED', attempts: 1 });
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
  test('concurrent identical operation shares send; changed payload conflicts', async () => {
    const { service, transport } = fixture();
    const first = service.send(command);
    const second = service.send({ ...command });
    expect(await service.send({ ...command, code: '654321' })).toMatchObject({ code: 'OPERATION_CONFLICT' });
    expect(await second).toEqual(await first);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
  test('no accepted recipient yields uncertain safe error without automatic retry', async () => {
    const { service, transport, sleep } = fixture();
    transport.sendMail.mockResolvedValue({ accepted: [], rejected: [command.to], response: 'raw' });
    expect(await service.send(command)).toMatchObject({ code: 'PROVIDER_ERROR', uncertain: true, attempts: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });
  test('factory failure is safely mapped', async () => {
    const { service } = fixture({ createAttempt: () => { throw Error('raw secret'); } });
    expect(await service.send(command)).toMatchObject({ code: 'PROVIDER_ERROR', uncertain: true });
  });
});

describe('SMTP config and P02 ports', () => {
  test('disabled provider leaves default 503 behavior', async () => {
    const createTransport = jest.fn();
    const overrides = createEmailPortOverrides({ env: {}, createTransport });
    expect(overrides).toEqual({});
    await expect(Promise.resolve().then(() => createPorts(overrides).contactDelivery.send(command)))
      .rejects.toMatchObject({ status: 503, code: 'PROVIDER_UNAVAILABLE' });
    expect(createTransport).not.toHaveBeenCalled();
  });
  test.each([
    { EMAIL_ENABLED: 'yes' }, { SMTP_HOST: 'smtp://user:secret@host' }, { SMTP_PORT: '25' },
    { SMTP_PASSWORD: '' }, { EMAIL_FROM: 'sender\n@example.invalid' }, { EMAIL_MAX_ATTEMPTS: '4' }, { EMAIL_TIMEOUT_MS: 'Infinity' }
  ])('invalid config only reports field names %j', patch => {
    try { loadSmtpConfig({ ...env, ...patch }); throw Error('expected failure'); }
    catch (error) {
      expect(error.code).toBe('EMAIL_CONFIGURATION_INVALID');
      expect(JSON.stringify(error)).not.toContain(env.SMTP_PASSWORD);
    }
  });
  test('enabled without injected dependency fails explicitly', () => {
    expect(() => createEmailPortOverrides({ env })).toThrow('Email transport is not installed or injected');
  });
  test.each(['465', '587'])('strict TLS and disabled logs/file/url access on port %s', port => {
    expect(loadSmtpConfig({ ...env, SMTP_PORT: port }).options).toMatchObject({
      secure: port === '465', requireTLS: true, tls: { rejectUnauthorized: true },
      logger: false, debug: false, pool: false, disableFileAccess: true, disableUrlAccess: true
    });
  });
  test('both injection ports enforce command kind and use shared delivery', async () => {
    const transport = { sendMail: jest.fn().mockResolvedValue({ accepted: [command.to] }), close: jest.fn() };
    const createTransport = jest.fn(() => transport);
    const ports = createPorts(createEmailPortOverrides({ env, createTransport, clock: () => now }));
    expect(await ports.notificationDelivery.send(command)).toMatchObject({ code: 'INVALID_REQUEST' });
    expect(await ports.contactDelivery.send(command)).toMatchObject({ status: 'ACCEPTED' });
    expect(await ports.notificationDelivery.send({ ...command, kind: 'SYSTEM', title: 'Visit', message: 'Synthetic visit update' }))
      .toMatchObject({ status: 'ACCEPTED' });
    expect(createTransport).toHaveBeenCalledTimes(2);
  });
});

test('application status OTP is rendered and handed to the SMTP transport', async () => {
  const { service, transport } = fixture();
  expect(await service.send({ ...command, purpose: 'APPLICATION_STATUS' })).toMatchObject({ status: 'ACCEPTED', attempts: 1 });
  expect(transport.sendMail.mock.calls[0][0].text).toContain('APPLICATION_STATUS');
});
