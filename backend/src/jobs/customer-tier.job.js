import { setTimeout, clearTimeout } from 'node:timers';

const VIETNAM_OFFSET_MS = 7 * 3600000;
const DAY_MS = 86400000;

export function nextCustomerTierRun(now) {
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  local.setUTCHours(2, 0, 0, 0);
  const instant = local.getTime() - VIETNAM_OFFSET_MS;
  return new Date(instant > now.getTime() ? instant : instant + DAY_MS);
}

export function startCustomerTierWorker({ enabled, createService, clock = Date.now }) {
  if (!enabled) return null;
  const service = createService();
  let timer, running, stopping = false;
  function schedule() {
    if (stopping) return;
    const now = clock();
    const delay = nextCustomerTierRun(new Date(now)).getTime() - now;
    timer = setTimeout(() => {
      if (stopping) return;
      // The service logs errors with the phase and daily run key.
      running = service.run().catch(() => {}).finally(schedule);
    }, delay);
    timer.unref();
  }
  schedule();
  return { async stop() { stopping = true; clearTimeout(timer); await running; } };
}
