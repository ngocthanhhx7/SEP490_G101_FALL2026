import { setInterval, clearInterval } from 'node:timers';

export function startBookingPaymentExpiryWorker({ service, logger = () => {}, intervalMs = 30000 }) {
  if (typeof service?.runBatch !== 'function') throw new TypeError('Booking expiry service required');
  let pending, stopping = false;
  const tick = () => {
    if (stopping || pending) return;
    pending = service.runBatch().then(result => {
      if (result.expired) logger({ event: 'booking_payment_expired', count: result.expired });
    }).catch(() => logger({ event: 'booking_payment_expiry_check_failed' })).finally(() => { pending = null; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return { async stop() { stopping = true; clearInterval(timer); await pending; } };
}
