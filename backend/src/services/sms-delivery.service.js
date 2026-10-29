import { createHash } from 'node:crypto';
import { renderSms } from './sms-template.service.js';
import { DEFAULT_SMS_OTP_TEMPLATE, isSmsOtpTemplate } from '../validators/sms-template.validator.js';

const ESMS_SEND_URL = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

function failure(code, retryable = false, uncertain = false, attempts = 0) {
  return { status: 'FAILED', code, retryable, uncertain, attempts };
}

function mapEsmsCode(code) {
  switch (String(code)) {
    case '99': return failure('PROVIDER_REJECTED');
    case '101': return failure('CONFIGURATION_EXPIRED');
    case '102':
    case '104':
    case '140':
    case '146':
    case '177': return failure('CONFIGURATION_INVALID');
    case '103': return failure('ACCOUNT_BALANCE_LOW');
    case '108': return failure('INVALID_PHONE');
    case '124': return failure('OPERATION_UNKNOWN', false, true);
    case '160': return failure('RATE_LIMITED', true);
    default: return failure('PROVIDER_ERROR', false, true);
  }
}

export function createSmsDelivery({ apiKey, secretKey, brandname, sandbox = false,
  otpTemplate = DEFAULT_SMS_OTP_TEMPLATE, fetchImpl = globalThis.fetch, timeoutMs = 10000, clock = Date.now, logger = () => {} }) {
  if (typeof apiKey !== 'string' || !apiKey || typeof secretKey !== 'string' || !secretKey
    || typeof brandname !== 'string' || !brandname || typeof fetchImpl !== 'function'
    || typeof sandbox !== 'boolean' || !isSmsOtpTemplate(otpTemplate)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    throw new TypeError('Invalid SMS adapter configuration');
  }

  const inFlight = new Map();
  const safeLog = result => {
    // Never pass the OTP, phone, credentials, request body, raw response or exception to a logger.
    try { logger({ event: 'SMS_ATTEMPT', status: result.status, code: result.code }); } catch { /* logging cannot affect delivery */ }
  };

  async function deliver(message) {
    if (clock() >= message.expiry) return failure('EXPIRED');

    const controller = new globalThis.AbortController();
    let timedOut = false;
    let timer;
    const body = {
      ApiKey: apiKey,
      SecretKey: secretKey,
      Content: message.content,
      Phone: message.to.slice(1),
      Brandname: brandname,
      SmsType: '2',
      IsUnicode: '0',
      Sandbox: sandbox ? '1' : '0',
      RequestId: message.operationId
    };
    const request = Promise.resolve().then(async () => {
      const response = await fetchImpl(ESMS_SEND_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        redirect: 'error',
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (response.status === 429) return failure('RATE_LIMITED', true, false, 1);
      if (!response.ok) {
        return response.status >= 500
          ? failure('PROVIDER_ERROR', false, true, 1)
          : failure('PROVIDER_REJECTED', false, false, 1);
      }

      const payload = await response.json();
      const code = String(payload?.CodeResult);
      const result = code === '100' && sandbox
        ? { status: 'FAILED', code: 'SANDBOX_VALIDATED', retryable: false, uncertain: false, attempts: 1 }
        : code === '100'
          ? { status: 'ACCEPTED', code: 'ESMS_ACCEPTED', retryable: false, uncertain: false, attempts: 1 }
          : mapEsmsCode(code);
      return { ...result, attempts: 1 };
    });
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('SMS request timed out'));
      }, timeoutMs);
    });

    let result;
    try {
      result = await Promise.race([request, deadline]);
    } catch {
      result = timedOut ? failure('TIMEOUT', false, true, 1) : failure('PROVIDER_ERROR', false, true, 1);
    } finally {
      clearTimeout(timer);
    }
    safeLog(result);
    return result;
  }

  return Object.freeze({
    send(command) {
      const message = renderSms(command, clock(), otpTemplate);
      if (message.error) return Promise.resolve(failure(message.error));

      const fingerprint = createHash('sha256').update(JSON.stringify(message)).digest('hex');
      const existing = inFlight.get(message.operationId);
      if (existing) return existing.fingerprint === fingerprint ? existing.promise
        : Promise.resolve(failure('OPERATION_CONFLICT'));

      // The same in-process operation shares one upstream attempt. RequestId also asks eSMS to
      // suppress duplicates for 24 hours if a caller later repeats the operation after timeout.
      const promise = Promise.resolve().then(() => deliver(message)).finally(() => inFlight.delete(message.operationId));
      inFlight.set(message.operationId, { fingerprint, promise });
      return promise;
    }
  });
}
