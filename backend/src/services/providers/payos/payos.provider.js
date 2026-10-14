import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../../utils/app-error.js';

const DEFAULT_API_BASE_URL = 'https://api-merchant.payos.vn';
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;
const MAX_INT32 = 2147483647;

function configurationError(fields) {
  throw new AppError(503, 'PAYOS_CONFIGURATION_INVALID', 'payOS configuration is invalid', { fields });
}

function validCredential(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
    && /^[\x21-\x7e]+$/.test(value);
}

function normalizeBaseUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== '/' || parsed.origin !== DEFAULT_API_BASE_URL) return null;
  return parsed.origin;
}

export function loadPayosConfig(env = process.env) {
  const enabled = env.PAYOS_ENABLED ?? 'false';
  if (enabled === 'false') return null;
  if (enabled !== 'true') configurationError(['PAYOS_ENABLED']);

  const fields = [];
  for (const name of ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']) {
    if (!validCredential(env[name])) fields.push(name);
  }

  const timeoutMs = Number(env.PAYOS_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS));
  if (!/^\d+$/.test(String(env.PAYOS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS))
    || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT_MS) {
    fields.push('PAYOS_TIMEOUT_MS');
  }
  if (fields.length) configurationError(fields);

  return Object.freeze({
    clientId: env.PAYOS_CLIENT_ID,
    apiKey: env.PAYOS_API_KEY,
    checksumKey: env.PAYOS_CHECKSUM_KEY,
    timeoutMs
  });
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeysDeep(value[key])]));
}

function signatureValue(value) {
  if (value === null || value === undefined || value === 'null' || value === 'undefined') return '';
  if (Array.isArray(value) || isRecord(value)) return JSON.stringify(sortKeysDeep(value));
  return String(value);
}

function canonicalPayosData(data) {
  return Object.keys(data).sort()
    .map(key => `${key}=${signatureValue(data[key])}`)
    .join('&');
}

function isValidPayosSignature(data, receivedSignature, checksumKey) {
  if (!isRecord(data) || typeof receivedSignature !== 'string' || !/^[a-f\d]{64}$/i.test(receivedSignature)) {
    return false;
  }
  const expected = createHmac('sha256', checksumKey).update(canonicalPayosData(data), 'utf8').digest();
  const received = Buffer.from(receivedSignature, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function invalidRequest(fields) {
  throw new AppError(400, 'PAYOS_INVALID_REQUEST', 'Invalid payOS payment request', { fields });
}

function validHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  const localHttp = parsed.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

function validatePaymentLinkInput(input, now) {
  if (!isRecord(input)) invalidRequest(['request']);

  const fields = [];
  const { orderCode, amount, description } = input;
  const returnUrl = validHttpUrl(input.returnUrl);
  const cancelUrl = validHttpUrl(input.cancelUrl);

  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) fields.push('orderCode');
  if (!Number.isSafeInteger(amount) || amount <= 0) fields.push('amount');
  if (typeof description !== 'string' || description.trim() !== description
    || Array.from(description).length === 0 || Array.from(description).length > 9
    || /[\x00-\x1f\x7f]/.test(description)) fields.push('description');
  if (!returnUrl) fields.push('returnUrl');
  if (!cancelUrl) fields.push('cancelUrl');

  let items;
  if (input.items !== undefined) {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
      fields.push('items');
    } else {
      items = [];
      input.items.forEach((item, index) => {
        if (!isRecord(item)
          || typeof item.name !== 'string' || !item.name.trim() || item.name.trim() !== item.name
          || item.name.length > 100 || /[\x00-\x1f\x7f]/.test(item.name)
          || !Number.isSafeInteger(item.quantity) || item.quantity <= 0
          || !Number.isSafeInteger(item.price) || item.price < 0) {
          fields.push(`items.${index}`);
          return;
        }
        const safeItem = { name: item.name, quantity: item.quantity, price: item.price };
        if (item.unit !== undefined) {
          if (typeof item.unit !== 'string' || !item.unit.trim() || item.unit.trim() !== item.unit
            || item.unit.length > 20 || /[\x00-\x1f\x7f]/.test(item.unit)) {
            fields.push(`items.${index}.unit`);
            return;
          }
          safeItem.unit = item.unit;
        }
        items.push(safeItem);
      });
    }
  }

  let expiredAt;
  if (input.expiredAt !== undefined) {
    if (!Number.isSafeInteger(input.expiredAt) || input.expiredAt <= Math.floor(now / 1000)
      || input.expiredAt > MAX_INT32) fields.push('expiredAt');
    else expiredAt = input.expiredAt;
  }

  if (fields.length) invalidRequest(fields);
  return { orderCode, amount, description, returnUrl, cancelUrl, items, expiredAt };
}

function paymentRequestSignature({ amount, cancelUrl, description, orderCode, returnUrl }, checksumKey) {
  const canonical = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}`
    + `&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return createHmac('sha256', checksumKey).update(canonical, 'utf8').digest('hex');
}

function failure(code, message, status = 503, details = {}) {
  return new AppError(status, code, message, details);
}

export function createPayosProvider(options = {}) {
  const { clientId, apiKey, checksumKey, timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch } = options ?? {};
  const apiBaseUrl = normalizeBaseUrl(options?.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const configured = validCredential(clientId) && validCredential(apiKey)
    && validCredential(checksumKey) && Number.isInteger(timeoutMs)
    && timeoutMs >= 100 && timeoutMs <= MAX_TIMEOUT_MS && Boolean(apiBaseUrl);

  function requireConfiguration() {
    if (!configured || typeof fetchImpl !== 'function') {
      throw failure('PROVIDER_UNAVAILABLE', 'Payment provider is unavailable');
    }
  }

  function verifyWebhook(body) {
    requireConfiguration();
    if (!isRecord(body) || !isValidPayosSignature(body.data, body.signature, checksumKey)) {
      throw failure('PAYOS_SIGNATURE_INVALID', 'Invalid payment provider signature', 401);
    }
    // payOS signs `data`; root success/code fields are not payment evidence.
    return globalThis.structuredClone(body.data);
  }

  async function sendRequest(path, { method, body } = {}) {
    requireConfiguration();
    const url = `${apiBaseUrl}${path}`;
    const controller = new globalThis.AbortController();
    let timer;
    let response;
    let payload;
    let invalidJson = false;
    try {
      const request = Promise.resolve().then(async () => {
        response = await fetchImpl(url, {
          method,
          redirect: 'error',
          headers: {
            accept: 'application/json',
            'x-client-id': clientId,
            'x-api-key': apiKey,
            ...(body ? { 'content-type': 'application/json' } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal
        });
        if (response?.ok === true) {
          try { payload = await response.json(); }
          catch { invalidJson = true; }
        }
      });
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(failure('PAYOS_TIMEOUT', 'Payment provider request timed out', 503, {
            uncertain: method !== 'GET'
          }));
        }, timeoutMs);
      });
      await Promise.race([request, deadline]);
    } catch (error) {
      if (error?.code === 'PAYOS_TIMEOUT') throw error;
      throw failure('PROVIDER_UNAVAILABLE', 'Payment provider is unavailable', 503, {
        uncertain: method !== 'GET'
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response || response.ok !== true) {
      const status = Number.isInteger(response?.status) ? response.status : undefined;
      throw failure('PAYOS_REQUEST_FAILED', 'Payment provider request failed', 503, {
        ...(status ? { providerHttpStatus: status } : {}),
        uncertain: method !== 'GET'
      });
    }

    if (invalidJson) throw failure('PAYOS_RESPONSE_INVALID', 'Payment provider returned an invalid response', 502, {
      uncertain: method !== 'GET'
    });

    if (!isRecord(payload) || payload.code !== '00' || !isRecord(payload.data)) {
      throw failure('PAYOS_REQUEST_REJECTED', 'Payment provider rejected the request', 503, {
        uncertain: method !== 'GET'
      });
    }
    if (!isValidPayosSignature(payload.data, payload.signature, checksumKey)) {
      throw failure('PAYOS_RESPONSE_SIGNATURE_INVALID', 'Payment provider response signature is invalid', 502, {
        uncertain: method !== 'GET'
      });
    }
    return payload.data;
  }

  async function createPaymentLink(input) {
    requireConfiguration();
    const payment = validatePaymentLinkInput(input, Date.now());
    const body = {
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      cancelUrl: payment.cancelUrl,
      returnUrl: payment.returnUrl,
      ...(payment.items ? { items: payment.items } : {}),
      ...(payment.expiredAt ? { expiredAt: payment.expiredAt } : {})
    };
    body.signature = paymentRequestSignature(payment, checksumKey);
    const data = await sendRequest('/v2/payment-requests', { method: 'POST', body });

    if (data.orderCode !== payment.orderCode || data.amount !== payment.amount
      || data.currency !== 'VND' || typeof data.paymentLinkId !== 'string'
      || !data.paymentLinkId || typeof data.status !== 'string') {
      throw failure('PAYOS_RESPONSE_INVALID', 'Payment provider returned an invalid payment link', 502, {
        uncertain: true
      });
    }
    const checkoutUrl = validHttpUrl(data.checkoutUrl);
    if (!checkoutUrl || new URL(checkoutUrl).hostname !== 'pay.payos.vn'
      || !new URL(checkoutUrl).pathname.startsWith('/web/')) {
      throw failure('PAYOS_RESPONSE_INVALID', 'Payment provider returned an invalid checkout URL', 502, {
        uncertain: true
      });
    }
    return Object.freeze({
      orderCode: data.orderCode,
      amount: data.amount,
      currency: data.currency,
      providerStatus: data.status,
      paymentLinkId: data.paymentLinkId,
      checkoutUrl,
      ...(typeof data.qrCode === 'string' ? { qrCode: data.qrCode } : {})
    });
  }

  async function getPaymentLink(orderCode) {
    requireConfiguration();
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) invalidRequest(['orderCode']);
    const data = await sendRequest(`/v2/payment-requests/${encodeURIComponent(orderCode)}`, { method: 'GET' });
    if (data.orderCode !== orderCode || !Number.isSafeInteger(data.amount) || data.amount <= 0
      || !Number.isSafeInteger(data.amountPaid) || data.amountPaid < 0
      || !Number.isSafeInteger(data.amountRemaining) || data.amountRemaining < 0
      || typeof data.status !== 'string') {
      throw failure('PAYOS_RESPONSE_INVALID', 'Payment provider returned an invalid payment link', 502);
    }
    // This signed lookup is for reconciliation only; WBS-045 owns payment confirmation.
    return Object.freeze({
      orderCode: data.orderCode,
      amount: data.amount,
      amountPaid: data.amountPaid,
      amountRemaining: data.amountRemaining,
      providerStatus: data.status,
      ...(typeof data.createdAt === 'string' ? { createdAt: data.createdAt } : {})
    });
  }

  return Object.freeze({
    isConfigured: configured && typeof fetchImpl === 'function',
    createPaymentLink,
    getPaymentLink,
    verifyWebhook
  });
}
