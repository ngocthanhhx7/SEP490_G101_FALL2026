import { afterEach, expect, jest, test } from '@jest/globals';
import { loadConfig } from '../../src/config/environment.js';

const env = { NODE_ENV: 'test', MONGO_URI: 'mongodb://127.0.0.1:27017', MONGO_DB: 'synthetic_test' };
const loadJob = () => import('../../src/jobs/product-pickup-expiry.job.js');
const interval = 5 * 60_000;

afterEach(() => jest.useRealTimers());

test('JOB-04 defaults to 72 hours and a disabled worker', () => {
  expect(loadConfig(env)).toMatchObject({ pickupDeadlineHours: 72, productPickupExpiryJobEnabled: false });
  expect(loadConfig({ ...env, PRODUCT_PICKUP_DEADLINE_HOURS: '24', PRODUCT_PICKUP_EXPIRY_JOB_ENABLED: 'true' }))
    .toMatchObject({ pickupDeadlineHours: 24, productPickupExpiryJobEnabled: true });
});

test.each(['-1', '0', '1.5', 'not-a-number', '', '999999999999999'])('JOB-04 rejects invalid pickup hours %p', (value) => {
  expect(() => loadConfig({ ...env, PRODUCT_PICKUP_DEADLINE_HOURS: value }))
    .toThrow(expect.objectContaining({ fields: ['PRODUCT_PICKUP_DEADLINE_HOURS'] }));
});

test('JOB-04 rejects an invalid enable flag', () => {
  expect(() => loadConfig({ ...env, PRODUCT_PICKUP_EXPIRY_JOB_ENABLED: 'yes' }))
    .toThrow(expect.objectContaining({ fields: ['PRODUCT_PICKUP_EXPIRY_JOB_ENABLED'] }));
});

test('JOB-04 does not create or schedule a service if the flag is off', async () => {
  const { startProductPickupExpiryWorker } = await loadJob();
  const createService = jest.fn();
  expect(startProductPickupExpiryWorker({ enabled: false, createService })).toBeNull();
  expect(createService).not.toHaveBeenCalled();
});

test('JOB-04 runs every five minutes, skips overlapping ticks and waits on shutdown', async () => {
  const { startProductPickupExpiryWorker } = await loadJob();
  jest.useFakeTimers();
  let finish;
  const runBatch = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const worker = startProductPickupExpiryWorker({ enabled: true, createService: () => ({ runBatch }) });
  await jest.advanceTimersByTimeAsync(interval - 1);
  expect(runBatch).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(runBatch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(interval);
  expect(runBatch).toHaveBeenCalledTimes(1);
  const stopped = jest.fn();
  const stopping = worker.stop().then(stopped);
  await jest.advanceTimersByTimeAsync(interval);
  expect(stopped).not.toHaveBeenCalled();
  finish({ cancelled: 0, failed: 0 });
  await stopping;
  expect(stopped).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(interval);
  expect(runBatch).toHaveBeenCalledTimes(1);
});
