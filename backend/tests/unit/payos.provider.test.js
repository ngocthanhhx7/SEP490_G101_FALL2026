import { createHmac } from 'node:crypto';
import { describe, expect, jest, test } from '@jest/globals';
import { AppError } from '../../src/utils/app-error.js';
import { createPayosProvider, loadPayosConfig } from '../../src/services/providers/payos/payos.provider.js';

const config = {
  clientId: 'synthetic-client-id',
  apiKey: 'synthetic-api-key',
  checksumKey: 'synthetic-checksum-key'
};

function signData(data, checksumKey = config.checksumKey) {
  const canonical = Object.keys(data).sort().map(key => {
    const value = data[key] === null || data[key] === 'null' || data[key] === 'undefined' ? '' : data[key];
    return `${key}=${typeof value === 'object' && value !== null ? JSON.stringify(value) : value}`;
  }).join('&');
  return createHmac('sha256', checksumKey).update(canonical, 'utf8').digest('hex');
}

function responseFor(data) {
  return { ok: true, status: 200, json: async () => ({ code: '00', data, signature: signData(data) }) };
}

const paymentRequest = {
  orderCode: 123456,
  amount: 125000,
  description: 'PWC123456',
  returnUrl: 'https://paw.example.test/payments/return',
  cancelUrl: 'https://paw.example.test/payments/cancel'
};

describe('payOS provider adapter', () => {
  test('defaults to unavailable when credentials are disabled or absent', async () => {
    expect(loadPayosConfig({})).toBeNull();
    const provider = createPayosProvider();
    expect(provider.isConfigured).toBe(false);
    await expect(provider.createPaymentLink(paymentRequest)).rejects.toMatchObject({
      status: 503, code: 'PROVIDER_UNAVAILABLE'
    });
  });

  test('loads enabled configuration without returning secret values in configuration errors', () => {
    expect(loadPayosConfig({
      PAYOS_ENABLED: 'true', PAYOS_CLIENT_ID: config.clientId, PAYOS_API_KEY: config.apiKey,
      PAYOS_CHECKSUM_KEY: config.checksumKey, PAYOS_TIMEOUT_MS: '1500'
    })).toEqual({ ...config, timeoutMs: 1500 });

    try {
      loadPayosConfig({ PAYOS_ENABLED: 'true', PAYOS_CLIENT_ID: config.clientId });
      throw new Error('expected invalid configuration');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe('PAYOS_CONFIGURATION_INVALID');
      expect(error.details.fields).toEqual(expect.arrayContaining(['PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']));
      expect(JSON.stringify(error)).not.toContain(config.clientId);
    }
  });

  test('validates integer positive VND amounts and provider input before making a request', async () => {
    const fetchImpl = jest.fn();
    const provider = createPayosProvider({ ...config, fetchImpl });
    for (const amount of [0, -1, 1000.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(provider.createPaymentLink({ ...paymentRequest, amount })).rejects.toMatchObject({
        status: 400, code: 'PAYOS_INVALID_REQUEST', details: { fields: expect.arrayContaining(['amount']) }
      });
    }
    await expect(provider.createPaymentLink({ ...paymentRequest, returnUrl: 'javascript:alert(1)' }))
      .rejects.toMatchObject({ code: 'PAYOS_INVALID_REQUEST' });
    await expect(provider.createPaymentLink({ ...paymentRequest, description: 'PWC1234567' }))
      .rejects.toMatchObject({ code: 'PAYOS_INVALID_REQUEST' });
    await expect(provider.createPaymentLink({ ...paymentRequest, expiredAt: Math.floor(Date.now() / 1000) - 1 }))
      .rejects.toMatchObject({ code: 'PAYOS_INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('creates a signed payOS link with private credentials only in request headers', async () => {
    const data = {
      bin: '970422', accountNumber: '113366668888', accountName: 'SYNTHETIC ACCOUNT',
      amount: paymentRequest.amount, description: paymentRequest.description,
      orderCode: paymentRequest.orderCode, currency: 'VND', paymentLinkId: 'synthetic-link-id',
      status: 'PENDING', checkoutUrl: 'https://pay.payos.vn/web/synthetic-link-id', qrCode: 'synthetic-qr'
    };
    const fetchImpl = jest.fn(async () => responseFor(data));
    const provider = createPayosProvider({ ...config, fetchImpl });

    const result = await provider.createPaymentLink({
      ...paymentRequest,
      items: [{ name: 'One completed care visit', quantity: 1, price: paymentRequest.amount, ignored: 'drop-me' }]
    });
    expect(result).toEqual({
      orderCode: paymentRequest.orderCode,
      amount: paymentRequest.amount,
      currency: 'VND',
      providerStatus: 'PENDING',
      paymentLinkId: 'synthetic-link-id',
      checkoutUrl: 'https://pay.payos.vn/web/synthetic-link-id',
      qrCode: 'synthetic-qr'
    });

    const [url, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api-merchant.payos.vn/v2/payment-requests');
    expect(options.method).toBe('POST');
    expect(options.redirect).toBe('error');
    expect(options.headers).toMatchObject({
      'x-client-id': config.clientId, 'x-api-key': config.apiKey, 'content-type': 'application/json'
    });
    expect(body.items).toEqual([{ name: 'One completed care visit', quantity: 1, price: paymentRequest.amount }]);
    expect(body.signature).toBe(createHmac('sha256', config.checksumKey).update(
      `amount=${body.amount}&cancelUrl=${body.cancelUrl}&description=${body.description}`
        + `&orderCode=${body.orderCode}&returnUrl=${body.returnUrl}`
    ).digest('hex'));
    expect(JSON.stringify(result)).not.toContain(config.apiKey);
  });

  test('uses the documented payOS webhook signature fixture and returns only the signed data', () => {
    const checksumKey = '1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675';
    const data = {
      orderCode: 123,
      amount: 3000,
      description: 'VQRIO123',
      accountNumber: '12345678',
      reference: 'TF230204212323',
      transactionDateTime: '2023-02-04 18:25:00',
      currency: 'VND',
      paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
      code: '00',
      desc: 'Thành công',
      counterAccountBankId: '',
      counterAccountBankName: '',
      counterAccountName: '',
      counterAccountNumber: '',
      virtualAccountName: '',
      virtualAccountNumber: ''
    };
    const body = {
      code: '99', success: false, data,
      signature: '412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03'
    };
    const provider = createPayosProvider({ ...config, checksumKey, fetchImpl: jest.fn() });

    expect(provider.verifyWebhook(body)).toEqual(data);
  });

  test('rejects a missing or mismatched webhook signature without using unsigned success fields', () => {
    const provider = createPayosProvider({ ...config, fetchImpl: jest.fn() });
    const signedData = { orderCode: 123456, amount: 125000, currency: 'VND', code: '00' };
    const valid = { success: true, code: '00', data: signedData, signature: signData(signedData) };
    expect(provider.verifyWebhook(valid)).toEqual(signedData);

    for (const invalidBody of [
      { ...valid, success: true, signature: '0'.repeat(64) },
      { ...valid, data: { ...signedData, amount: 1 } },
      { ...valid, signature: undefined }
    ]) {
      let caught;
      try { provider.verifyWebhook(invalidBody); } catch (error) { caught = error; }
      expect(caught).toMatchObject({ status: 401, code: 'PAYOS_SIGNATURE_INVALID' });
    }
  });

  test('looks up a signed payment link for reconciliation without returning bank details', async () => {
    const data = {
      id: 'synthetic-link-id', orderCode: paymentRequest.orderCode, amount: paymentRequest.amount,
      amountPaid: 0, amountRemaining: paymentRequest.amount, status: 'PENDING',
      createdAt: '2026-10-14T00:00:00.000Z', transactions: [{ counterAccountNumber: 'private' }]
    };
    const fetchImpl = jest.fn(async () => responseFor(data));
    const provider = createPayosProvider({ ...config, fetchImpl });

    const reconciliationSnapshot = await provider.getPaymentLink(paymentRequest.orderCode);
    expect(reconciliationSnapshot).toEqual({
      orderCode: paymentRequest.orderCode,
      amount: paymentRequest.amount,
      amountPaid: 0,
      amountRemaining: paymentRequest.amount,
      providerStatus: 'PENDING',
      createdAt: data.createdAt
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api-merchant.payos.vn/v2/payment-requests/${paymentRequest.orderCode}`);
    expect(JSON.stringify(reconciliationSnapshot)).not.toContain('private');
  });

  test('turns provider timeouts into safe errors and flags POST outcomes as uncertain', async () => {
    const fetchImpl = jest.fn(() => new Promise(() => {}));
    const provider = createPayosProvider({ ...config, timeoutMs: 100, fetchImpl });
    await expect(provider.createPaymentLink(paymentRequest)).rejects.toMatchObject({
      status: 503, code: 'PAYOS_TIMEOUT', details: { uncertain: true }
    });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);

    const bodyProvider = createPayosProvider({
      ...config,
      timeoutMs: 100,
      fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })
    });
    await expect(bodyProvider.createPaymentLink(paymentRequest)).rejects.toMatchObject({
      status: 503, code: 'PAYOS_TIMEOUT', details: { uncertain: true }
    });
  });

  test('rejects unsigned provider responses and does not reveal response bodies', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ code: '00', data: { orderCode: paymentRequest.orderCode }, signature: '0'.repeat(64) })
    }));
    const provider = createPayosProvider({ ...config, fetchImpl });
    await expect(provider.createPaymentLink(paymentRequest)).rejects.toMatchObject({
      status: 502, code: 'PAYOS_RESPONSE_SIGNATURE_INVALID'
    });
  });
});
