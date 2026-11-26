export function startBookingNotificationsWorker({ service, intervalMs, logger = () => {}, event }) {
  if (typeof service?.runBatch !== 'function' || !Number.isSafeInteger(intervalMs) || intervalMs < 1000)
    throw new TypeError('Scheduled booking service required');
  let running, stopping = false;
  const tick = () => {
    if (running || stopping) return;
    running = Promise.resolve().then(() => service.runBatch())
      .then(result => { if (result.failed || result.expired || result.paid || result.reminded) logger({ event, ...result }); })
      .catch(() => logger({ event: `${event}_failed` })).finally(() => { running = null; });
  };
  const timer = globalThis.setInterval(tick, intervalMs); timer.unref(); tick();
  return { async stop() { stopping = true; globalThis.clearInterval(timer); await running; } };
}
