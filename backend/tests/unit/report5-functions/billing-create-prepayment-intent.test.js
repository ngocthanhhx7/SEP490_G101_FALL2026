// Một file chỉ gọi createPrepaymentIntent; xem giới hạn kiểm thử trong README.
import { test, expect, jest } from '@jest/globals';
import { createBillingService } from '../../../src/services/billing/billing.service.js';

const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const HOUR = 3600000;
const OWNER = 'customer-srs-01';
const BOOKING = 'booking-srs-01';
function owned(record, query) {
  // Chỉ áp các điều kiện được truyền, không hard-code trả null cho ca khác chủ.
  return Object.entries(query).every(([key, value]) => {
    const field = key === 'actorId' ? 'ownerId' : key;
    return record[field] === value;
  });
}
function fixture() {
  const context = { ownerId: OWNER, bookingId: BOOKING, bookingState: 'CONFIRMED', version: 3,
    paymentTerms: { originalVisitCount: 1, paymentMode: 'POSTPAY', quoteVersion: 7,
      quoteSnapshotVersion: 'quote-srs-07', amountVnd: 300000, currency: 'VND', paymentState: 'UNPAID' } };
  const state = { context,
    eligibility: { state: 'READY', holdRefs: [], snapshotVersion: 'final-bill-srs-01',
      amountVnd: 300000, currency: 'VND', dueAt: new Date(NOW + 48 * HOUR) },
    intents: [], bills: [] };
  const bookings = {
    findOwnedPaymentContext: jest.fn(async query => owned(context, query) ? globalThis.structuredClone(context) : null),
    findOwnedVisitBillingContext: jest.fn(async query => owned(context, query) ? globalThis.structuredClone(context) : null),
  };
  const paymentIntents = { replayExistingIntent: jest.fn(async () => null),
    createOrReplayPending: jest.fn(async input => {
      const saved = { id: 'intent-srs-01', state: 'PENDING', ...globalThis.structuredClone(input) };
      state.intents.push(saved); return globalThis.structuredClone(saved);
    }) };
  const postpayEligibility = { resolve: jest.fn(async () => globalThis.structuredClone(state.eligibility)) };
  const bills = { replayExistingBill: jest.fn(async () => null), issueIfAbsent: jest.fn(async input => {
    const saved = { id: 'bill-srs-01', state: 'ISSUED', ...globalThis.structuredClone(input) };
    state.bills.push(saved); return globalThis.structuredClone(saved);
  }) };
  const createPrepaymentIntent = createBillingService({ bookings, paymentIntents, postpayEligibility, bills,
    clock: () => new Date(NOW) }).createPrepaymentIntent;
  const command = { actorId: OWNER, bookingId: BOOKING, expectedVersion: 3,
    idempotencyKey: 'srs-bill-command', quoteVersion: 7 };
  return { state, bookings, paymentIntents, postpayEligibility, bills, createPrepaymentIntent, command };
}

// SRS: UC-25 Description/Postconditions; III.7.1; UC-49 Preconditions — chỉ trả sau booking.
test("BILL-02-UTCID01 [A] Không tạo intent trả trước cho booking một lượt còn đang thực hiện", async () => {
  const f = fixture();

  let error = null;
  try {
    await f.createPrepaymentIntent(f.command);
  } catch (caught) {
    error = caught;
  }

  expect({ rejected: error?.name === 'AppError', intents: f.state.intents.length, bills: f.state.bills.length }).toEqual({
    rejected: true, intents: 0, bills: 0,
  });
});

// SRS: UC-25 Description/Postconditions; GBR-17; UC-49 — nhiều lượt vẫn trả sau.
test("BILL-02-UTCID02 [A] Không tạo intent trả trước cho booking hai lượt còn đang thực hiện", async () => {
  const f = fixture();
  f.state.context.paymentTerms.originalVisitCount = 2;
  let error = null;
  try {
    await f.createPrepaymentIntent(f.command);
  } catch (caught) {
    error = caught;
  }

  expect({ rejected: error?.name === 'AppError', intents: f.state.intents.length, bills: f.state.bills.length }).toEqual({
    rejected: true, intents: 0, bills: 0,
  });
});

// SRS: UC-25 Description/Postconditions; III.7.1; GBR-17; UC-49 — không cho thu trước dù snapshot code gán PREPAY.
// Defect: DEF_BILL_PREPAY_01 — giữ expected theo SRS, không skip/failing.
test("BILL-02-UTCID03 [A] Không chấp nhận snapshot tự gán PREPAY trước khi booking kết thúc", async () => {
  const f = fixture();
  // Tái hiện snapshot từ nhánh PREPAY đang có trong source, không coi đây là cấu hình hợp lệ theo SRS.
  f.state.context.bookingState = 'AWAITING_PAYMENT';
  f.state.context.paymentTerms.originalVisitCount = 2;
  f.state.context.paymentTerms.paymentMode = 'PREPAY';
  f.state.context.paymentTerms.paymentDeadlineAt = new Date(NOW + HOUR);
  let error = null;
  try {
    await f.createPrepaymentIntent(f.command);
  } catch (caught) {
    error = caught;
  }

  expect({ rejected: error?.name === 'AppError', intents: f.state.intents.length, bills: f.state.bills.length }).toEqual({
    rejected: true, intents: 0, bills: 0,
  });
});

// SRS: I.4.4 — Customer chỉ thao tác booking/bill của mình; GBR-02; UC-49 actor.
test("BILL-02-UTCID04 [A] Customer khác không tạo được intent cho booking không thuộc mình", async () => {
  const f = fixture();
  f.command.actorId = 'customer-other';

  await expect(f.createPrepaymentIntent(f.command)).rejects.toMatchObject({ name: 'AppError', status: 404, code: 'RESOURCE_NOT_FOUND' });
  expect(f.bookings.findOwnedPaymentContext).toHaveBeenCalledWith({ actorId: 'customer-other', bookingId: BOOKING });
  expect(f.paymentIntents.createOrReplayPending).not.toHaveBeenCalled();
  expect(f.state.intents).toEqual([]);
});
