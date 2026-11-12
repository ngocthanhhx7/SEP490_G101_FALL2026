import { setInterval, clearInterval } from 'node:timers';

export function startBookingChangeWorker({ service, logger = () => {}, intervalMs = 30000 }) {
  let inFlight;
  function tick() {
    if (inFlight) return;
    inFlight = service.runBatch().catch(() => logger({ event: 'booking_change_sweep_failed' }))
      .finally(() => { inFlight = null; });
  }
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return { async stop() { clearInterval(timer); await inFlight; } };
}
