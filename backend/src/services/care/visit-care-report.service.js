import { workflowProjection } from './workflow-snapshot.service.js';

export function projectVisitCareReport(visit, { sitterName = null, customerView = true, includeCustomerNote = customerView } = {}) {
  return {
    id: String(visit._id),
    ...(visit.snapshots?.workflow ? { workflow: workflowProjection(visit, { customer: customerView }) } : {}),
    startAt: visit.startAt ?? null,
    endAt: visit.endAt ?? null,
    checkInAt: visit.checkInAt ?? null,
    checkOutAt: visit.checkOutAt ?? null,
    ...(includeCustomerNote && visit.customerNote ? { customerNote: visit.customerNote } : {}),
    checklist: (visit.checklist ?? []).slice(0, 100).map(item => ({
      itemId: item.itemId,
      label: visit.snapshots?.checklistItems?.find(row => row.itemId === item.itemId)?.label ?? item.itemId,
      status: item.status,
      ...(item.reason ? { reason: item.reason } : {})
    })),
    evidence: (visit.evidenceRefs ?? [])
      .filter(item => ['CHECK_IN', 'CHECK_OUT'].includes(item.kind) && /^[a-f0-9]{64}$/.test(item.mediaId))
      .slice(0, 2)
      .map(({ kind, mediaId }) => ({ kind, mediaId })),
    state: visit.state,
    sitterName
  };
}
