import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';

const LATE_AFTER_MS = 15 * 60000;
const VIETNAM_OFFSET_MS = 7 * 3600000;

// JOB-07 / GBR-29. Staff are told once about each visit of the day not checked in 15 minutes after its start.
// The marker and notification share a transaction, so a failed save can be retried.
export function createLateCheckInAlerts({ repository, clock = Date.now }) {
  const { col, models, uow } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
  let cursor = null;
  const query = now => {
    const due = now - LATE_AFTER_MS;
    // The day of the 15-minute mark, so a visit starting just before midnight is still alerted.
    const day = new Date(due + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
    return { state: 'ASSIGNED', sitterId: { $type: 'objectId' }, checkInAt: null,
      startAt: { $gte: new Date(`${day}T00:00:00+07:00`), $lte: new Date(due) },
      'lateCheckInAlert.alertedAt': { $exists: false } };
  };
  function readCandidates(filter, limit) {
    return col('visits').find(filter, { projection: { _id: 1, startAt: 1 }, maxTimeMS: 5000 })
      .sort({ startAt: 1, _id: 1 }).limit(limit).toArray();
  }

  async function nextCandidates(filter, limit) {
    const position = cursor;
    if (!position) return readCandidates(filter, limit);

    const after = { $or: [{ startAt: { $gt: position.startAt } },
      { startAt: position.startAt, _id: { $gt: position._id } }] };
    const tail = await readCandidates({ $and: [filter, after] }, limit);
    if (tail.length === limit) return tail;

    // Wrap over the other half only, so a candidate is never attempted twice in one batch.
    const head = await readCandidates({ $and: [filter, { $nor: after.$or }] }, limit - tail.length);
    return [...tail, ...head];
  }

  return {
    async runBatch({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Late check-in batch limit invalid');
      const candidates = await nextCandidates(query(+new Date(clock())), limit);
      cursor = candidates.length === limit ? candidates.at(-1) : null;
      const result = { alerted: 0, failed: 0 };
      for (const candidate of candidates) {
        try {
          const sent = await uow.run(async session => {
            const at = new Date(clock());
            // A check-in, cancellation or reschedule since the read removes the visit from this query.
            const visit = await col('visits').findOneAndUpdate(
              { _id: candidate._id, $and: [query(+at), { startAt: candidate.startAt }] },
              { $set: { lateCheckInAlert: { alertedAt: at } } },
              { session, returnDocument: 'after' });
            if (!visit) return false;
            const event = { type: 'VisitCheckInLate', visitId: String(visit._id), sitterId: String(visit.sitterId), at,
              detail: { version: visit.version } };
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
