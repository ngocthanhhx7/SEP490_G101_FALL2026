import { createSchedulingNotifications } from '../notifications/scheduling-notifications.service.js';
import { VISIT_ENDING_SOON_MS, VISIT_CHECK_OUT_REMINDER_MS, VISIT_COMPLETION_REVIEW_MS } from '../../constants/visit-completion.js';

const phases = [
  { key: 'review', type: 'VisitCompletionReviewRequired', range: now => ({ $lte: new Date(now - VISIT_COMPLETION_REVIEW_MS) }) },
  { key: 'overdue', type: 'VisitCheckOutReminder', range: now => ({ $gt: new Date(now - VISIT_COMPLETION_REVIEW_MS), $lte: new Date(now - VISIT_CHECK_OUT_REMINDER_MS) }) },
  { key: 'ending', type: 'VisitEndingSoon', range: now => ({ $gt: new Date(now), $lte: new Date(now + VISIT_ENDING_SOON_MS) }) }
];

// Reminders never manufacture a checkout, report, worked duration or financial outcome.
// Persisted markers also prevent notified rows from starving later batches.
export function createVisitCompletionMonitor({ repository, clock = Date.now }) {
  const { col, models, uow } = repository;
  const notifications = createSchedulingNotifications({ col, clock });
  const query = (phase, now) => ({ state: 'IN_PROGRESS', sitterId: { $type: 'objectId' }, checkInAt: { $type: 'date' }, checkOutAt: null,
    endAt: phase.range(now), $expr: { $ne: [{ $ifNull: [`$completionNotices.${phase.key}.scheduledEndAt`, null] }, '$endAt'] } });
  return {
    async runBatch({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Completion monitor batch limit invalid');
      const result = { notified: 0, reviewed: 0 };
      for (const phase of phases) {
        const now = +new Date(clock());
        const candidates = await col('visits').find(query(phase, now), { projection: { _id: 1, endAt: 1 }, maxTimeMS: 5000 })
          .sort({ endAt: 1, _id: 1 }).limit(limit).toArray();
        for (const candidate of candidates) {
          const sent = await uow.run(async session => {
            const at = new Date(clock());
            const fields = { [`completionNotices.${phase.key}`]: { scheduledEndAt: candidate.endAt, notifiedAt: at } };
            if (phase.key === 'review') fields.completionAttention = { code: 'COMPLETION_REVIEW_REQUIRED', at, scheduledEndAt: candidate.endAt };
            const visit = await col('visits').findOneAndUpdate({ _id: candidate._id, $and: [query(phase, +at), { endAt: candidate.endAt }] },
              { $set: fields }, { session, returnDocument: 'after' });
            if (!visit) return false;
            const event = { type: phase.type, visitId: String(visit._id), sitterId: String(visit.sitterId), at,
              detail: { scheduledEndAt: visit.endAt.toISOString(), version: visit.version, noticeKey: visit.endAt.toISOString() } };
            await models.EmployeeScheduleEvent.create([event], { session });
            await notifications.publish(event, session);
            return true;
          });
          if (sent) { result.notified++; if (phase.key === 'review') result.reviewed++; }
        }
      }
      return result;
    }
  };
}
