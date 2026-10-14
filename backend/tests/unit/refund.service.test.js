import { AppError } from '../../src/utils/app-error.js';
import { createRefundService, REFUND_STATUS } from '../../src/services/refunds/refund.service.js';
import { describe, expect, test } from '@jest/globals';

const STAFF = { userId: 'staff-1', roles: ['STAFF'], state: 'ACTIVE' };
const ADMIN = { userId: 'admin-1', roles: ['ADMIN'], state: 'ACTIVE' };
const CUSTOMER = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE' };
const SOURCE = { type: 'CANCELLATION', id: 'booking-1' };
const FIXED_NOW = new Date('2026-10-14T10:00:00.000Z');

function createHarness({ capacityVnd = 50000, decisionIds = [] } = {}) {
  let committed = {
    capacity: new Map([[`${SOURCE.type}:${SOURCE.id}`, capacityVnd]]),
    decisionIds: [...decisionIds], refunds: new Map(), commands: new Map(),
    reservations: new Map(), paid: new Map(), events: [], ledger: [], nextId: 1
  };
  let queued = Promise.resolve();
  function cloneState(state) {
    return {
      capacity: new Map(state.capacity), decisionIds: [...state.decisionIds],
      refunds: new Map([...state.refunds].map(([id, refund]) => [id, structuredRefund(refund)])),
      commands: new Map([...state.commands].map(([key, command]) => [key, structuredCommand(command)])),
      reservations: new Map(state.reservations), paid: new Map(state.paid),
      events: state.events.map(event => ({ ...event })), ledger: state.ledger.map(entry => ({ ...entry })),
      nextId: state.nextId
    };
  }
  function structuredRefund(refund) { return { ...refund, sourceRef: { ...refund.sourceRef },
    decision: refund.decision ? { ...refund.decision } : undefined,
    transfer: refund.transfer ? { ...refund.transfer } : undefined }; }
  function structuredCommand(command) { return { ...command, result: command.result ? { ...command.result } : command.result }; }
  const unitOfWork = {
    run(callback) {
      const previous = queued;
      let release;
      queued = new Promise(resolve => { release = resolve; });
      return previous.then(async () => {
        const transaction = { state: cloneState(committed) };
        try {
          const result = await callback(transaction);
          committed = transaction.state;
          return result;
        } finally {
          release();
        }
      });
    }
  };
  const keyOf = sourceRef => `${sourceRef.type}:${sourceRef.id}`;
  const refunds = {
    async findCommand({ actorId, operation, key }, transaction) {
      return transaction.state.commands.get(`${actorId}:${operation}:${key}`) ?? null;
    },
    async saveCommand({ actorId, operation, key, fingerprint, result }, transaction) {
      const commandKey = `${actorId}:${operation}:${key}`;
      if (transaction.state.commands.has(commandKey)) throw new Error('duplicate command');
      transaction.state.commands.set(commandKey, { fingerprint, result });
    },
    async create(record, transaction) {
      const id = String(transaction.state.nextId++).padStart(24, '0');
      const created = { id, ...record };
      transaction.state.refunds.set(id, created);
      return created;
    },
    async getById(id, transaction) {
      return transaction.state.refunds.get(id) ?? null;
    },
    async compareAndSet(id, expectedVersion, patch, transaction) {
      const current = transaction.state.refunds.get(id);
      if (!current || current.version !== expectedVersion) return null;
      const updated = { ...current, ...patch };
      transaction.state.refunds.set(id, updated);
      return updated;
    },
    async reserveRefundableAmount({ refundId, sourceRef, amountVnd }, transaction) {
      const key = keyOf(sourceRef);
      const available = transaction.state.capacity.get(key) ?? 0;
      if (available < amountVnd) return false;
      transaction.state.capacity.set(key, available - amountVnd);
      transaction.state.reservations.set(refundId, amountVnd);
      return true;
    },
    async settleRefundReservation({ refundId, amountVnd }, transaction) {
      if (transaction.state.reservations.get(refundId) !== amountVnd) return false;
      transaction.state.reservations.delete(refundId);
      transaction.state.paid.set(refundId, amountVnd);
      return true;
    },
    async releaseRefundReservation({ refundId, sourceRef, amountVnd }, transaction) {
      if (transaction.state.reservations.get(refundId) !== amountVnd) return false;
      transaction.state.reservations.delete(refundId);
      const key = keyOf(sourceRef);
      transaction.state.capacity.set(key, (transaction.state.capacity.get(key) ?? 0) + amountVnd);
      return true;
    },
    async appendEvent(event, transaction) { transaction.state.events.push(event); }
  };
  const ledger = { async append(entry, transaction) { transaction.state.ledger.push(entry); } };
  const capacity = { async resolve({ sourceRef, transaction }) {
    return { ready: true, bucket: 'REFUNDABLE_AVAILABLE', decisionIds: transaction.state.decisionIds,
      availableRefundableVnd: transaction.state.capacity.get(keyOf(sourceRef)) ?? 0 };
  } };
  const service = createRefundService({ unitOfWork, refunds, ledger, capacity, clock: () => FIXED_NOW,
    authorizeSource: async ({ sourceRef, actor }) => sourceRef.id === 'booking-1'
      || actor.roles.includes('ADMIN') });
  return {
    service,
    state: () => committed
  };
}

async function propose(service, overrides = {}) {
  return service.propose({ actor: STAFF,
    input: { sourceRef: SOURCE, amountVnd: 30000, reason: 'Hủy dịch vụ theo yêu cầu', ...overrides },
    idempotencyKey: overrides.key || 'proposal-key-0001' });
}

async function expectCode(promise, code) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe(code);
  }
}

describe('refund service', () => {
  test('creates a proposal within remaining verified capacity without claiming it is paid', async () => {
    const { service, state } = createHarness();
    const result = await propose(service);
    expect(result).toMatchObject({ amountVnd: 30000, currency: 'VND', status: REFUND_STATUS.PROPOSED, version: 0 });
    expect(result.transfer).toBeNull();
    expect(state().ledger).toHaveLength(0);
    expect(state().events.map(event => event.type)).toEqual(['REFUND_PROPOSED']);
  });

  test('replays the same idempotent proposal and rejects reuse with another payload', async () => {
    const { service, state } = createHarness();
    const first = await propose(service);
    const replay = await propose(service);
    expect(replay.id).toBe(first.id);
    expect(state().refunds.size).toBe(1);
    await expectCode(propose(service, { amountVnd: 25000 }), 'IDEMPOTENCY_KEY_REUSED');
  });

  test('fails closed when P51 financial decisions remain open', async () => {
    const { service, state } = createHarness({ decisionIds: ['FIN-02-ALLOC', 'FIN-02-ROUND'] });
    await expectCode(propose(service), 'DECISION_REQUIRED');
    expect(state().refunds.size).toBe(0);
    expect(state().ledger).toHaveLength(0);
  });

  test('caps proposals to net refundable capacity and requires source authorization', async () => {
    const { service, state } = createHarness({ capacityVnd: 20000 });
    await expectCode(propose(service), 'REFUND_LIMIT_EXCEEDED');
    await expectCode(service.propose({ actor: STAFF,
      input: { sourceRef: { ...SOURCE, id: 'another-booking' }, amountVnd: 1000, reason: 'Điều chỉnh' },
      idempotencyKey: 'proposal-key-0002' }), 'FORBIDDEN');
    await expectCode(service.propose({ actor: CUSTOMER,
      input: { sourceRef: SOURCE, amountVnd: 1000, reason: 'Yêu cầu hoàn' },
      idempotencyKey: 'proposal-key-0003' }), 'FORBIDDEN');
    expect(state().refunds.size).toBe(0);
  });

  test('Admin approval rechecks capacity, reserves once, and remains distinct from Paid', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    const approved = await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ chứng từ và trong hạn mức', expectedVersion: 0, idempotencyKey: 'decision-key-0001' });
    expect(approved.status).toBe(REFUND_STATUS.APPROVED);
    expect(approved.status).not.toBe(REFUND_STATUS.PAID);
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(20000);
    expect(state().ledger).toMatchObject([{ entryType: 'REFUND_RESERVED', amountVnd: 30000,
      fromBucket: 'REFUNDABLE_AVAILABLE', toBucket: 'REFUND_RESERVED' }]);
    await expectCode(service.decide({ actor: STAFF, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Không phải Admin', expectedVersion: 0, idempotencyKey: 'decision-key-0002' }), 'FORBIDDEN');
  });

  test('concurrent stale approvals create only one reservation and ledger entry', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    const decision = key => service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đã đối chiếu', expectedVersion: 0, idempotencyKey: key });
    const results = await Promise.allSettled([decision('decision-key-0003'), decision('decision-key-0004')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(state().ledger.filter(entry => entry.entryType === 'REFUND_RESERVED')).toHaveLength(1);
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(20000);
  });

  test('rejection does not reserve or write a money ledger entry', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    const rejected = await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'REJECT',
      reason: 'Thiếu căn cứ xử lý', expectedVersion: 0, idempotencyKey: 'decision-key-0005' });
    expect(rejected.status).toBe(REFUND_STATUS.REJECTED);
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(50000);
    expect(state().ledger).toHaveLength(0);
  });

  test('unknown transfer and amount mismatch stay pending with the reservation held', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ căn cứ', expectedVersion: 0, idempotencyKey: 'decision-key-0006' });
    const pending = await service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'CONFIRMED',
      amountVnd: 29000, transferReference: 'bank-ref-01', evidenceReference: 'evidence-01',
      paidAt: '2026-10-14T10:00:00Z', expectedVersion: 1, idempotencyKey: 'transfer-key-0001' });
    expect(pending.status).toBe(REFUND_STATUS.TRANSFER_PENDING);
    expect(pending.transfer.outcome).toBe('AMOUNT_MISMATCH');
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(20000);
    expect(state().ledger.map(entry => entry.entryType)).toEqual(['REFUND_RESERVED']);
  });

  test('records Paid only for an exact confirmed amount with evidence', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ căn cứ', expectedVersion: 0, idempotencyKey: 'decision-key-0007' });
    const paid = await service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'CONFIRMED',
      amountVnd: 30000, transferReference: 'bank-ref-02', evidenceReference: 'evidence-02',
      paidAt: '2026-10-14T10:00:00Z', expectedVersion: 1, idempotencyKey: 'transfer-key-0002' });
    expect(paid.status).toBe(REFUND_STATUS.PAID);
    expect(paid.transfer.evidenceReference).toBe('evidence-02');
    expect(state().ledger.map(entry => entry.entryType)).toEqual(['REFUND_RESERVED', 'REFUND_PAID']);
    expect(state().paid.get(proposal.id)).toBe(30000);
    await expectCode(service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'CONFIRMED',
      amountVnd: 30000, transferReference: 'bank-ref-02', evidenceReference: 'evidence-02',
      paidAt: '2026-10-14T10:00:00Z', expectedVersion: 2, idempotencyKey: 'transfer-key-0003' }), 'INVALID_STATE');
  });

  test('confirmed transfer failure releases its reservation through a separate ledger entry', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ căn cứ', expectedVersion: 0, idempotencyKey: 'decision-key-0008' });
    const failed = await service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'FAILED',
      transferReference: 'bank-ref-fail', evidenceReference: 'failure-proof', expectedVersion: 1,
      idempotencyKey: 'transfer-key-0004' });
    expect(failed.status).toBe(REFUND_STATUS.FAILED);
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(50000);
    expect(state().ledger.map(entry => entry.entryType)).toEqual(['REFUND_RESERVED', 'REFUND_RESERVATION_RELEASED']);
  });

  test('does not release a reservation after a transfer result became uncertain', async () => {
    const { service, state } = createHarness();
    const proposal = await propose(service);
    await service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ căn cứ', expectedVersion: 0, idempotencyKey: 'decision-key-0010' });
    await service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'UNKNOWN',
      expectedVersion: 1, idempotencyKey: 'transfer-key-0010' });
    await expectCode(service.recordTransfer({ actor: ADMIN, refundId: proposal.id, outcome: 'FAILED',
      transferReference: 'bank-ref-fail', evidenceReference: 'failure-proof', expectedVersion: 2,
      idempotencyKey: 'transfer-key-0011' }), 'TRANSFER_RECONCILIATION_REQUIRED');
    expect(state().capacity.get('CANCELLATION:booking-1')).toBe(20000);
    expect(state().ledger.map(entry => entry.entryType)).toEqual(['REFUND_RESERVED']);
  });

  test('validates VND integer amounts and decision version', async () => {
    const { service } = createHarness();
    await expectCode(propose(service, { amountVnd: 100.5 }), 'VALIDATION_FAILED');
    const proposal = await propose(service, { key: 'proposal-key-0009' });
    await expectCode(service.decide({ actor: ADMIN, refundId: proposal.id, decision: 'APPROVE',
      reason: 'Đủ căn cứ', expectedVersion: 1, idempotencyKey: 'decision-key-0009' }), 'VERSION_CONFLICT');
  });
});
