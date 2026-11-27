export function startBookingPaymentExpiryWorker({ service, logger = () => {}, intervalMs = 30000 }) {
  if (typeof service?.runBatch !== 'function' || !Number.isSafeInteger(intervalMs) || intervalMs < 1000)
    throw new TypeError('Booking expiry service and bounded interval required');
  let pending, stopping = false;
  const tick = () => {
    if (stopping || pending) return;
    pending = Promise.resolve().then(() => service.runBatch()).then(result => {
      if (result.expired) logger({ event: 'booking_payment_expired', count: result.expired });
    }).catch(() => logger({ event: 'booking_payment_expiry_check_failed' })).finally(() => { pending = null; });
  };
  const timer = globalThis.setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return { async stop() { stopping = true; globalThis.clearInterval(timer); await pending; } };
}
