import { describe, expect, jest, test } from '@jest/globals';
import {
  OPERATIONAL_SWEEP_TASKS,
  calculateOfferDeadline,
  canAcceptOfferAt,
  createOperationalSweepJob
} from '../../src/jobs/operational-sweep.job.js';

const AS_OF = '2026-10-14T04:00:00.000Z';
const lease = (status = 'ACQUIRED') => ({ status, fencingToken: status === 'ACQUIRED' ? 7 : undefined });

function candidate(operationType, overrides = {}) {
  const defaults = {
    operationType,
    aggregateId: `${operationType.toLowerCase()}-001`,
    state: operationType === 'OFFER_EXPIRED' ? 'PENDING'
      : operationType === 'VISIT_NO_CHECKOUT' ? 'IN_PROGRESS'
      : operationType === 'CHANGE_REQUEST_EXPIRED' ? 'AWAITING_APPROVAL'
        : operationType === 'BOOKING_PROPOSAL_EXPIRED' ? 'AWAITING_CUSTOMER'
          : operationType === 'HANDOVER_OVERDUE' ? 'PENDING' : 'ASSIGNED',
    version: 3,
    deadline: '2026-10-14T03:59:00.000Z',
    startAt: '2026-10-14T03:30:00.000Z',
    endAt: '2026-10-14T02:00:00.000Z',
    requestedAt: '2026-10-14T02:59:00.000Z',
    expiresAt: '2026-10-14T03:59:00.000Z',
    checkInAt: '2026-10-14T00:00:00.000Z',
    checkOutAt: null
  };
  return { ...defaults, ...overrides };
}

function harness({ task = 'offer-expiry', candidates = [candidate('OFFER_EXPIRED')],
  apply = async () => ({ status: 'APPLIED' }), renew = async () => true,
  acquire = async () => lease(), release = async () => {}, clock = () => new Date(AS_OF), logger = jest.fn() } = {}) {
  const findDueOperations = jest.fn(async () => candidates);
  const applyOperationAtomically = jest.fn(apply);
  const acquireLease = jest.fn(acquire);
  const renewLease = jest.fn(renew);
  const releaseLease = jest.fn(release);
  const job = createOperationalSweepJob({ task, repository: { findDueOperations, applyOperationAtomically },
    leaseRepository: { acquireLease, renewLease, releaseLease }, clock, logger });
  return { job, findDueOperations, applyOperationAtomically, acquireLease, renewLease, releaseLease, logger };
}

describe('P23 operational sweep', () => {
  test('publishes the agreed cadences and offer deadlines', () => {
    expect(OPERATIONAL_SWEEP_TASKS['offer-expiry'].cadenceMs).toBe(5 * 60_000);
    expect(OPERATIONAL_SWEEP_TASKS['visit-reminders'].cadenceMs).toBe(15 * 60_000);
    expect(calculateOfferDeadline({ offeredAt: AS_OF, visitStartAt: '2026-10-15T04:00:00.000Z' }))
      .toBe('2026-10-14T06:00:00.000Z');
    expect(calculateOfferDeadline({ offeredAt: AS_OF, visitStartAt: '2026-10-14T10:00:00.000Z' }))
      .toBe('2026-10-14T04:30:00.000Z');
    expect(canAcceptOfferAt({ state: 'PENDING', deadline: '2026-10-14T04:00:01.000Z', asOf: AS_OF })).toBe(true);
    expect(canAcceptOfferAt({ state: 'PENDING', deadline: AS_OF, asOf: AS_OF })).toBe(false);
    expect(canAcceptOfferAt({ state: 'EXPIRED', deadline: '2026-10-14T04:00:01.000Z', asOf: AS_OF })).toBe(false);
  });

  test('acquires a fenced lease, applies the atomic command and releases it', async () => {
    const h = harness();
    await expect(h.job.runOnce()).resolves.toMatchObject({ task: 'offer-expiry', leaseAcquired: true, applied: 1 });
    expect(h.acquireLease).toHaveBeenCalledWith(expect.objectContaining({
      name: 'p23:offer-expiry', leaseDurationMs: 60_000, asOf: AS_OF, ownerToken: expect.any(String)
    }));
    expect(h.renewLease).toHaveBeenCalledWith(expect.objectContaining({ name: 'p23:offer-expiry', fencingToken: 7 }));
    expect(h.applyOperationAtomically).toHaveBeenCalledWith(expect.objectContaining({
      operationType: 'OFFER_EXPIRED', aggregateType: 'OFFER', aggregateId: 'offer_expired-001',
      expectedState: 'PENDING', expectedVersion: 3, fencingToken: 7,
      idempotencyKey: expect.stringMatching(/^p23-operation:v1:[a-f0-9]{64}$/)
    }));
    expect(h.applyOperationAtomically.mock.calls[0][0]).not.toHaveProperty('paymentStatus');
    expect(h.releaseLease).toHaveBeenCalledWith(expect.objectContaining({ name: 'p23:offer-expiry', fencingToken: 7 }));
    expect(h.logger).toHaveBeenCalledWith(expect.objectContaining({ event: 'operational_sweep_completed', task: 'offer-expiry', applied: 1 }));
  });

  test('coalesces concurrent runs and does not create a duplicate effect on replay', async () => {
    const h = harness({ apply: async () => ({ status: 'ALREADY_APPLIED' }) });
    const first = h.job.runOnce();
    expect(h.job.runOnce()).toBe(first);
    await expect(first).resolves.toMatchObject({ applied: 0, alreadyHandled: 1 });
    await h.job.runOnce();
    expect(h.applyOperationAtomically).toHaveBeenCalledTimes(2);
    expect(h.applyOperationAtomically.mock.calls[0][0].idempotencyKey)
      .toBe(h.applyOperationAtomically.mock.calls[1][0].idempotencyKey);
  });

  test('skips candidates outside the deadline contract and never changes pending payment', async () => {
    const h = harness({ task: 'operational-deadlines', candidates: [
      candidate('VISIT_NO_ARRIVAL', { startAt: '2026-10-14T04:00:01.000Z' }),
      candidate('VISIT_NO_ARRIVAL', { checkInAt: '2026-10-14T03:00:00.000Z' }),
      candidate('VISIT_NO_CHECKOUT', { checkInAt: null }),
      candidate('CHANGE_REQUEST_EXPIRED', { expiresAt: '2026-10-14T04:00:01.000Z' }),
      candidate('CHANGE_REQUEST_EXPIRED', { state: 'APPLIED' }),
      candidate('OFFER_EXPIRED', { paymentStatus: 'PENDING' })
    ] });
    await expect(h.job.runOnce()).resolves.toMatchObject({ queried: 6, applied: 0, skipped: 6, failed: 0 });
    expect(h.applyOperationAtomically).not.toHaveBeenCalled();
  });

  test('supports reminder and no-checkout operation shapes without inventing a visit transition', async () => {
    const h = harness({ task: 'visit-reminders', candidates: [
      candidate('VISIT_REMINDER_2H', { startAt: '2026-10-14T05:59:00.000Z' }),
      candidate('VISIT_REMINDER_30M', { startAt: '2026-10-14T03:59:00.000Z' })
    ] });
    await expect(h.job.runOnce()).resolves.toMatchObject({ queried: 2, applied: 2 });
    expect(h.applyOperationAtomically.mock.calls[0][0]).toMatchObject({ operationType: 'VISIT_REMINDER_2H' });
    expect(h.applyOperationAtomically.mock.calls[1][0]).toMatchObject({ operationType: 'VISIT_REMINDER_30M' });
    expect(h.applyOperationAtomically.mock.calls.every(([command]) => !('nextState' in command))).toBe(true);
  });

  test('stops safely when another worker owns the lease', async () => {
    const h = harness({ acquire: async () => ({ status: 'BUSY' }) });
    await expect(h.job.runOnce()).resolves.toEqual({ task: 'offer-expiry', cadenceMs: 300_000,
      leaseAcquired: false, leaseLost: false, queried: 0, applied: 0, alreadyHandled: 0, skipped: 0, failed: 0 });
    expect(h.findDueOperations).not.toHaveBeenCalled();
    expect(h.releaseLease).not.toHaveBeenCalled();
  });

  test('does not apply work after a lost fencing lease and still releases it', async () => {
    const h = harness({ renew: async () => false });
    await expect(h.job.runOnce()).resolves.toMatchObject({ queried: 1, leaseLost: true, applied: 0, skipped: 0 });
    expect(h.applyOperationAtomically).not.toHaveBeenCalled();
    expect(h.releaseLease).toHaveBeenCalledTimes(1);
  });

  test('counts stale, skipped and failed repository outcomes without failing the batch', async () => {
    const h = harness({ candidates: [candidate('OFFER_EXPIRED'), candidate('OFFER_EXPIRED'), candidate('OFFER_EXPIRED')],
      apply: jest.fn()
        .mockResolvedValueOnce({ status: 'STALE' })
        .mockResolvedValueOnce({ status: 'SKIPPED' })
        .mockRejectedValueOnce(new Error('synthetic transaction failure')) });
    await expect(h.job.runOnce()).resolves.toMatchObject({ queried: 3, alreadyHandled: 1, skipped: 1, failed: 1 });
  });

  test('rejects invalid ports, lease tokens and unbounded repository responses', async () => {
    expect(() => createOperationalSweepJob({ task: 'offer-expiry', repository: {}, leaseRepository: {} })).toThrow(TypeError);
    const invalidLease = harness({ acquire: async () => ({ status: 'ACQUIRED', fencingToken: 0 }) });
    await expect(invalidLease.job.runOnce()).rejects.toThrow('invalid fencing token');
    const tooMany = harness({ candidates: Array.from({ length: 101 }, () => candidate('OFFER_EXPIRED')) });
    await expect(tooMany.job.runOnce()).rejects.toThrow('bounded array');
  });
});
