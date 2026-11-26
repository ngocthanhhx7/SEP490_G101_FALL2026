import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const LATE_AFTER_MS = 15 * 60000;
const VIETNAM_OFFSET_MS = 7 * 3600000;

// JOB-07 / GBR-14. Staff are told once about each visit of the day not checked in 15 minutes after its start.
// The marker and the notification share a transaction, so a failed save is tried again on the next run.
export function createLateCheckInAlerts({ repository, clock = Date.now }) {
  const { col, models, uow } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
  const query = now => {
    const due = now - LATE_AFTER_MS;
    // The day of the 15-minute mark, so a visit starting just before midnight is still alerted.
    const day = new Date(due + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
    return { state: 'ASSIGNED', sitterId: { $type: 'objectId' }, checkInAt: null,
      startAt: { $gte: new Date(`${day}T00:00:00+07:00`), $lte: new Date(due) },
      $expr: { $ne: [{ $ifNull: ['$lateCheckInAlert.startAt', null] }, '$startAt'] } };
  };
  return {
    async runBatch({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Late check-in batch limit invalid');
      const candidates = await col('visits').find(query(+new Date(clock())), { projection: { _id: 1, startAt: 1 }, maxTimeMS: 5000 })
        .sort({ startAt: 1, _id: 1 }).limit(limit).toArray();
      const result = { alerted: 0, failed: 0 };
      for (const candidate of candidates) {
        try {
          const sent = await uow.run(async session => {
            const at = new Date(clock());
            // A check-in, cancellation or reschedule since the read removes the visit from this query.
            const visit = await col('visits').findOneAndUpdate(
              { _id: candidate._id, $and: [query(+at), { startAt: candidate.startAt }] },
              { $set: { lateCheckInAlert: { startAt: candidate.startAt, alertedAt: at } } },
              { session, returnDocument: 'after' });
            if (!visit) return false;
            const event = { type: 'VisitCheckInLate', visitId: String(visit._id), sitterId: String(visit.sitterId), at,
              detail: { version: visit.version, noticeKey: visit.startAt.toISOString() } };
            await models.EmployeeScheduleEvent.create([event], { session });
            await notifications.publish(event, session);
            return true;
          });
          if (sent) result.alerted++;
        } catch {
          result.failed++;
        }
      }
      return result;
    }
  };
}
