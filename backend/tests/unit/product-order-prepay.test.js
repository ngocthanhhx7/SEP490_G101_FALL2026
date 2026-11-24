import { describe, expect, jest, test } from '@jest/globals';
import { loadConfig } from '../../src/config/environment.js';
import { parsePlaceOrder } from '../../src/validators/product-order.validator.js';
import { productOrderRefundAmount } from '../../src/services/product-sales/product-order-pricing.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { createProductOrderPaymentSettler } from '../../src/services/product-sales/product-order-payment.service.js';
import { parseWebOrigin } from '../../src/config/web-origin.js';

const env = { NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' };
const ADDRESS = '0123456789abcdef01234567';

describe('payment deadline setting (GBR-36, Shop Rules)', () => {
  test('defaults to one hour and accepts a whole number of hours', () => {
    expect(loadConfig(env)).toMatchObject({ paymentDeadlineHours: 1 });
    expect(loadConfig({ ...env, PRODUCT_PAYMENT_DEADLINE_HOURS: '2' })).toMatchObject({ paymentDeadlineHours: 2 });
  });
  test.each(['0', '-1', '1.5', 'soon', '', '999999999999999'])('rejects %p', (value) => {
    expect(() => loadConfig({ ...env, PRODUCT_PAYMENT_DEADLINE_HOURS: value }))
      .toThrow(expect.objectContaining({ fields: ['PRODUCT_PAYMENT_DEADLINE_HOURS'] }));
  });
});

describe('ways to pay by way to receive (GBR-36)', () => {
  test.each([
    [{ receiveMethod: 'DELIVERY', paymentMethod: 'PREPAID', addressId: ADDRESS }],
    [{ receiveMethod: 'DELIVERY', paymentMethod: 'COD', addressId: ADDRESS }],
    [{ receiveMethod: 'PICKUP', paymentMethod: 'PREPAID' }],
    [{ receiveMethod: 'PICKUP', paymentMethod: 'PAY_AT_SHOP' }]
  ])('accepts %j', (body) => {
    expect(parsePlaceOrder(body)).toMatchObject({ receiveMethod: body.receiveMethod, paymentMethod: body.paymentMethod });
  });
  test.each([
    [{ receiveMethod: 'DELIVERY', paymentMethod: 'PAY_AT_SHOP', addressId: ADDRESS }],
    [{ receiveMethod: 'PICKUP', paymentMethod: 'COD' }],
    [{ receiveMethod: 'PICKUP', paymentMethod: 'CASH' }],
    [{ receiveMethod: 'PICKUP', paymentMethod: 'PREPAID', addressId: ADDRESS }]
  ])('rejects %j', (body) => {
    expect(() => parsePlaceOrder(body)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});

describe('refund amount (GBR-37)', () => {
  const order = { total: 175000, shippingFee: 25000 };
  test('the whole amount, shipping fee included, unless the customer refused without a reason', () => {
    expect(productOrderRefundAmount(order)).toBe(175000);
    expect(productOrderRefundAmount(order, { goodsOnly: true })).toBe(150000);
    expect(productOrderRefundAmount({ total: 150000, shippingFee: 0 }, { goodsOnly: true })).toBe(150000);
  });
});

describe('payOS result for a prepaid product order', () => {
  const receivedAt = new Date('2026-11-24T11:30:00.000Z');
  const data = { orderCode: 4001, amount: 175000, currency: 'VND', code: '00', reference: 'BANK-4001',
    paymentLinkId: 'link-4001', transactionDateTime: '2026-11-24T11:29:00Z' };
  const orderIntent = (patch = {}) => ({ kind: 'PRODUCT_ORDER', id: 'order-1', version: 2, providerReference: '4001', amountVnd: 175000,
    currency: 'VND', state: 'PENDING', orderState: 'AWAITING_PAYMENT', expiresAt: new Date('2026-11-24T11:00:00.000Z'), ...patch });
  function run(intent) {
    const repository = { findPaymentIntentByProviderReference: jest.fn(async () => intent),
      recordWebhookOutcome: jest.fn(async ({ decision }) => (decision.type === 'RECONCILE'
        ? { status: 'RECONCILIATION_REQUIRED', reason: decision.reason } : { status: 'APPLIED' })) };
    const service = createPayosPaymentWebhookService({ provider: { verifyWebhook: jest.fn(async () => data) }, repository, clock: () => receivedAt });
    return { service, repository };
  }

  test('a payable order is marked paid even when the deadline passed before the expiry job cancelled it', async () => {
    const { service, repository } = run(orderIntent());
    await expect(service.handleWebhook({ data })).resolves.toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(repository.recordWebhookOutcome.mock.calls[0][0].decision).toMatchObject({
      kind: 'PRODUCT_ORDER', type: 'MARK_PAID', intentId: 'order-1', expectedIntentVersion: 2 });
  });

  test.each([['CANCELLED', 'ORDER_NOT_PAYABLE'], ['HANDED_TO_CARRIER', 'ORDER_NOT_PAYABLE']])(
    'an order that is %s is never reopened: %s', async (orderState, reason) => {
      const { service, repository } = run(orderIntent({ orderState }));
      await service.handleWebhook({ data });
      expect(repository.recordWebhookOutcome.mock.calls[0][0].decision).toMatchObject({ kind: 'PRODUCT_ORDER', type: 'RECONCILE', reason });
    });

  test('a wrong amount or a payment that did not go through is kept for reconciliation, not applied', async () => {
    const wrong = run(orderIntent({ amountVnd: 200000 }));
    await wrong.service.handleWebhook({ data });
    expect(wrong.repository.recordWebhookOutcome.mock.calls[0][0].decision).toMatchObject({ type: 'RECONCILE', reason: 'AMOUNT_MISMATCH' });
    const rejected = jest.fn(async () => ({ status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' }));
    const failed = createPayosPaymentWebhookService({ provider: { verifyWebhook: jest.fn(async () => ({ ...data, code: '01' })) },
      repository: { findPaymentIntentByProviderReference: async () => orderIntent(), recordWebhookOutcome: rejected }, clock: () => receivedAt });
    await expect(failed.handleWebhook({ data })).resolves.toMatchObject({ status: 'RECONCILIATION_REQUIRED' });
    expect(rejected.mock.calls[0][0].decision).toMatchObject({ kind: 'PRODUCT_ORDER', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' });
  });

  test('a booking intent keeps its own rules: late results are still refused', async () => {
    const { service, repository } = run({ id: 'i-1', providerReference: '4001', amountVnd: 175000, currency: 'VND', state: 'PENDING', version: 1,
      bookingState: 'AWAITING_PAYMENT', expiresAt: '2026-11-24T11:00:00.000Z' });
    await service.handleWebhook({ data });
    expect(repository.recordWebhookOutcome.mock.calls[0][0].decision).toEqual(expect.objectContaining({ type: 'RECONCILE', reason: 'INTENT_EXPIRED' }));
    expect(repository.recordWebhookOutcome.mock.calls[0][0].decision).not.toHaveProperty('kind');
  });
});

describe('asking payOS before an unpaid order is cancelled (JOB-04)', () => {
  const link = (patch) => ({ orderCode: 1, amount: 100, amountPaid: 0, amountRemaining: 100, providerStatus: 'PENDING', ...patch });
  const order = { payment: { providerReferences: ['1', '2'] } };
  test('nothing paid means unpaid, a paid link is recorded through the webhook path, a provider error is thrown', async () => {
    const handle = jest.fn(async () => ({ status: 'PAYMENT_VERIFIED' }));
    const unpaid = createProductOrderPaymentSettler({ provider: { getPaymentLink: jest.fn(async () => link()) }, handleVerifiedPayment: handle });
    expect(await unpaid.settleIfPaid(order)).toBe('UNPAID');
    expect(handle).not.toHaveBeenCalled();
    const paid = createProductOrderPaymentSettler({ provider: { getPaymentLink: jest.fn(async (code) => (code === 2
      ? link({ orderCode: 2, providerStatus: 'PAID', amountPaid: 100, amountRemaining: 0 }) : link({ orderCode: 1 }))) }, handleVerifiedPayment: handle });
    expect(await paid.settleIfPaid(order)).toBe('PAID');
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ orderCode: 2, amount: 100, currency: 'VND', code: '00' }));
    handle.mockResolvedValueOnce({ status: 'RECONCILIATION_REQUIRED', reason: 'AMOUNT_MISMATCH' });
    expect(await paid.settleIfPaid(order)).toBe('RECONCILE');
    const broken = createProductOrderPaymentSettler({ provider: { getPaymentLink: jest.fn(async () => { throw new Error('payOS down'); }) }, handleVerifiedPayment: handle });
    await expect(broken.settleIfPaid(order)).rejects.toThrow('payOS down');
    expect(await unpaid.settleIfPaid({ payment: { providerReferences: [] } })).toBe('UNPAID');
  });
});

describe('web origin of the payOS return page', () => {
  test('accepts https and local http; refuses paths, credentials and other http hosts', () => {
    expect(parseWebOrigin(undefined)).toBeNull();
    expect(parseWebOrigin('https://pawworldvn.shop')).toBe('https://pawworldvn.shop');
    expect(parseWebOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    for (const bad of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path']) {
      expect(() => parseWebOrigin(bad)).toThrow(TypeError);
    }
  });
});
