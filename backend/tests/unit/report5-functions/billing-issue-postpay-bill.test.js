// Một file chỉ gọi issuePostpayBill; xem giới hạn kiểm thử trong README.
import { test, expect, jest } from '@jest/globals';
import { createBillingService } from '../../../src/services/billing/billing.service.js';

const NOW = Date.parse('2026-11-12T03:00:00.000Z');
const HOUR = 3600000;
const OWNER = 'customer-srs-01';
const BOOKING = 'booking-srs-01';
const VISIT = 'visit-srs-01';
function owned(record, query) {
  // Chỉ áp các điều kiện được truyền, không hard-code trả null cho ca khác chủ.
  return Object.entries(query).every(([key, value]) => {
    const field = key === 'actorId' ? 'ownerId' : key;
    return record[field] === value;
  });
}
function fixture() {
  const context = { ownerId: OWNER, bookingId: BOOKING, visitId: VISIT, bookingState: 'COMPLETED',
    visitState: 'COMPLETED', version: 3, completedAt: new Date(NOW - HOUR),
    paymentTerms: { originalVisitCount: 1, paymentMode: 'POSTPAY', quoteVersion: 7, paymentState: 'UNPAID' } };
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
  const issuePostpayBill = createBillingService({ bookings, paymentIntents, postpayEligibility, bills,
    clock: () => new Date(NOW) }).issuePostpayBill;
  const command = { actorId: OWNER, bookingId: BOOKING, expectedVersion: 3,
    idempotencyKey: 'srs-bill-command', visitId: VISIT };
  return { state, bookings, paymentIntents, postpayEligibility, bills, issuePostpayBill, command };
}

// SRS: UC-49 Preconditions / bước 1; GBR-17 — bill final >0, hạn 48 h sau final.
test("BILL-03-UTCID01 [N] Lập bill cuối cùng cho booking một lượt đã kết thúc và không hold", async () => {
  const f = fixture();

  const actual = await f.issuePostpayBill(f.command);

  expect(actual).toMatchObject({ paymentMode: 'POSTPAY', bill: { state: 'ISSUED', amountVnd: 300000, currency: 'VND' } });
  expect(f.state.bills).toHaveLength(1);
  // dueAt là kết quả của eligibility port; không kết luận hàm này tự tính được hạn 48 h.
  expect(f.state.bills[0].dueAt).toEqual(new Date(NOW + 48 * HOUR));
  expect(f.state.bills[0].holdRefs).toEqual([]);
  expect(f.state.context.paymentTerms.paymentState).toBe('UNPAID');
  expect(f.paymentIntents.createOrReplayPending).not.toHaveBeenCalled();
});

// SRS: UC-25 Description/Postconditions; GBR-17; UC-49 — không giới hạn trả sau ở một lượt.
// Defect: DEF_BILL_PAYMENT_MODE_01 — giữ expected theo SRS, không skip/failing.
test("BILL-03-UTCID02 [N] Booking hai lượt đã kết thúc cũng được lập bill trả sau", async () => {
  const f = fixture();
  f.state.context.paymentTerms.originalVisitCount = 2;

  await expect(f.issuePostpayBill(f.command)).resolves.toMatchObject({ paymentMode: 'POSTPAY', bill: { state: 'ISSUED' } });
  expect(f.state.bills).toHaveLength(1);
});

// SRS: UC-49 Preconditions; GBR-17 — lập bill khi last visit kết thúc.
test("BILL-03-UTCID03 [A] Không lập bill khi booking và lượt vẫn chưa kết thúc", async () => {
  const f = fixture();
  f.state.context.bookingState = 'IN_PROGRESS';
  f.state.context.visitState = 'IN_PROGRESS';

  await expect(f.issuePostpayBill(f.command)).rejects.toMatchObject({ name: 'AppError', code: 'INVALID_STATE' });
  expect(f.bills.issueIfAbsent).not.toHaveBeenCalled();
  expect(f.state.bills).toEqual([]);
});

// SRS: UC-49 Alternative 1.1; GBR-17/26 — incident open giữ bill.
test("BILL-03-UTCID04 [A] Incident còn mở phải giữ bill chưa phát hành", async () => {
  const f = fixture();
  f.state.eligibility.holdRefs = ['incident-open'];

  await expect(f.issuePostpayBill(f.command)).rejects.toMatchObject({ name: 'AppError', code: 'DECISION_REQUIRED' });
  expect(f.bills.issueIfAbsent).not.toHaveBeenCalled();
  expect(f.state.bills).toEqual([]);
});

// SRS: UC-49 Alternative 1.1; GBR-26 — chờ final sau thời gian disagree/quyết định Admin.
test("BILL-03-UTCID05 [A] Kết quả complaint chưa final thì chưa lập bill", async () => {
  const f = fixture();
  f.state.eligibility.state = 'PENDING';
  f.state.eligibility.holdRefs = ['complaint-awaiting-final'];

  await expect(f.issuePostpayBill(f.command)).rejects.toMatchObject({ name: 'AppError', code: 'DECISION_REQUIRED' });
  expect(f.bills.issueIfAbsent).not.toHaveBeenCalled();
  expect(f.state.bills).toEqual([]);
});

// SRS: I.4.4 — dữ liệu riêng Customer; GBR-02; UC-49 actor.
test("BILL-03-UTCID06 [A] Customer không lập được bill cho booking của người khác", async () => {
  const f = fixture();
  f.command.actorId = 'customer-other';

  await expect(f.issuePostpayBill(f.command)).rejects.toMatchObject({ name: 'AppError', code: 'RESOURCE_NOT_FOUND' });
  expect(f.bills.issueIfAbsent).not.toHaveBeenCalled();
  expect(f.state.bills).toEqual([]);
});

// SRS: UC-49 Preconditions — last visit finished or cancelled; UC-39 Postconditions; GBR-15/17 — late cancellation fee.
// Defect: DEF_BILL_CANCELLED_VISIT_01 — giữ expected theo SRS, không skip/failing.
test("BILL-03-UTCID07 [N] Lượt cuối bị hủy muộn vẫn lập bill phí hủy sau khi booking kết thúc", async () => {
  const f = fixture();
  f.state.context.visitState = 'CANCELLED';
  f.state.eligibility.amountVnd = 30000;

  await expect(f.issuePostpayBill(f.command)).resolves.toMatchObject({ paymentMode: 'POSTPAY', bill: { amountVnd: 30000 } });
  expect(f.state.bills).toHaveLength(1);
});
