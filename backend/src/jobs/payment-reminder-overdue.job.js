import { createHash } from 'node:crypto';

const SAFE_PROVIDER_STATES = new Set(['NONE', 'FAILED']);

function toInstant(value, label) {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (Number.isFinite(timestamp)) return new Date(timestamp);
    throw new TypeError(`${label} must be a valid instant`);
  }

  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new TypeError(`${label} must include a timezone offset`);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label} must be a valid instant`);
  return new Date(timestamp);
}

function isEligiblePayment(payment, asOf) {
  if (!payment || typeof payment !== 'object') return false;
  if (typeof payment.paymentId !== 'string' || payment.paymentId.trim() === '') return false;
  if (payment.paymentStatus !== 'UNPAID' || payment.holdStatus !== 'CLEAR') return false;
  if (!SAFE_PROVIDER_STATES.has(payment.providerStatus)) return false;

  let dueAt;
  try {
    dueAt = toInstant(payment.dueAt, 'dueAt');
  } catch {
    return false;
  }

  return dueAt.getTime() <= asOf.getTime();
}

function reminderKey(paymentId, dueAt) {
  const digest = createHash('sha256')
    .update(`${paymentId}\n${dueAt.toISOString()}`)
    .digest('hex');
  return `payment-reminder:v1:${digest}`;
}

function resolveClock(clock) {
  const value = clock();
  if (value instanceof Date) return toInstant(value, 'clock value');
  if (typeof value === 'number' && Number.isFinite(value)) return toInstant(new Date(value), 'clock value');
  return toInstant(value, 'clock value');
}

/**
 * Creates the isolated hourly payment-reminder sweep.
 *
 * Repository contract: findDueUnpaidPayments({ asOf }) returns candidate records with
 * paymentId, paymentStatus, dueAt, holdStatus, and providerStatus. The query must be
 * scoped to unpaid payments whose deadline is due at `asOf`. This worker checks those
 * conditions again before notifying. It never changes payment or bill state.
 *
 * The notifier must durably deduplicate by idempotencyKey across process restarts.
 * A resolved notifier result counts as a reminder only when its status is `ACCEPTED`.
 * Resolved `FAILED`, `UNCERTAIN`, missing, or unknown statuses are counted as failed so
 * they do not suppress a later retry; rejected notifier promises are handled the same way.
 * Scheduling, reminder cadence, local-deadline conversion, and OVERDUE transitions are
 * deliberately owned by a later integration once their policies are approved.
 */
export function createPaymentReminderOverdueJob({ repository, notifier, clock = () => new Date() }) {
  if (!repository || typeof repository.findDueUnpaidPayments !== 'function'
    || !notifier || typeof notifier.sendPaymentDueReminder !== 'function'
    || typeof clock !== 'function') {
    throw new TypeError('Invalid payment reminder job ports');
  }

  let inFlight;

  async function run() {
    const asOf = resolveClock(clock);
    const candidates = await repository.findDueUnpaidPayments({ asOf: asOf.toISOString() });
    if (!Array.isArray(candidates)) throw new TypeError('Due payment repository must return an array');

    let reminded = 0;
    let skipped = 0;
    let failed = 0;

    for (const payment of candidates) {
      if (!isEligiblePayment(payment, asOf)) {
        skipped += 1;
        continue;
      }

      const dueAt = toInstant(payment.dueAt, 'dueAt');
      const command = {
        paymentId: payment.paymentId,
        dueAt: dueAt.toISOString(),
        idempotencyKey: reminderKey(payment.paymentId, dueAt)
      };

      try {
        const result = await notifier.sendPaymentDueReminder(command);
        if (result?.status === 'ACCEPTED') reminded += 1;
        else failed += 1;
      } catch {
        // Do not stop other due payments or expose notifier/provider details in the result.
        failed += 1;
      }
    }

    return Object.freeze({ queried: candidates.length, reminded, skipped, failed });
  }

  return Object.freeze({
    runOnce() {
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = undefined; });
      return inFlight;
    }
  });
}
