import { AppError } from '../../utils/app-error.js';
import { futureVisit } from './booking-change-policy.js';
import { oid } from './booking-change-store.js';

export const visitChanged = () => new AppError(409, 'BOOKING_CHANGE_VISIT_CHANGED',
  'Buổi đã thay đổi sau khi khách gửi yêu cầu. Vui lòng từ chối yêu cầu.');

export function hasChanged(visit, item, now) {
  return !visit || visit.version !== item.oldVersion || +visit.startAt !== +item.oldStartAt ||
    +visit.endAt !== +item.oldEndAt || !futureVisit(visit, now);
}

export async function assessAssignments(repository, visits, items, { now, session } = {}) {
  const byId = new Map(visits.map(visit => [String(visit._id), visit]));
  const excludeVisitIds = items.map(item => item.visitId);
  const retained = new Map();
  const assessments = new Map();
  const ordered = [...items].sort((a, b) => a.newStartAt - b.newStartAt || a.visitId.localeCompare(b.visitId));
  for (const item of ordered) {
    const visit = byId.get(item.visitId);
    if (hasChanged(visit, item, now)) {
      assessments.set(item.visitId, { availability: 'CHANGED' });
      continue;
    }
    if (!visit.sitterId) {
      assessments.set(item.visitId, { availability: 'UNASSIGNED' });
      continue;
    }
    const sitterId = String(visit.sitterId);
    const revised = { ...visit, startAt: item.newStartAt, endAt: item.newEndAt };
    const proposedVisits = retained.get(sitterId) ?? [];
    try {
      if (session) await repository.employeeGuard(sitterId, session);
      else {
        const user = await repository.col('users').findOne({ _id: oid(sitterId), state: 'ACTIVE', roles: 'PET_SITTER', synthetic: { $ne: true } });
        const status = await repository.col('sitterstatuses').findOne({ userId: oid(sitterId), status: 'ACTIVE' });
        if (!user || !status) throw new AppError(409, 'SITTER_NOT_ELIGIBLE', 'Current sitter unavailable');
      }
      await repository.eligible(sitterId, revised, session, { excludeVisitIds, proposedVisits });
      proposedVisits.push(revised);
      retained.set(sitterId, proposedVisits);
      assessments.set(item.visitId, { availability: 'AVAILABLE' });
    } catch (error) {
      if (error.status !== 409) throw error;
      assessments.set(item.visitId, { availability: 'BUSY', availabilityReason: error.code });
    }
  }
  return assessments;
}

export async function moveVisits({ store, repository, change, items, visits, assessments, now, session }) {
  const byId = new Map(visits.map(visit => [String(visit._id), visit]));
  const requeues = [];
  for (const item of items) {
    const visit = byId.get(item.visitId);
    const retain = assessments.get(item.visitId).availability === 'AVAILABLE';
    const set = { startAt: item.newStartAt, endAt: item.newEndAt, bookingChangeRequestId: change._id };
    const unset = { dispatchReview: 1, recommendationRef: 1, assignedFeatureSnapshot: 1 };
    if (!retain) {
      Object.assign(set, { state: 'SCHEDULED', sitterId: null });
      Object.assign(unset, { assignedAt: 1, careAcknowledgement: 1, withdrawalRequest: 1, dispatchPreferredFallback: 1 });
      if (visit.sitterId) {
        Object.assign(set, { handoverRequired: true, handoverAccepted: false });
        unset.handoverAcceptedAt = 1;
      }
    }
    const updated = await store.visits.updateOne({ _id: visit._id, state: visit.state, checkInAt: null,
      version: item.oldVersion, startAt: item.oldStartAt, endAt: item.oldEndAt },
    { $set: set, $unset: unset, $inc: { version: 1 } }, { session });
    if (!updated.matchedCount) throw visitChanged();
    await repository.models.EmployeeVisitOffer.updateMany({ visitId: visit._id, state: 'PENDING' },
      { $set: { state: 'REVOKED', decidedAt: now }, $inc: { version: 1 } }, { session });
    await repository.models.EmployeeVisitTravel.deleteOne({ _id: item.visitId }, { session });
    if (!retain) requeues.push({ visitId: item.visitId, version: item.oldVersion + 1 });
  }
  return requeues;
}
