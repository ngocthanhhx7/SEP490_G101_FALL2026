export const HANDOVER_WINDOW_MS = 60 * 60000;
export const handoverPending = visit => visit.handoverRequired === true && visit.handoverAccepted !== true;

export function flagVisitHandover(previousSitterId, flaggedAt, reason) {
  return {
    set: { handoverRequired: true, handoverAccepted: false, handoverNote: { previousSitterId, flaggedAt, ...reason } },
    unset: { handoverAcceptedAt: 1, handoverAcceptedBy: 1, handoverLateCheckInExempt: 1, careAcknowledgement: 1 }
  };
}

export function urgentReplacement(visit, assignedAt = visit.assignedAt, startAt = visit.startAt) {
  return visit.handoverRequired === true && assignedAt instanceof Date && startAt instanceof Date &&
    assignedAt.getTime() > startAt.getTime() - HANDOVER_WINDOW_MS;
}

export function lateCheckInExempt(visit) {
  return visit.handoverRequired === true && (visit.handoverLateCheckInExempt ?? urgentReplacement(visit)) === true;
}

export function lateCheckInExemptExpression() {
  return { $and: [
    { $eq: ['$handoverRequired', true] },
    { $eq: [true, { $ifNull: ['$handoverLateCheckInExempt', { $cond: [
      { $and: [{ $eq: [{ $type: '$assignedAt' }, 'date'] }, { $eq: [{ $type: '$startAt' }, 'date'] }] },
      { $gt: ['$assignedAt', { $subtract: ['$startAt', HANDOVER_WINDOW_MS] }] },
      false
    ] }] }] }
  ] };
}
