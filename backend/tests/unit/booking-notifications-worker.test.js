import { afterEach, expect, jest, test } from '@jest/globals';
import { startBookingNotificationsWorker } from '../../src/jobs/booking-notifications.job.js';
afterEach(() => jest.useRealTimers());
test('worker starts immediately, skips overlapping ticks and waits for active work when stopped', async () => {
  jest.useFakeTimers();
  let finish;
  const service = { runBatch: jest.fn(() => new Promise(resolve => { finish = resolve; })) };
  const worker = startBookingNotificationsWorker({ service, intervalMs: 60000, event: 'synthetic_worker' });
  await Promise.resolve();
  expect(service.runBatch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(180000);
  expect(service.runBatch).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stopping = worker.stop().then(() => { stopped = true; });
  await Promise.resolve(); expect(stopped).toBe(false);
  finish({ expired: 1 }); await stopping;
  await jest.advanceTimersByTimeAsync(180000);
  expect(stopped).toBe(true); expect(service.runBatch).toHaveBeenCalledTimes(1);
});
