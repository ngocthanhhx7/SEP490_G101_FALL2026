import { test, expect, jest } from '@jest/globals';
import { createRefundService } from '../../../src/services/refunds/refund.service.js';

const STAFF = { userId: 'synthetic-staff', roles: ['STAFF'], state: 'ACTIVE' };
const ADMIN = { userId: 'synthetic-admin', roles: ['ADMIN'], state: 'ACTIVE' };
const SOURCE = { type: 'CASE', id: 'synthetic-complaint' };
const NOW = '2026-11-12T03:00:00.000Z';

// Chỉ dựng dữ liệu và repository double; không gọi propose/decide để seed hàm khác.
function fixture({ status = 'PROPOSED', amount = 30000, available = 100000,
  billPaid = true } = {}) {
  let committed = { records: new Map([['synthetic-refund', { id: 'synthetic-refund',
    sourceRef: SOURCE, amountVnd: amount, reason: 'Bồi hoàn sự cố chăm sóc',
    evidenceRefs: ['synthetic-evidence'], status, version: 0, createdAt: NOW }]]),
    commands: new Map(), events: [], ledger: [], available,
    reservation: status === 'APPROVED' ? amount : 0, paid: 0,
    bill: { paid: billPaid, totalVnd: 100000 } };
  const unitOfWork = { run: async callback => {
    const transaction = { state: globalThis.structuredClone(committed) };
    const result = await callback(transaction);
    committed = transaction.state;
    return result;
  } };
  const refunds = {
    findCommand: jest.fn(async ({ actorId, operation, key }, tx) =>
      tx.state.commands.get(`${actorId}:${operation}:${key}`) ?? null),
    saveCommand: jest.fn(async (command, tx) => {
      tx.state.commands.set(`${command.actorId}:${command.operation}:${command.key}`, command);
    }),
    create: jest.fn(async (record, tx) => {
      const created = { id: 'synthetic-new-refund', ...record };
      tx.state.records.set(created.id, created);
      return created;
    }),
    getById: jest.fn(async (id, tx) => tx.state.records.get(id) ?? null),
    compareAndSet: jest.fn(async (id, version, patch, tx) => {
      const current = tx.state.records.get(id);
      if (!current || current.version !== version) return null;
      const updated = { ...current, ...patch };
      tx.state.records.set(id, updated);
      return updated;
    }),
    reserveRefundableAmount: jest.fn(async ({ amountVnd }, tx) => {
      if (amountVnd > tx.state.available) return false;
      tx.state.available -= amountVnd;
      tx.state.reservation += amountVnd;
      return true;
    }),
    settleRefundReservation: jest.fn(async ({ amountVnd }, tx) => {
      if (tx.state.reservation !== amountVnd) return false;
      tx.state.reservation = 0;
      tx.state.paid += amountVnd;
      return true;
    }),
    releaseRefundReservation: jest.fn(async ({ amountVnd }, tx) => {
      if (tx.state.reservation !== amountVnd) return false;
      tx.state.reservation = 0;
      tx.state.available += amountVnd;
      return true;
    }),
    appendEvent: jest.fn(async (event, tx) => { tx.state.events.push(event); })
  };
  const ledger = { append: jest.fn(async (entry, tx) => { tx.state.ledger.push(entry); }) };
  const capacity = { resolve: jest.fn(async ({ transaction }) => ({ ready: true,
    decisionIds: [], bucket: 'REFUNDABLE_AVAILABLE',
    availableRefundableVnd: transaction.state.available })) };
  const authorizeSource = jest.fn(async ({ sourceRef }) => sourceRef.id === SOURCE.id);
  const target = createRefundService({ unitOfWork, refunds, ledger, capacity,
    authorizeSource, clock: () => new Date(NOW) }).decide;
  return { decide: target, refunds, ledger, capacity, state: () => committed };
}

function command() {
  return { actor: ADMIN, refundId: 'synthetic-refund', decision: 'APPROVE',
    reason: 'Đã kiểm tra bill và bằng chứng', expectedVersion: 0,
    idempotencyKey: 'synthetic-decision-01' };
}

// SRS: UC-51 Normal 3–4; GBR-30.
test("REFUND-02-UTCID01 [N] Admin duyệt nguyên số tiền cho bill đã trả", async () => {
  const f = fixture();
  const actual = await f.decide(command());
  expect(actual).toMatchObject({ amountVnd: 30000, status: 'APPROVED', decision: { outcome: 'APPROVE' } });
  expect(f.state().reservation).toBe(30000);
  expect(f.state().ledger).toEqual([expect.objectContaining({ entryType: 'REFUND_RESERVED', amountVnd: 30000 })]);
  expect(f.state().paid).toBe(0);
});

// SRS: UC-51 Alternative 3.1; GBR-30.
test("REFUND-02-UTCID02 [N] Admin từ chối có lý do và không đổi bill", async () => {
  const f = fixture();
  const input = { ...command(), decision: 'REJECT', reason: 'Bằng chứng không xác nhận thiệt hại' };
  const actual = await f.decide(input);
  expect(actual).toMatchObject({ status: 'REJECTED', decision: { outcome: 'REJECT', reason: input.reason } });
  expect(f.state().bill.totalVnd).toBe(100000);
  expect(f.state().reservation).toBe(0);
  expect(f.state().ledger).toHaveLength(0);
});

// SRS: UC-51 Normal 3 / Alternative 4.1 / Postconditions; GBR-30.
// DEF_REF_LOWER_01: giữ kỳ vọng SRS; ca được chạy bình thường.
test("REFUND-02-UTCID03 [N] Admin giảm khoản đề xuất từ 30000 xuống 20000", async () => {
  const f = fixture();
  // amountVnd biểu diễn yêu cầu giảm của Admin; API hiện không nhận trường này.
  // Tên field là probe hợp đồng, không phải tên được SRS quy định.
  const actual = await f.decide({ ...command(), amountVnd: 20000 });
  expect(actual).toMatchObject({ amountVnd: 20000, status: 'APPROVED' });
  expect(f.state().reservation).toBe(20000);
});

// SRS: UC-51 Normal 4 / Postconditions; GBR-30.
// DEF_REF_UNPAID_01: giữ kỳ vọng SRS; ca được chạy bình thường.
test("REFUND-02-UTCID04 [N] Duyệt khi bill chưa trả phải giảm bill thay vì hoàn khoản đã thu", async () => {
  const f = fixture({ billPaid: false, available: 0 });
  // Fixture thực tế: chưa thu tiền nên khả năng hoàn tiền đã thu bằng 0.
  // Service hiện thiếu port trừ bill, không giả vờ rằng refund reserve là giảm bill.
  const actual = await f.decide(command());
  expect(actual.status).toBe('APPROVED');
  expect(f.state().bill.totalVnd).toBe(70000);
  expect(f.state().reservation).toBe(0);
});

// SRS: UC-51 Primary Actor; I.4.4; GBR-02/30.
test("REFUND-02-UTCID05 [A] Staff không được phê duyệt khoản hoàn", async () => {
  const f = fixture();
  await expect(f.decide({ ...command(), actor: STAFF })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.refunds.compareAndSet).not.toHaveBeenCalled();
  expect(f.state().reservation).toBe(0);
});

// SRS: UC-51 Normal 3; GBR-30.
test("REFUND-02-UTCID06 [B] Duyệt phần còn lại để tổng hoàn vừa bằng bill", async () => {
  const f = fixture({ available: 30000 });
  const actual = await f.decide(command());
  expect(actual).toMatchObject({ status: 'APPROVED', amountVnd: 30000 });
  expect(f.state().available).toBe(0);
  expect(f.state().reservation).toBe(30000);
});

// SRS: UC-51 Alternative 3; GBR-30.
test("REFUND-02-UTCID07 [B] Không duyệt khi tổng hoàn vượt bill một VND", async () => {
  const f = fixture({ amount: 30001, available: 30000 });
  await expect(f.decide(command())).rejects.toMatchObject({ status: 409, code: 'REFUND_LIMIT_EXCEEDED' });
  expect(f.refunds.compareAndSet).not.toHaveBeenCalled();
  expect(f.state().reservation).toBe(0);
  expect(f.state().ledger).toHaveLength(0);
});
