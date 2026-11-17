import { test, expect, jest } from '@jest/globals';
import { createPayosPaymentWebhookService } from '../../../src/services/providers/payos/payment-webhook.service.js';

// Chữ ký đã được xác minh tại port provider; crypto có file test riêng verifyWebhook.
const DATA = { orderCode: 345001, amount: 100000, currency: 'VND', code: '00',
  reference: 'SYNTHETIC-BANK-01', paymentLinkId: 'synthetic-link',
  transactionDateTime: '2026-11-12T02:00:00Z', accountNumber: 'SYNTHETIC-ACCOUNT' };
function body() { return { data: { ...DATA }, signature: 'synthetic-verified-by-port' }; }
function fixture({ now = '2026-11-12T03:00:00Z', invalidSignature = false } = {}) {
  const state = { intent: { id: 'synthetic-intent', providerReference: '345001',
    amountVnd: 100000, currency: 'VND', state: 'PENDING', version: 0,
    expiresAt: '2026-11-12T04:00:00Z', bookingState: 'AWAITING_PAYMENT' },
    receipts: new Map(), payments: [], outbox: [] };
  const provider = { verifyWebhook: jest.fn(async input => {
    if (invalidSignature) throw Object.assign(new Error('Invalid webhook signature'),
      { code: 'PAYOS_INVALID_SIGNATURE' });
    return { ...input.data };
  }) };
  const repository = {
    findPaymentIntentByProviderReference: jest.fn(async reference =>
      reference === state.intent.providerReference ? { ...state.intent } : null),
    recordWebhookOutcome: jest.fn(async input => {
      if (state.receipts.has(input.eventId)) return { status: 'DUPLICATE' };
      const { decision } = input;
      if (decision.type === 'MARK_PAID') {
        if (state.intent.state !== decision.expectedIntentState
          || state.intent.bookingState !== decision.expectedBookingState
          || state.intent.version !== decision.expectedIntentVersion
          || new Date(now) >= new Date(state.intent.expiresAt)) {
          return { status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_CHANGED_DURING_WEBHOOK' };
        }
        state.intent.state = 'PAID';
        state.intent.bookingState = 'PAID';
        state.intent.version += 1;
        state.payments.push({ orderCode: input.receipt.providerOrderCode,
          amountVnd: input.receipt.amountVnd });
      }
      state.receipts.set(input.eventId, input.receipt);
      state.outbox.push(input.outboxEvent);
      return decision.type === 'MARK_PAID' ? { status: 'APPLIED' }
        : { status: 'RECONCILIATION_REQUIRED', reason: decision.reason };
    })
  };
  const handleWebhook = createPayosPaymentWebhookService({ provider, repository,
    clock: () => new Date(now) }).handleWebhook;
  return { handleWebhook, provider, repository, state };
}

// SRS: UC-49 Normal 5–6 / Postconditions; API-03; GBR-18; IV.3 Payment details.
test("PAY-WH-01-UTCID01 [N] Ghi nhận kết quả hợp lệ và chuyển booking Paid một lần", async () => {
  const f = fixture();
  const input = body();
  const actual = await f.handleWebhook(input);
  expect(actual).toEqual({ status: 'PAYMENT_VERIFIED' });
  expect(f.provider.verifyWebhook).toHaveBeenCalledWith(input);
  expect(f.state.intent).toMatchObject({ state: 'PAID', bookingState: 'PAID' });
  expect(f.state.payments).toEqual([{ orderCode: '345001', amountVnd: 100000 }]);
  expect(f.state.outbox).toHaveLength(1);
  // IV.3: chỉ lưu receipt đã lược bỏ thông tin ngân hàng/signature.
  const saved = [...f.state.receipts.values()][0];
  expect(saved).not.toHaveProperty('accountNumber');
  expect(saved).not.toHaveProperty('signature');
});

// SRS: API-03; UC-49 Normal 6.
test("PAY-WH-01-UTCID02 [A] Từ chối chữ ký sai trước khi ghi dữ liệu", async () => {
  const f = fixture({ invalidSignature: true });
  await expect(f.handleWebhook(body())).rejects.toMatchObject({ code: 'PAYOS_INVALID_SIGNATURE' });
  expect(f.repository.findPaymentIntentByProviderReference).not.toHaveBeenCalled();
  expect(f.repository.recordWebhookOutcome).not.toHaveBeenCalled();
  expect(f.state.payments).toHaveLength(0);
});

// SRS: UC-49 Alternative 5.1; GBR-18; API-03.
test("PAY-WH-01-UTCID03 [N] Webhook lặp không tạo thêm payment", async () => {
  const f = fixture();
  await f.handleWebhook(body());
  const replay = await f.handleWebhook(body());
  expect(replay).toEqual({ status: 'DUPLICATE' });
  expect(f.state.payments).toHaveLength(1);
  expect(f.state.receipts.size).toBe(1);
  expect(f.state.outbox).toHaveLength(1);
});

// SRS: UC-49 Normal 6 / Alternative 5.1; GBR-18.
// DEF_WH_LATE_01: giữ kỳ vọng SRS; ca được chạy bình thường.
test("PAY-WH-01-UTCID04 [N] Kết quả đến trễ vẫn ghi khoản đã trả trước hạn", async () => {
  const f = fixture({ now: '2026-11-12T05:00:00Z' });
  await f.handleWebhook(body());
  // UC-49 Alternative 5.1: chậm callback không làm mất khoản đã thanh toán.
  expect(f.state.payments).toHaveLength(1);
  expect(f.state.intent.bookingState).toBe('PAID');
});

// SRS: UC-49 Alternative 5; I.3 Entity Payment lifecycle.
// DEF_WH_FAILURE_01: giữ kỳ vọng SRS; ca được chạy bình thường.
test("PAY-WH-01-UTCID05 [A] Kết quả thanh toán thất bại được ghi Failed và bill vẫn chưa trả", async () => {
  const f = fixture();
  const input = body();
  input.data.code = '99';
  await f.handleWebhook(input);
  expect(f.state.payments).toHaveLength(0);
  expect(f.state.intent.bookingState).toBe('AWAITING_PAYMENT');
  // SRS Payment lifecycle: Pending → Failed; không chỉ để payment Pending.
  expect(f.state.intent.state).toBe('FAILED');
});
