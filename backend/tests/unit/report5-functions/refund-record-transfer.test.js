import { test, expect, jest } from '@jest/globals';
import { createRefundService } from '../../../src/services/refunds/refund.service.js';

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
    authorizeSource, clock: () => new Date(NOW) }).recordTransfer;
  return { recordTransfer: target, refunds, ledger, capacity, state: () => committed };
}

function command() {
  return { actor: ADMIN, refundId: 'synthetic-refund', outcome: 'CONFIRMED', amountVnd: 30000,
    transferReference: 'SYNTHETIC-TRANSFER-01', evidenceReference: 'synthetic-proof-01',
    paidAt: '2026-11-12T02:30:00.000Z', expectedVersion: 0,
    idempotencyKey: 'synthetic-transfer-01' };
}

// SRS: GBR-30; UC-51 Normal 4; I.3 Entity Refund.
test("REFUND-03-UTCID01 [N] Ghi nhận khoản kế toán đã trả ngoài PWC sau khi Admin duyệt", async () => {
  const f = fixture({ status: 'APPROVED' });
  const actual = await f.recordTransfer(command());
  expect(actual).toMatchObject({ status: 'PAID', amountVnd: 30000, transfer: {
    outcome: 'CONFIRMED', amountVnd: 30000, reference: 'SYNTHETIC-TRANSFER-01',
    evidenceReference: 'synthetic-proof-01', paidAt: '2026-11-12T02:30:00.000Z' } });
  expect(f.state().paid).toBe(30000);
  expect(f.state().reservation).toBe(0);
  expect(f.state().ledger).toEqual([expect.objectContaining({ entryType: 'REFUND_PAID', amountVnd: 30000 })]);
  expect(f.state().events[0].type).toBe('REFUND_TRANSFER_CONFIRMED');
});

// SRS: GBR-30; UC-51 Description / Preconditions.
test("REFUND-03-UTCID02 [A] Không ghi trả khoản mới đề xuất chưa được Admin duyệt", async () => {
  const f = fixture({ status: 'PROPOSED' });
  await expect(f.recordTransfer(command())).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  expect(f.refunds.settleRefundReservation).not.toHaveBeenCalled();
  expect(f.state().paid).toBe(0);
  expect(f.state().ledger).toHaveLength(0);
});
