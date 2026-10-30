import { setInterval, clearInterval } from 'node:timers';

export function startEarningAccrualWorker({ service, logger = () => {}, intervalMs = 15000 }) {
  if (typeof service?.drain !== 'function' || !Number.isInteger(intervalMs) || intervalMs < 1000) {
    throw new TypeError('Accrual worker configuration required');
  }
  let stopped = false, running = null;
  function tick() {
    if (stopped || running) return;
    running = Promise.resolve().then(() => service.drain({ limit: 25 }))
      .catch(() => { logger({ event: 'earning_accrual_retry_pending' }); })
      .finally(() => { running = null; });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return { stop: async () => { stopped = true; clearInterval(timer); await running; } };
}
