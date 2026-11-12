import { hasRole } from '../../utils/roles.js';
import { APPEAL_WINDOW_MS, COMPLAINT_SCHEMA_VERSION, complaintFinalAt, complaintState, instant } from './complaint-lifecycle.js';

export const complaintCode = id => 'KN-' + String(id).replaceAll('-', '').slice(0, 12).toUpperCase();
const iso = value => instant(value)?.toISOString() ?? null;

function imageRefs(refs) {
  return (refs ?? []).map(ref => ({
    mediaId: ref.mediaId,
    kind: ref.kind ?? 'COMPLAINT',
    caption: ref.caption ?? null,
    recordedAt: ref.recordedAt ?? null
  }));
}

export function bookingSummary(booking, visits = []) {
  const starts = visits.map(visit => instant(visit.startAt)).filter(Boolean);
  const ends = visits.map(visit => instant(visit.endAt)).filter(Boolean);
  const services = [...new Set(visits.map(visit => visit.serviceName).filter(Boolean))];
  return { id: booking.id, code: booking.code ?? null, state: booking.state,
    serviceName: booking.serviceName ?? (services.join(', ') || null),
    startAt: iso(booking.startAt) ?? (starts.length ? new Date(Math.min(...starts.map(Number))).toISOString() : null),
    endAt: iso(booking.endAt) ?? (ends.length ? new Date(Math.max(...ends.map(Number))).toISOString() : null),
    version: booking.version ?? null };
}

export function visitSummary(visit) {
  return visit ? { id: visit.id, state: visit.state === 'STAFF_CLOSED' && visit.hasCheckInPhoto === false ? 'CANCELLED' : visit.state,
    version: visit.version ?? null,
    startAt: iso(visit.startAt), endAt: iso(visit.endAt), serviceName: visit.serviceName ?? null,
    sitterName: visit.sitterName ?? null } : null;
}

export function safeComplaint(record, actor, asOf, { customerPhone, billing } = {}) {
  const { id, visitId = null, bookingId, scope = 'VISIT', description = '', version = 0 } = record;
  const state = complaintState(record);
  const finalAt = complaintFinalAt(record, asOf);
  const appealUntil = instant(record.appealUntil);
  const proposal = record.proposal;
  const staff = hasRole(actor.roles, 'STAFF');
  const sitter = hasRole(actor.roles, 'PET_SITTER');
  const result = record.customerResult ?? record.decision?.customerResult ?? record.decision?.summary
    ?? (proposal?.status === 'PENDING' ? null : record.resolution?.summary ?? null);
  const amountVnd = record.moneyDecision?.amountVnd ?? null;
  const openedAt = instant(record.openedAt ?? record.createdAt);
  const elapsed = openedAt ? +asOf - +openedAt : 0;
  const openDays = state === 'OPEN' && elapsed > APPEAL_WINDOW_MS ? Math.floor(elapsed / (APPEAL_WINDOW_MS / 3)) : null;
  const response = result ? {
    summary: result, amountVnd, recordedAt: iso(record.resultDeliveredAt ?? record.resolution?.recordedAt ?? record.decision?.recordedAt),
    ...(sitter ? { actionsTaken: record.resolution?.actionsTaken ?? null } : {})
  } : null;
  const common = { id, kind: 'COMPLAINT', visitId, version, description,
    evidenceRefs: imageRefs(record.evidenceRefs), createdAt: iso(record.createdAt ?? record.openedAt),
    updatedAt: iso(record.updatedAt), response };
  if (sitter) {
    return { ...common, state: finalAt ? 'CLOSED' : state === 'ESCALATED' ? 'UNDER_REVIEW' : record.state,
      category: record.category ?? 'OTHER', summary: record.summary ?? description.slice(0, 500),
      requestedOutcome: record.requestedOutcome ?? null,
      context: { bookingId, serviceName: record.serviceName ?? null } };
  }
  const objectionCount = record.objectionCount ?? 0;
  const billState = finalAt ? null : 'ON_HOLD';
  return {
    ...common, code: record.code ?? complaintCode(id), scope, bookingId, state, billState,
    isFinal: Boolean(finalAt), finalAt: iso(finalAt), resultDeliveredAt: iso(record.resultDeliveredAt),
    customerResult: result, approvedAmountVnd: amountVnd,
    booking: record.bookingSummary ?? null, visit: record.visitSummary ?? null,
    objection: { count: objectionCount, allowed: !staff && state === 'RESOLVED' && !finalAt
      && !objectionCount && Boolean(appealUntil && appealUntil > asOf),
    deadlineAt: iso(appealUntil) },
    ...(staff ? {
      openDays, requiresReview: record.complaintSchemaVersion !== COMPLAINT_SCHEMA_VERSION && state === 'RESOLVED' && !finalAt,
      customer: { displayName: record.customerName ?? null, ...(customerPhone !== undefined ? { phone: customerPhone } : {}) },
      handlingNotes: record.handlingNotes ?? record.privateStaffNotes ?? record.staffNotes ?? null,
      objectionReason: record.objection?.reason ?? record.latestObjection?.reason ?? null,
      proposal: proposal ? { ...proposal, evidenceRefs: imageRefs(proposal.evidenceRefs) } : null,
      moneyDecision: record.moneyDecision ?? null,
      ...(billing !== undefined ? { billing } : {})
    } : {})
  };
}
