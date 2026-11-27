import express from 'express';
import request from 'supertest';
import { describe, expect, test } from '@jest/globals';
import { createFinanceSourceController } from '../../src/controllers/finance-source.controller.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';

const NOW = new Date('2026-11-25T10:00:00.000Z');

function createFixture({ expiresAt = new Date(NOW.getTime() + 15 * 60000) } = {}) {
  const state = {
    intent: { id: 'intent-fe16', version: 0, state: 'PENDING', providerReference: '160001', amountVnd: 120000,
      currency: 'VND', expiresAt, bookingState: 'AWAITING_PAYMENT' },
    payments: [], events: [], commands: new Set()
  };
  const receipt = { orderCode: 160001, reference: 'bank-fe16', amount: 120000, currency: 'VND', code: '00',
    paymentLinkId: 'link-fe16', transactionDateTime: '2026-11-25 10:01:00' };
  const repository = {
    async findPaymentIntentByProviderReference(reference) {
      return String(reference) === state.intent.providerReference ? { ...state.intent } : null;
    },
    async recordWebhookOutcome({ eventId, receipt: stored, decision }) {
      if (state.commands.has(eventId)) return { status: 'DUPLICATE' };
      state.commands.add(eventId);
      state.payments.push({ ...stored, state: decision.type === 'MARK_PAID' ? 'VERIFIED' : 'RECONCILIATION_REQUIRED' });
      state.events.push({ eventId, type: decision.type === 'MARK_PAID' ? 'PaymentVerified' : 'PaymentReconciliationRequired' });
      if (decision.type === 'MARK_PAID') {
        state.intent = { ...state.intent, state: 'PAID', version: 1, bookingState: 'CONFIRMED' };
        return { status: 'APPLIED' };
      }
      return { status: 'RECONCILIATION_REQUIRED', reason: decision.reason };
    }
  };
  let verify = data => data;
  const provider = { verifyWebhook: async body => verify(body.data) };
  const webhook = createPayosPaymentWebhookService({ provider, repository, clock: () => NOW });
  const app = express();
  app.use(express.json());
  const controller = createFinanceSourceController({ webhook });
  app.post('/api/v1/payments/payos/webhook', controller.payment);
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: { code: error.code } }));
  return { app, webhook, receipt, state, setVerifier: value => { verify = value; } };
}

describe('FE-16 UC-49/UC-50 - Payment Processing', () => {
  test.todo('IT-FE16-UC49-01 creates a valid payOS VietQR Payment Link while Booking awaits payment');

  test('IT-FE16-UC49-02 verifies a signed payOS success webhook and confirms the Booking', async () => {
    const fixture = createFixture();
    const response = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({ data: fixture.receipt }).expect(200);
    expect(response.body.data).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(fixture.state.intent).toMatchObject({ state: 'PAID', bookingState: 'CONFIRMED' });
    expect(fixture.state.payments).toHaveLength(1);
    expect(fixture.state.payments[0]).toMatchObject({ state: 'VERIFIED', amountVnd: 120000, currency: 'VND' });
  });

  test.todo('IT-FE16-UC49-03 dispatches Visits to Pet Sitters only after payment confirmation');

  test.todo('IT-FE16-UC49-04 keeps Awaiting payment when payOS cannot create a Payment Link');

  test('IT-FE16-UC49-05 records a failed or cancelled payOS result without confirming the Booking', async () => {
    const fixture = createFixture();
    const response = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({
      data: { ...fixture.receipt, code: '01', reference: 'bank-fe16-failed' }
    }).expect(200);
    expect(response.body.data).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'PROVIDER_PAYMENT_NOT_SUCCESSFUL' });
    expect(fixture.state.intent).toMatchObject({ state: 'PENDING', bookingState: 'AWAITING_PAYMENT' });
    expect(fixture.state.payments[0].state).toBe('RECONCILIATION_REQUIRED');
  });

  test.todo('IT-FE16-UC49-06 creates a new Payment Link after a failed payment and confirms on retry');

  test('IT-FE16-UC49-07 rejects a payOS webhook with an invalid signature before persistence', async () => {
    const fixture = createFixture();
    fixture.setVerifier(() => { const error = new Error('Invalid signature'); error.status = 401; error.code = 'PAYOS_SIGNATURE_INVALID'; throw error; });
    const response = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({ data: fixture.receipt });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('PAYOS_SIGNATURE_INVALID');
    expect(fixture.state.payments).toHaveLength(0);
  });

  test('IT-FE16-UC49-08 deduplicates repeated payOS results for one Booking', async () => {
    const fixture = createFixture();
    const first = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({ data: fixture.receipt }).expect(200);
    const second = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({ data: fixture.receipt }).expect(200);
    expect(first.body.data).toEqual({ status: 'PAYMENT_VERIFIED' });
    expect(second.body.data).toEqual({ status: 'DUPLICATE' });
    expect(fixture.state.payments).toHaveLength(1);
    expect(fixture.state.events).toHaveLength(1);
  });

  test('IT-FE16-UC49-09 keeps an expired unpaid intent from being marked paid', async () => {
    const fixture = createFixture({ expiresAt: new Date(NOW.getTime() - 1) });
    const response = await request(fixture.app).post('/api/v1/payments/payos/webhook').send({ data: fixture.receipt }).expect(200);
    expect(response.body.data).toEqual({ status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_EXPIRED' });
    expect(fixture.state.intent).toMatchObject({ state: 'PENDING', bookingState: 'AWAITING_PAYMENT' });
  });

  test.todo('IT-FE16-UC49-10 retries JOB-03 when payOS is unavailable during expiry reconciliation');

  test('IT-FE16-UC49-11 applies one result when webhook and verified-payment handlers run concurrently in memory', async () => {
    const fixture = createFixture();
    const [webhookResult, verifiedPaymentResult] = await Promise.all([
      fixture.webhook.handleWebhook({ data: fixture.receipt }),
      fixture.webhook.handleVerifiedPayment(fixture.receipt)
    ]);
    expect([webhookResult.status, verifiedPaymentResult.status].sort()).toEqual(['DUPLICATE', 'PAYMENT_VERIFIED']);
    expect(fixture.state.payments).toHaveLength(1);
    expect(fixture.state.intent.bookingState).toBe('CONFIRMED');
  });

  test.todo('IT-FE16-UC49-12 records a full refund when payOS confirms after Booking expiry');
  test.todo('IT-FE16-UC49-13 displays Booking Payment details and the remaining 15-minute deadline');
  test.todo('IT-FE16-UC50-01 lists Customer unpaid Bookings and outstanding Grooming amounts');
  test.todo('IT-FE16-UC50-02 opens the selected payable Booking Payment screen');
  test.todo('IT-FE16-UC50-03 shows MSG137 when there are no unpaid items');
  test.todo('IT-FE16-UC50-04 removes a Payment expired Booking from Unpaid Bookings');
  test.todo('IT-FE16-UC50-05 blocks new Booking/Grooming creation while Shop amount remains unpaid');
  test.todo('IT-FE16-UC50-06 separates Booking and Shop outstanding amounts into the correct tabs');
  test.todo('IT-FE16-UC50-07 opens only the selected Customer Booking from Pay');
});
