import { createHash } from 'node:crypto';

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_VISITS_PER_RUN = 500;
const ACTIVE_STATES = new Set(['SCHEDULED', 'CONFIRMED', 'ASSIGNED', 'READY_FOR_SERVICE', 'DISPATCH_PENDING', 'AWAITING_SITTER']);
const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function toInstant(value, label) {
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) return new Date(value.getTime());
    throw new TypeError(`${label} must be a valid instant`);
  }
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must include a timezone offset`);
  }
  return new Date(Date.parse(value));
}

function resolveClock(clock) {
  const value = clock();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  return toInstant(value, 'clock value');
}

function leadFor(visit, fallback) {
  const value = visit.reminderLeadMinutes ?? visit.reminderMinutes ?? visit.remindBeforeMinutes ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 7 * 24 * 60) return null;
  return value;
}

function validRecipient(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

function reminderKey(visitId, scheduleVersion, startAt, leadMinutes) {
  const digest = createHash('sha256').update(`${visitId}\n${scheduleVersion}\n${startAt}\n${leadMinutes}`).digest('hex');
  return `visit-reminder:v1:${digest}`;
}

function isEligible(visit, asOf, defaultLeadMinutes) {
  if (!visit || typeof visit !== 'object' || Array.isArray(visit)) return null;
  const visitId = visit.visitId ?? visit.id;
  if (!validRecipient(visitId) || (visit.state !== undefined && !ACTIVE_STATES.has(visit.state))
    || visit.cancelled === true || visit.reminderDisabled === true) return null;
  let startAt;
  try { startAt = toInstant(visit.startAt, 'startAt'); } catch { return null; }
  const scheduleVersion = Number.isSafeInteger(visit.scheduleVersion ?? visit.version)
    && (visit.scheduleVersion ?? visit.version) >= 0 ? (visit.scheduleVersion ?? visit.version) : 0;
  const leadMinutes = leadFor(visit, defaultLeadMinutes);
  if (leadMinutes === null) return null;
  let reminderAt;
  try { reminderAt = visit.reminderAt ? toInstant(visit.reminderAt, 'reminderAt') : new Date(startAt.getTime() - leadMinutes * 60 * 1000); } catch { return null; }
  if (reminderAt.getTime() > startAt.getTime() || startAt.getTime() <= asOf.getTime() || reminderAt.getTime() > asOf.getTime()) return null;
  const recipients = Array.isArray(visit.recipients)
    ? [...new Set(visit.recipients.map(item => typeof item === 'string' ? item : item?.recipientId).filter(validRecipient))]
    : [visit.customerId, visit.sitterId].filter(validRecipient);
  if (recipients.length === 0) return null;
  if (visit.timezone && visit.timezone !== VN_TIMEZONE) return null;
  return Object.freeze({ visitId, bookingId: validRecipient(visit.bookingId) ? visit.bookingId : null,
    scheduleVersion, startAt, reminderAt, leadMinutes, recipients });
}

/**
 * Creates a bounded Vietnam-time visit reminder sweep. The repository must query
 * visits using the same instant window and must atomically invalidate a previous
 * schedule version before creating a reminder. It owns durable uniqueness across
 * process restarts; the job never mutates a Visit.
 */
export function createVisitReminderJob({ repository, notifier, clock = () => new Date(), leadMinutes = 24 * 60,
  limit = MAX_VISITS_PER_RUN, timezone = VN_TIMEZONE } = {}) {
  if (typeof repository?.findUpcomingVisits !== 'function'
    || typeof notifier?.sendVisitReminder !== 'function' || typeof clock !== 'function') {
    throw new TypeError('Visit reminder repository, notifier and clock are required');
  }
  if (!Number.isSafeInteger(leadMinutes) || leadMinutes < 1 || leadMinutes > 7 * 24 * 60) throw new TypeError('Invalid reminder lead time');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_VISITS_PER_RUN) throw new TypeError(`Reminder limit must be between 1 and ${MAX_VISITS_PER_RUN}`);
  if (timezone !== VN_TIMEZONE) throw new TypeError('Visit reminders must use Asia/Ho_Chi_Minh timezone');

  let inFlight;
  async function run() {
    const asOf = resolveClock(clock);
    const windowEnd = new Date(asOf.getTime() + 7 * 24 * 60 * 60 * 1000);
    const candidates = await repository.findUpcomingVisits({ asOf: asOf.toISOString(), windowEnd: windowEnd.toISOString(), timezone, limit });
    if (!Array.isArray(candidates)) throw new TypeError('Upcoming visit repository must return an array');
    let reminded = 0;
    let alreadyHandled = 0;
    let skipped = 0;
    let failed = 0;
    for (const visit of candidates) {
      const eligible = isEligible(visit, asOf, leadMinutes);
      if (!eligible) { skipped += 1; continue; }
      const idempotencyKey = reminderKey(eligible.visitId, eligible.scheduleVersion, eligible.startAt.toISOString(), eligible.leadMinutes);
      const command = {
        visitId: eligible.visitId, bookingId: eligible.bookingId, scheduleVersion: eligible.scheduleVersion,
        startAt: eligible.startAt.toISOString(), reminderAt: eligible.reminderAt.toISOString(),
        leadMinutes: eligible.leadMinutes, recipients: eligible.recipients, timezone, idempotencyKey,
        asOf: asOf.toISOString()
      };
      try {
        if (typeof repository.invalidateObsoleteReminders === 'function') {
          await repository.invalidateObsoleteReminders({ visitId: eligible.visitId, scheduleVersion: eligible.scheduleVersion, asOf: asOf.toISOString() });
        }
        const reservation = typeof repository.createReminderAtomically === 'function'
          ? await repository.createReminderAtomically(command) : { status: 'READY' };
        if (reservation?.status === 'STALE' || reservation?.status === 'SKIPPED') { skipped += 1; continue; }
        if (reservation?.status === 'ALREADY_EXISTS' || reservation?.status === 'DELIVERED') { alreadyHandled += 1; continue; }
        if (reservation?.status !== undefined && reservation.status !== 'READY' && reservation.status !== 'CREATED') { failed += 1; continue; }
        const result = await notifier.sendVisitReminder(command);
        if (result?.status === 'ACCEPTED' || result?.status === 'ALREADY_EXISTS') {
          reminded += 1;
          if (typeof repository.markReminderDelivered === 'function') await repository.markReminderDelivered({ ...command, result });
        } else {
          failed += 1;
          if (typeof repository.markReminderFailed === 'function') await repository.markReminderFailed({ ...command, result });
        }
      } catch {
        failed += 1;
        try { if (typeof repository.markReminderFailed === 'function') await repository.markReminderFailed(command); } catch { /* preserve sweep progress */ }
      }
    }
    return Object.freeze({ queried: candidates.length, reminded, alreadyHandled, skipped, failed });
  }

  return Object.freeze({ runOnce() { if (inFlight) return inFlight; inFlight = run().finally(() => { inFlight = undefined; }); return inFlight; } });
}

export { isEligible as isEligibleVisitReminder, reminderKey as visitReminderKey, VN_TIMEZONE };
