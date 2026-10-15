import { describe, expect, jest, test } from '@jest/globals';
import { createVisitReminderJob, visitReminderKey } from '../../src/jobs/visit-reminder.job.js';

const AS_OF = '2026-10-15T00:00:00.000Z';
const visit = (overrides = {}) => ({ visitId: 'visit-001', bookingId: 'booking-001', customerId: 'customer-001', sitterId: 'sitter-001', state: 'ASSIGNED', scheduleVersion: 2, startAt: '2026-10-15T23:00:00.000Z', ...overrides });

function makeJob({ candidates = [visit()], notifier = jest.fn(async () => ({ status: 'ACCEPTED' })), repository = {}, clock = () => new Date(AS_OF) } = {}) {
  const findUpcomingVisits = jest.fn(async () => candidates);
  const job = createVisitReminderJob({ repository: { findUpcomingVisits, ...repository }, notifier: { sendVisitReminder: notifier }, clock });
  return { job, findUpcomingVisits, notifier };
}

describe('visit reminder job', () => {
  test('uses Vietnam timezone, sends one safe stable command and deduplicates the key by schedule version', async () => {
    const { job, findUpcomingVisits, notifier } = makeJob();
    await expect(job.runOnce()).resolves.toEqual({ queried: 1, reminded: 1, alreadyHandled: 0, skipped: 0, failed: 0 });
    expect(findUpcomingVisits).toHaveBeenCalledWith(expect.objectContaining({ asOf: AS_OF, timezone: 'Asia/Ho_Chi_Minh', limit: 500 }));
    expect(notifier).toHaveBeenCalledWith(expect.objectContaining({ visitId: 'visit-001', scheduleVersion: 2, timezone: 'Asia/Ho_Chi_Minh', idempotencyKey: expect.stringMatching(/^visit-reminder:v1:[a-f0-9]{64}$/) }));
    const firstKey = notifier.mock.calls[0][0].idempotencyKey;
    await job.runOnce();
    expect(notifier.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(visitReminderKey('visit-001', 2, '2026-10-15T23:00:00.000Z', 1440)).toBe(firstKey);
  });

  test('does not notify cancelled, future-window, stale timezone, malformed or completed visits', async () => {
    const candidates = [visit({ cancelled: true }), visit({ startAt: '2026-10-16T23:00:01.000Z' }), visit({ timezone: 'UTC' }), visit({ state: 'COMPLETED' }), visit({ startAt: '2026-10-15T00:30:00' })];
    const { job, notifier } = makeJob({ candidates });
    await expect(job.runOnce()).resolves.toEqual({ queried: candidates.length, reminded: 0, alreadyHandled: 0, skipped: candidates.length, failed: 0 });
    expect(notifier).not.toHaveBeenCalled();
  });

  test('schedule change is stale and never sends the old reminder', async () => {
    const notifier = jest.fn(async () => ({ status: 'ACCEPTED' }));
    const { job } = makeJob({ repository: { createReminderAtomically: jest.fn(async () => ({ status: 'STALE' })) }, notifier });
    await expect(job.runOnce()).resolves.toMatchObject({ skipped: 1, reminded: 0 });
    expect(notifier).not.toHaveBeenCalled();
  });

  test('coalesces overlapping runs and continues after provider failure', async () => {
    let finish;
    const notifier = jest.fn(() => new Promise(resolve => { finish = () => resolve({ status: 'ACCEPTED' }); }));
    const { job, findUpcomingVisits } = makeJob({ notifier });
    const first = job.runOnce(); const second = job.runOnce();
    await Promise.resolve(); await Promise.resolve();
    expect(findUpcomingVisits).toHaveBeenCalledTimes(1); expect(notifier).toHaveBeenCalledTimes(1);
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { queried: 1, reminded: 1, alreadyHandled: 0, skipped: 0, failed: 0 },
      { queried: 1, reminded: 1, alreadyHandled: 0, skipped: 0, failed: 0 }
    ]);
    const failed = makeJob({ candidates: [visit(), visit({ visitId: 'visit-002' })], notifier: jest.fn().mockRejectedValueOnce(new Error('provider')).mockResolvedValueOnce({ status: 'FAILED' }) });
    await expect(failed.job.runOnce()).resolves.toMatchObject({ reminded: 0, failed: 2 });
  });

  test('rejects invalid configuration and non-array repository results', async () => {
    expect(() => createVisitReminderJob({ repository: {}, notifier: {} })).toThrow(TypeError);
    const { job } = makeJob({ repository: { findUpcomingVisits: jest.fn(async () => null) } });
    await expect(job.runOnce()).rejects.toThrow('Upcoming visit repository must return an array');
  });
});
