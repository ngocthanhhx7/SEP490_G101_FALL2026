import { describe, expect, jest, test } from '@jest/globals';
import { createPaymentReminderOverdueJob } from '../../src/jobs/payment-reminder-overdue.job.js';

const AS_OF = '2026-10-14T04:00:00.000Z';
const duePayment = (overrides = {}) => ({
  paymentId: 'synthetic-payment-001',
  paymentStatus: 'UNPAID',
  dueAt: '2026-10-14T03:59:59.000Z',
  holdStatus: 'CLEAR',
  providerStatus: 'NONE',
  ...overrides
});

function createJob({ candidates = [duePayment()], notifier = jest.fn(async () => ({ status: 'ACCEPTED' })),
  repository = {}, clock = () => new Date(AS_OF) } = {}) {
  const findDueUnpaidPayments = jest.fn(async () => candidates);
  const job = createPaymentReminderOverdueJob({
    repository: { findDueUnpaidPayments, ...repository },
    notifier: { sendPaymentDueReminder: notifier },
    clock
  });
  return { job, findDueUnpaidPayments, notifier };
}

describe('payment reminder hourly sweep', () => {
  test('queries due unpaid records at the injected UTC instant and sends an opaque stable key', async () => {
    const { job, findDueUnpaidPayments, notifier } = createJob();

    await expect(job.runOnce()).resolves.toEqual({ queried: 1, reminded: 1, skipped: 0, failed: 0 });

    expect(findDueUnpaidPayments).toHaveBeenCalledTimes(1);
    expect(findDueUnpaidPayments).toHaveBeenCalledWith({ asOf: AS_OF });
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith({
      paymentId: 'synthetic-payment-001',
      dueAt: '2026-10-14T03:59:59.000Z',
      idempotencyKey: expect.stringMatching(/^payment-reminder:v1:[a-f0-9]{64}$/)
    });
    expect(notifier.mock.calls[0][0].idempotencyKey).not.toContain('synthetic-payment-001');
  });

  test('does not notify paid, future, held, pending, uncertain, or malformed candidates', async () => {
    const candidates = [
      duePayment({ paymentStatus: 'PAID' }),
      duePayment({ dueAt: '2026-10-14T04:00:01.000Z' }),
      duePayment({ holdStatus: 'ACTIVE' }),
      duePayment({ providerStatus: 'PENDING' }),
      duePayment({ providerStatus: 'UNCERTAIN' }),
      duePayment({ providerStatus: 'RECONCILIATION_REQUIRED' }),
      duePayment({ dueAt: '2026-10-14T03:00:00' }),
      duePayment({ paymentId: '' })
    ];
    const { job, notifier } = createJob({ candidates });

    await expect(job.runOnce()).resolves.toEqual({ queried: candidates.length, reminded: 0, skipped: candidates.length, failed: 0 });
    expect(notifier).not.toHaveBeenCalled();
  });

  test('coalesces overlapping hourly invocations in one process', async () => {
    let finish;
    const notifier = jest.fn(() => new Promise(resolve => { finish = () => resolve({ status: 'ACCEPTED' }); }));
    const { job, findDueUnpaidPayments } = createJob({ notifier });
    const first = job.runOnce();
    const second = job.runOnce();
    await Promise.resolve();
    await Promise.resolve();

    expect(findDueUnpaidPayments).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledTimes(1);
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { queried: 1, reminded: 1, skipped: 0, failed: 0 },
      { queried: 1, reminded: 1, skipped: 0, failed: 0 }
    ]);
  });

  test('reuses the same key across separate runs for notifier-side durable deduplication', async () => {
    const deliveredKeys = new Set();
    const delivery = jest.fn(async command => {
      if (deliveredKeys.has(command.idempotencyKey)) return { status: 'ACCEPTED', duplicate: true };
      deliveredKeys.add(command.idempotencyKey);
      return { status: 'ACCEPTED', delivered: true };
    });
    const { job } = createJob({ notifier: delivery });

    await job.runOnce();
    await job.runOnce();

    expect(delivery).toHaveBeenCalledTimes(2);
    expect(delivery.mock.calls[0][0].idempotencyKey).toBe(delivery.mock.calls[1][0].idempotencyKey);
    expect(deliveredKeys.size).toBe(1);
  });

  test('continues the sweep after an individual notification failure', async () => {
    const notifier = jest.fn()
      .mockRejectedValueOnce(new Error('synthetic delivery failure'))
      .mockResolvedValueOnce({ status: 'ACCEPTED' });
    const { job } = createJob({ candidates: [
      duePayment(),
      duePayment({ paymentId: 'synthetic-payment-002' })
    ], notifier });

    await expect(job.runOnce()).resolves.toEqual({ queried: 2, reminded: 1, skipped: 0, failed: 1 });
    expect(notifier).toHaveBeenCalledTimes(2);
  });

  test('does not count a resolved FAILED notification as reminded', async () => {
    const notifier = jest.fn(async () => ({
      status: 'FAILED', code: 'PROVIDER_UNAVAILABLE', retryable: true, uncertain: false
    }));
    const { job } = createJob({ notifier });

    await expect(job.runOnce()).resolves.toEqual({ queried: 1, reminded: 0, skipped: 0, failed: 1 });
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  test('does not expose an overdue state mutation port', () => {
    const repository = {
      findDueUnpaidPayments: jest.fn(async () => []),
      markOverdue: jest.fn()
    };
    const { job } = createJob({ repository });

    expect(job).toHaveProperty('runOnce');
    expect(job).not.toHaveProperty('markOverdue');
  });

  test('rejects invalid port configuration and non-array query results', async () => {
    expect(() => createPaymentReminderOverdueJob({ repository: {}, notifier: {} })).toThrow(TypeError);
    const { job } = createJob({ repository: { findDueUnpaidPayments: jest.fn(async () => null) } });
    await expect(job.runOnce()).rejects.toThrow('Due payment repository must return an array');
  });
});
