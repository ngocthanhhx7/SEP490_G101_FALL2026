import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isMailbox, renderEmail } from './email-template.service.js';

const BEFORE_DATA = new Set(['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO']);
function failure(code, retryable = false, uncertain = false) {
  return { status: 'FAILED', code, retryable, uncertain };
}

export function mapSmtpError(error) {
  if (error?.code === 'EAUTH' || [534, 535, 538].includes(error?.responseCode)) return failure('AUTHENTICATION_FAILED');
  if (error?.code === 'EENVELOPE' && [550, 551, 553].includes(error?.responseCode)
    && error?.command === 'RCPT TO') return failure('INVALID_ADDRESS');
  if (error?.code === 'ETIMEDOUT') return failure('TIMEOUT', false, !BEFORE_DATA.has(error?.command));
  // Explicit temporary SMTP rejection is safe to retry; a dropped DATA connection is not.
  if (Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode < 500) {
    return failure('THROTTLED', true);
  }
  if (['ECONNECTION', 'ECONNREFUSED', 'EDNS'].includes(error?.code) && error?.command === 'CONN') return failure('PROVIDER_UNAVAILABLE', true);
  return failure('PROVIDER_ERROR', false, !BEFORE_DATA.has(error?.command) && !Number.isInteger(error?.responseCode));
}

export function createEmailDelivery({ from, createAttempt, timeoutMs = 10000, maxAttempts = 2,
  retryDelayMs = 1000, clock = Date.now, sleep = delay, logger = () => {} }) {
  if (!isMailbox(from) || typeof createAttempt !== 'function' || !Number.isInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 30000 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3
    || !Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 5000) throw new TypeError('Invalid email adapter configuration');
  const inFlight = new Map();
  const safeLog = (result, attempt) => {
    // Never pass command, recipient, transport response or exception to a logger.
    try { logger({ event: 'EMAIL_ATTEMPT', status: result.status, code: result.code, attempt }); } catch { /* logging cannot affect delivery */ }
  };
  async function deliver(message) {
    let result;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (clock() >= message.expiry) return { ...failure('EXPIRED'), attempts: attempt - 1 };
      let transport;
      let timer;
      try {
        transport = createAttempt();
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject({ code: 'ETIMEDOUT' }), timeoutMs);
        });
        const info = await Promise.race([Promise.resolve().then(() => transport.sendMail({
          from, to: message.to, subject: message.subject, text: message.text, html: message.html,
          messageId: `<pwc.${message.operationId}@${from.split('@')[1]}>`,
          disableFileAccess: true, disableUrlAccess: true
        })), deadline]);
        result = Array.isArray(info?.accepted) && info.accepted.includes(message.to)
          && (!info.rejected || info.rejected.length === 0)
          ? { status: 'ACCEPTED', code: 'SMTP_ACCEPTED', retryable: false, uncertain: false }
          : failure('PROVIDER_ERROR', false, true);
      } catch (error) {
        result = mapSmtpError(error);
      } finally {
        clearTimeout(timer);
        try { transport?.close(); } catch { /* no raw provider error escapes */ }
      }
      safeLog(result, attempt);
      if (!result.retryable || attempt === maxAttempts) return { ...result, attempts: attempt };
      try { await sleep(retryDelayMs); } catch { return { ...failure('PROVIDER_UNAVAILABLE'), attempts: attempt }; }
    }
  }
  return Object.freeze({
    send(command) {
      const message = renderEmail(command, clock());
      if (message.error) return Promise.resolve({ ...failure(message.error), attempts: 0 });
      const fingerprint = createHash('sha256').update(JSON.stringify(message)).digest('hex');
      const existing = inFlight.get(message.operationId);
      if (existing) return existing.fingerprint === fingerprint ? existing.promise
        : Promise.resolve({ ...failure('OPERATION_CONFLICT'), attempts: 0 });
      // Schedule after registering so synchronous concurrent calls cannot both send.
      const promise = Promise.resolve().then(() => deliver(message)).finally(() => inFlight.delete(message.operationId));
      inFlight.set(message.operationId, { fingerprint, promise });
      return promise;
    }
  });
}
