import { clearInterval, setInterval } from 'node:timers';

export function startWebPushWorker({ service, logger }) {
  let running;
  function tick() {
    if (running) return;
    running = service.runBatch().catch(() => logger({ event: 'web_push_batch_failed' }))
      .finally(() => { running = null; });
  }
  const timer = setInterval(tick, 15000);
  timer.unref();
  tick();
  return { async stop() { clearInterval(timer); await running; } };
}
