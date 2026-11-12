import { createHash } from 'node:crypto';

// Previously committed commands keep their original fingerprint and result.
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value => typeof value === 'string' ? value.trim() || null : null;
const evidence = input => Array.isArray(input) ? input.map(item => typeof item === 'string'
  ? { mediaId: item }
  : { mediaId: item?.mediaId ?? item?.id, kind: text(item?.kind ?? 'COMPLAINT'), caption: text(item?.caption) }) : [];

export function legacySubmitFingerprint(input, expectedVersion) {
  if (input.scope !== undefined || input.bookingId !== undefined || !text(input.summary ?? input.subject)) return null;
  return hash({
    visitId: input.visitId, expectedVersion,
    complaint: {
      category: input.category || 'OTHER', summary: text(input.summary ?? input.subject),
      description: text(input.description ?? input.details ?? input.message),
      evidenceRefs: evidence(input.evidenceRefs ?? input.photoRefs), requestedOutcome: text(input.requestedOutcome)
    }
  });
}

export function legacyCommandFingerprint(input, complaintId, expectedVersion, operation) {
  let payload;
  if (operation === 'ComplaintObjected') {
    if (!text(input.reason ?? input.message)) return null;
    payload = { reason: text(input.reason ?? input.message), evidenceRefs: evidence(input.evidenceRefs) };
  } else if (operation === 'ComplaintClosed') {
    if (!text(input.summary ?? input.decision)) return null;
    payload = {
      summary: text(input.summary ?? input.decision), actionsTaken: text(input.actionsTaken),
      financialHold: input.financialHold, financialDecision: text(input.financialDecision)
    };
  } else if (['ComplaintUnderReview', 'ComplaintResolved'].includes(operation)) {
    if (!text(input.summary ?? input.resolution)) return null;
    payload = {
      summary: text(input.summary ?? input.resolution), actionsTaken: text(input.actionsTaken),
      followUp: text(input.followUp), staffNotes: text(input.staffNotes), financialHold: input.financialHold
    };
  } else return null;
  return hash({ complaintId, expectedVersion, operation, input: payload });
}
