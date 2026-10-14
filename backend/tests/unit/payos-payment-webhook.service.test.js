import { describe, expect, jest, test } from '@jest/globals';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';

const receivedAt = new Date('2026-10-14T05:00:00.000Z');
const requestBody = {
  code: '00', desc: 'success', success: true,
  data: { orderCode: 73105, amount: 250000, currency: 'VND', code: '00', reference: 'BANK-TXN-73105',
    paymentLinkId: 'link-synthetic-73105', transactionDateTime: '2026-10-14T04:59:20Z',
    accountNumber: 'synthetic-account-number' },
  signature: 'synthetic-signature'
};

function createIntent(patch = {}) {
  return {
    id: 'intent-synthetic-73105', providerReference: '73105', amountVnd: 250000, currency: 'VND',
    state: 'PENDING', version: 3, expiresAt: '2026-10-14T05:10:00.000Z', bookingState: 'AWAITING_PAYMENT',
    ...patch
  };
}

function createRepository({ intent = createIntent(), commitOverride } = {}) {
  const receipts = new Map();
  const intents = new Map(intent ? [[String(intent.providerReference), { ...intent }]] : []);
  const findPaymentIntentByProviderReference = jest.fn(async reference => {
    const value = intents.get(reference);
    return value ? { ...value } : null;
  });
  const recordWebhookOutcome = jest.fn(async input => {
    const existing = receipts.get(input.eventId);
    if (existing) return { status: 'DUPLICATE', previousOutcome: existing.status };
    if (commitOverride) {
      const result = await commitOverride(input);
      receipts.set(input.eventId, result);
      return result;
    }

    if (input.decision.type === 'RECONCILE') {
      const result = { status: 'RECONCILIATION_REQUIRED', reason: input.decision.reason };
      receipts.set(input.eventId, result);
      return result;
    }

    const current = intents.get(input.receipt.providerOrderCode);
    if (!current || current.id !== input.decision.intentId || current.state !== input.decision.expectedIntentState
      || current.bookingState !== input.decision.expectedBookingState
      || current.version !== input.decision.expectedIntentVersion) {
      const result = { status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_CHANGED_DURING_WEBHOOK' };
      receipts.set(input.eventId, result);
      return result;
    }

    current.state = 'PAID';
    current.version += 1;
    const result = { status: 'APPLIED' };
    receipts.set(input.eventId, result);
    return result;
  });
  return { findPaymentIntentByProviderReference, recordWebhookOutcome, intents, receipts };
}

function createService({ signedData = requestBody.data, intent, commitOverride, verifyWebhook } = {}) {
  const provider = { verifyWebhook: verifyWebhook ?? jest.fn(async () => signedData) };
  const repository = createRepository({ intent, commitOverride });
  const service = createPayosPaymentWebhookService({ provider, repository, clock: () => receivedAt });
  return { service, provider, repository };
}

describe('payOS payment result webhook', () => {
  test('verifies a signed success for the matching pending prepay intent', async () => {
    const { service, provider, repository } = createService();

    await expect(service.handleWebhook(requestBody)).resolves.toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(provider.verifyWebhook).toHaveBeenCalledWith(requestBody);
    expect(repository.findPaymentIntentByProviderReference).toHaveBeenCalledWith('73105');
    expect(repository.recordWebhookOutcome).toHaveBeenCalledWith(expect.objectContaining({
      decision: expect.objectContaining({ type: 'MARK_PAID', expectedIntentState: 'PENDING',
        expectedBookingState: 'AWAITING_PAYMENT', expectedIntentVersion: 3 }),
      receipt: expect.objectContaining({ provider: 'PAYOS', amountVnd: 250000, currency: 'VND',
        providerTransactionReference: 'BANK-TXN-73105',
        providerTransactionDateTime: '2026-10-14T04:59:20Z' })
    }));
    const recorded = repository.recordWebhookOutcome.mock.calls[0][0];
    expect(recorded.receipt).not.toHaveProperty('signature');
    expect(recorded.receipt).not.toHaveProperty('accountNumber');
  });

  test('preserves timezone-less provider transaction time without using the server timezone', async () => {
    const signedData = { ...requestBody.data, transactionDateTime: '2023-02-04 18:25:00' };
    const { service, repository } = createService({ signedData });

    await service.handleWebhook(requestBody);

    expect(repository.recordWebhookOutcome.mock.calls[0][0].receipt.providerTransactionDateTime)
      .toBe('2023-02-04 18:25:00');
  });

  test('five identical callback replays create one payment transition and four duplicates', async () => {
    const { service, repository } = createService();
    const results = [];

    for (let replay = 0; replay < 5; replay += 1) results.push(await service.handleWebhook(requestBody));

    expect(results.map(result => result.status)).toEqual([
      'PAYMENT_VERIFIED', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE', 'DUPLICATE'
    ]);
    expect(repository.recordWebhookOutcome).toHaveBeenCalledTimes(5);
    expect(repository.receipts.size).toBe(1);
    expect(repository.intents.get('73105').state).toBe('PAID');
  });

  test('a rejected signature never reads or writes payment state', async () => {
    const signatureError = Object.assign(new Error('signature mismatch'), { code: 'PAYOS_SIGNATURE_INVALID' });
    const { service, repository, provider } = createService({ verifyWebhook: jest.fn(async () => { throw signatureError; }) });

    await expect(service.handleWebhook(requestBody)).rejects.toBe(signatureError);
    expect(provider.verifyWebhook).toHaveBeenCalledWith(requestBody);
    expect(repository.findPaymentIntentByProviderReference).not.toHaveBeenCalled();
    expect(repository.recordWebhookOutcome).not.toHaveBeenCalled();
  });

  test('a browser return success envelope is not accepted without provider signature verification', async () => {
    const browserReturn = { code: '00', success: true, orderCode: 73105, amount: 250000 };
    const { service, repository } = createService({
      verifyWebhook: jest.fn(async () => { throw new Error('missing payOS signature'); })
    });

    await expect(service.handleWebhook(browserReturn)).rejects.toThrow('missing payOS signature');
    expect(repository.recordWebhookOutcome).not.toHaveBeenCalled();
  });

  test.each([
    ['zero amount', { amount: 0 }, 'INVALID_AMOUNT'],
    ['fractional amount', { amount: 250000.5 }, 'INVALID_AMOUNT'],
    ['string amount', { amount: '250000' }, 'INVALID_AMOUNT'],
    ['amount mismatch', { amount: 250001 }, 'AMOUNT_MISMATCH'],
    ['currency mismatch', { currency: 'USD' }, 'CURRENCY_MISMATCH'],
    ['missing currency', { currency: undefined }, 'CURRENCY_MISMATCH'],
    ['wrong provider order reference', { orderCode: 73106 }, 'UNKNOWN_REFERENCE'],
    ['missing transaction reference', { reference: '' }, 'TRANSACTION_REFERENCE_MISSING'],
    ['non-success provider code', { code: '01' }, 'PROVIDER_PAYMENT_NOT_SUCCESSFUL']
  ])('routes %s into reconciliation', async (_label, patch, reason) => {
    const { service, repository } = createService({ signedData: { ...requestBody.data, ...patch } });

    await expect(service.handleWebhook(requestBody)).resolves.toEqual({ status: 'RECONCILIATION_REQUIRED', reason });
    expect(repository.recordWebhookOutcome.mock.calls[0][0].decision).toMatchObject({ type: 'RECONCILE', reason });
  });

  test.each([
    ['late callback after intent expiry', createIntent({ expiresAt: '2026-10-14T05:00:00.000Z' }), 'INTENT_EXPIRED'],
    ['expired intent', createIntent({ state: 'EXPIRED' }), 'INTENT_EXPIRED'],
    ['paid intent with a different event', createIntent({ state: 'PAID' }), 'INTENT_NOT_PENDING'],
    ['cancelled booking', createIntent({ bookingState: 'CANCELLED' }), 'BOOKING_NOT_PAYABLE'],
    ['closed booking', createIntent({ bookingState: 'CLOSED' }), 'BOOKING_NOT_PAYABLE'],
    ['non-prepay booking state', createIntent({ bookingState: 'DISPATCH_PENDING' }), 'BOOKING_NOT_AWAITING_PAYMENT'],
    ['missing intent expiry', createIntent({ expiresAt: undefined }), 'INTENT_EXPIRY_UNAVAILABLE']
  ])('routes %s into reconciliation', async (_label, intent, reason) => {
    const { service } = createService({ intent });

    await expect(service.handleWebhook(requestBody)).resolves.toEqual({ status: 'RECONCILIATION_REQUIRED', reason });
  });

  test('routes a repository concurrency conflict into reconciliation', async () => {
    const { service } = createService({
      commitOverride: async () => ({ status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_CHANGED_DURING_WEBHOOK' })
    });

    await expect(service.handleWebhook(requestBody)).resolves.toEqual({
      status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_CHANGED_DURING_WEBHOOK'
    });
  });

  test('does not trust the unsigned top-level success flag', async () => {
    const signedData = { ...requestBody.data, code: '01' };
    const { service } = createService({ signedData });

    await expect(service.handleWebhook({ ...requestBody, success: true })).resolves.toEqual({
      status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL'
    });
  });

  test('checks the returned intent against the provider order reference', async () => {
    const repository = {
      findPaymentIntentByProviderReference: jest.fn(async () => createIntent({ providerReference: '73106' })),
      recordWebhookOutcome: jest.fn(async ({ decision }) => ({
        status: 'RECONCILIATION_REQUIRED', reason: decision.reason
      }))
    };
    const service = createPayosPaymentWebhookService({
      provider: { verifyWebhook: jest.fn(async () => requestBody.data) }, repository, clock: () => receivedAt
    });

    await expect(service.handleWebhook(requestBody)).resolves.toEqual({
      status: 'RECONCILIATION_REQUIRED', reason: 'REFERENCE_MISMATCH'
    });
  });

  test('requires verifier to return signed data and repository to return a known outcome', async () => {
    const provider = { verifyWebhook: jest.fn(async () => null) };
    const repository = createRepository();
    const service = createPayosPaymentWebhookService({ provider, repository, clock: () => receivedAt });

    await expect(service.handleWebhook(requestBody)).rejects.toThrow('payOS verifier must return signed webhook data');
    expect(repository.findPaymentIntentByProviderReference).not.toHaveBeenCalled();
  });
});
