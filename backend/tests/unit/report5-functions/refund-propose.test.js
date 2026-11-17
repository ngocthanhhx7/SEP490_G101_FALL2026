import { test, expect, jest } from '@jest/globals';
import { createRefundService } from '../../../src/services/refunds/refund.service.js';

const STAFF = { userId: 'synthetic-staff', roles: ['STAFF'], state: 'ACTIVE' };
const ADMIN = { userId: 'synthetic-admin', roles: ['ADMIN'], state: 'ACTIVE' };
const CUSTOMER = { userId: 'synthetic-customer', roles: ['CUSTOMER'], state: 'ACTIVE' };
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
    authorizeSource, clock: () => new Date(NOW) }).propose;
  return { propose: target, refunds, ledger, capacity, state: () => committed };
}

function command() {
  return { actor: STAFF, idempotencyKey: 'synthetic-proposal-01', input: {
    sourceRef: SOURCE, amountVnd: 30000, reason: 'Bồi hoàn sự cố chăm sóc',
    evidenceRefs: ['synthetic-evidence'] } };
}

// SRS: UC-48 Normal 4; GBR-30; UC-51 Preconditions.
test("REFUND-01-UTCID01 [N] Staff đề xuất có lý do và bằng chứng để Admin duyệt", async () => {
  const f = fixture();
  const actual = await f.propose(command());
  expect(actual).toMatchObject({ amountVnd: 30000, status: 'PROPOSED', transfer: null });
  expect(f.refunds.create.mock.calls[0][0]).toMatchObject({ reason: command().input.reason,
    evidenceRefs: ['synthetic-evidence'], proposedBy: STAFF.userId });
  expect(f.state().events).toHaveLength(1);
  expect(f.state().ledger).toHaveLength(0);
  expect(f.state().paid).toBe(0);
});

// SRS: UC-48 Normal 4; GBR-30.
test("REFUND-01-UTCID02 [A] Không nhận đề xuất thiếu lý do", async () => {
  const f = fixture();
  const input = command();
  input.input.reason = '';
  await expect(f.propose(input)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.refunds.create).not.toHaveBeenCalled();
});

// SRS: UC-48 Normal 4; GBR-30.
// DEF_REF_EVIDENCE_01: giữ kỳ vọng SRS; ca được chạy bình thường.
test("REFUND-01-UTCID03 [A] Không nhận đề xuất thiếu bằng chứng", async () => {
  const f = fixture();
  const input = command();
  delete input.input.evidenceRefs;
  // GBR-30 bắt buộc reason và evidence; SRS không ấn định mã lỗi kỹ thuật.
  await expect(f.propose(input)).rejects.toBeDefined();
  expect(f.refunds.create).not.toHaveBeenCalled();
});

// SRS: GBR-30: tổng hoàn không vượt bill.
test("REFUND-01-UTCID04 [B] Đề xuất bằng phần bill còn có thể hoàn", async () => {
  const f = fixture({ available: 30000 });
  const actual = await f.propose(command());
  expect(actual).toMatchObject({ amountVnd: 30000, status: 'PROPOSED' });
  expect(f.state().paid).toBe(0);
});

// SRS: GBR-30; UC-51 Alternative 3.
test("REFUND-01-UTCID05 [B] Đề xuất vượt phần bill còn lại một VND bị từ chối", async () => {
  const f = fixture({ available: 30000 });
  const input = command();
  input.input.amountVnd = 30001;
  await expect(f.propose(input)).rejects.toMatchObject({ status: 409, code: 'REFUND_LIMIT_EXCEEDED' });
  expect(f.refunds.create).not.toHaveBeenCalled();
});

// SRS: I.4.4 Permission Matrix; GBR-02/30.
test("REFUND-01-UTCID06 [A] Customer không được tự đề xuất khoản hoàn theo quyền Staff", async () => {
  const f = fixture();
  await expect(f.propose({ ...command(), actor: CUSTOMER })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  expect(f.refunds.create).not.toHaveBeenCalled();
});

// SRS: GBR-03; GBR-30.
test("REFUND-01-UTCID07 [N] Admin kế thừa quyền Staff được lập đề xuất", async () => {
  const f = fixture();
  const actual = await f.propose({ ...command(), actor: ADMIN });
  expect(actual.status).toBe('PROPOSED');
  expect(f.refunds.create.mock.calls[0][0].proposedBy).toBe(ADMIN.userId);
});
