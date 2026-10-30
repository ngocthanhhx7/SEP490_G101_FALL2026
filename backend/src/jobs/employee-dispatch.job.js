import { setInterval, clearInterval } from 'node:timers';

export function startEmployeeDispatchWorker({ service, logger = () => {}, intervalMs = 30000 }) {
  if (typeof service?.runBatch !== 'function' || !Number.isInteger(intervalMs) || intervalMs < 1000) throw new TypeError('Dispatch service and interval required');
  let stopping = false, running = null;
  const tick = () => {
    if (stopping || running) return;
    running = Promise.resolve().then(() => service.runBatch()).then(result => {
      if (result.processed) logger({ event: 'employee_dispatch_batch', ...result });
    }).catch(() => logger({ event: 'employee_dispatch_failed' })).finally(() => { running = null; });
  };
  const timer = setInterval(tick, intervalMs); timer.unref(); tick();
  return { async stop() { stopping = true; clearInterval(timer); await running; } };
}
