export const COMPLAINT_SCHEMA_VERSION = 2;
export const COMPLAINT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;

export function instant(value) {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  const result = new Date(value);
  return Number.isFinite(+result) ? result : null;
}

export function complaintState(record) {
  if (record.state === 'UNDER_REVIEW') return record.latestObjection?.reason ? 'ESCALATED' : 'OPEN';
  return record.state === 'CLOSED' ? 'RESOLVED' : record.state;
}

export function complaintFinalAt(record, asOf) {
  if (complaintState(record) !== 'RESOLVED') return null;
  const decidedAt = instant(record.finalAt ?? (record.state === 'CLOSED' ? record.decision?.recordedAt : null));
  if (decidedAt && decidedAt <= asOf) return decidedAt;
  const appealUntil = instant(record.appealUntil);
  return record.objectionCount === 0 && appealUntil && appealUntil <= asOf ? appealUntil : null;
}

export function holdQueries(asOf) {
  const current = { kind: 'COMPLAINT', complaintSchemaVersion: COMPLAINT_SCHEMA_VERSION };
  return {
    legacy: { $nor: [current], $or: [
      { state: { $in: ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] } }, { financialHold: true }
    ] },
    current: { ...current, $nor: [
      { state: 'RESOLVED', finalAt: { $type: 'date', $lte: asOf } },
      { state: 'RESOLVED', objectionCount: 0, appealUntil: { $type: 'date', $lte: asOf } }
    ] }
  };
}

export function visitCompletion(visit) {
  if (visit.state === 'COMPLETED') return { done: true, at: instant(visit.completedAt ?? visit.checkOutAt) };
  if (visit.state === 'STAFF_CLOSED') {
    return { done: visit.hasCheckInPhoto === true, at: instant(visit.closedAt ?? visit.staffClosedAt) };
  }
  if (visit.state === 'CANCELLED') return { done: false, at: instant(visit.cancelledAt ?? visit.canceledAt) };
  return null;
}
