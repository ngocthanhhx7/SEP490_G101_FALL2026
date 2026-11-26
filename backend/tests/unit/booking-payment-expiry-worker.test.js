import { afterEach, expect, jest, test } from '@jest/globals';
import { startBookingPaymentExpiryWorker } from '../../src/jobs/booking-payment-expiry.job.js';

afterEach(() => jest.useRealTimers());

test('JOB-03 starts once, skips overlapping 30-second ticks, and awaits work during shutdown', async () => {
  jest.useFakeTimers();
  let finish;
  const service = { runBatch: jest.fn(() => new Promise(resolve => { finish = resolve; })) };
  const worker = startBookingPaymentExpiryWorker({ service });
  await Promise.resolve();
  expect(service.runBatch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(90000);
  expect(service.runBatch).toHaveBeenCalledTimes(1);
  let stopped = false;
  const stop = worker.stop().then(() => { stopped = true; });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finish({ expired: 1 }); await stop;
  await jest.advanceTimersByTimeAsync(90000);
  expect(stopped).toBe(true);
  expect(service.runBatch).toHaveBeenCalledTimes(1);
});

test('JOB-03 handles a synchronous service failure and retries at the next tick', async () => {
  jest.useFakeTimers();
  const service = { runBatch: jest.fn().mockImplementationOnce(() => { throw new Error('Synthetic failure'); }).mockResolvedValue({ expired: 0 }) };
  const logger = jest.fn(), worker = startBookingPaymentExpiryWorker({ service, logger });
  await jest.advanceTimersByTimeAsync(0);
  expect(logger).toHaveBeenCalledWith({ event: 'booking_payment_expiry_check_failed' });
  await jest.advanceTimersByTimeAsync(30000);
  await worker.stop();
  expect(service.runBatch).toHaveBeenCalledTimes(2);
});
