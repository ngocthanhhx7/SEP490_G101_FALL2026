const INTERVAL_MS = 5 * 60_000;

export function startProductPickupExpiryWorker({ enabled, createService, logger = () => {} }) {
  if (!enabled) return null;
  const service = createService();
  let running;
  let stopping = false;
  const timer = globalThis.setInterval(() => {
    if (stopping || running) return;
    running = service.runBatch().then(result => {
      if (result.cancelled || result.failed) logger({ event: 'product_pickup_expiry_batch', ...result });
    }).catch(() => logger({ event: 'product_pickup_expiry_failed' })).finally(() => { running = undefined; });
  }, INTERVAL_MS);
  timer.unref();
  return {
    async stop() {
      stopping = true;
      globalThis.clearInterval(timer);
      await running;
    }
  };
}
