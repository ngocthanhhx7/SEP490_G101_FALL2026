export function startVisitCompletionMonitor({ service, logger = () => {}, intervalMs = 60000 }) {
  if (typeof service?.runBatch !== 'function' || !Number.isSafeInteger(intervalMs) || intervalMs < 1000) throw new TypeError('Completion monitor configuration required');
  let running = null, stopping = false;
  const tick = () => {
    if (running || stopping) return;
    running = Promise.resolve().then(() => service.runBatch()).then(result => {
      if (result.notified) logger({ event: 'visit_completion_monitor', ...result });
    }).catch(() => logger({ event: 'visit_completion_monitor_failed' })).finally(() => { running = null; });
  };
  const timer = globalThis.setInterval(tick, intervalMs); timer.unref(); tick();
  return { async stop() { stopping = true; globalThis.clearInterval(timer); await running; } };
}
