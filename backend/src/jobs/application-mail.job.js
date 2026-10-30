import { setInterval, clearInterval } from 'node:timers';

export function startApplicationMailWorker({ service, logger = () => {}, intervalMs = 15000 }) {
  let stopping = false, running = null;
  const tick = () => {
    if (stopping || running) return;
    running = Promise.resolve().then(() => service.runBatch()).then(result => {
      if (result.processed) logger({ event: 'application_mail_batch', ...result });
    }).catch(() => logger({ event: 'application_mail_failed' })).finally(() => { running = null; });
  };
  const timer = setInterval(tick, intervalMs); timer.unref(); tick();
  return { async stop() { stopping = true; clearInterval(timer); await running; } };
}
