import { ID } from '../constants/complaint-fields.js';
import { AppError } from '../utils/app-error.js';

export const MEDIA_ID = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const CATEGORIES = ['SERVICE_QUALITY', 'PET_SAFETY', 'SITTER_CONDUCT', 'ACCESS', 'BILLING', 'OTHER'];
const LEGACY_STATES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED'];
const STATES = ['OPEN', 'ESCALATED', 'RESOLVED'];

export function invalid(field, message = 'Complaint request is invalid', messageCode) {
  throw new AppError(422, 'VALIDATION_FAILED', message, {
    ...(field ? { fieldErrors: { [field]: message } } : {}),
    ...(messageCode ? { messageCode } : {})
  });
}

export function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key))) invalid();
  return value;
}

export function complaintId(value, field = 'complaintId') {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field, field + ' is invalid');
  return value;
}

export function commandKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('idempotencyKey', 'An idempotency key is required');
  return value;
}

export function version(value, optional) {
  if (optional && (value === undefined || value === null)) return null;
  if (!Number.isSafeInteger(value) || value < 0) invalid('expectedVersion', 'A nonnegative version is required');
  return value;
}

function text(value, field, max = 4000, optional = false) {
  if (value === undefined && optional) return null;
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (optional) return null;
    invalid(field, 'This field is required', 'MSG01');
  }
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) {
    invalid(field, field + ' is invalid');
  }
  return value.trim();
}

function oneOf(value, options, field) {
  if (!options.includes(value)) invalid(field, field + ' is invalid');
  return value;
}

function evidence(value = [], required = false) {
  if (!Array.isArray(value) || value.length > 20) invalid('evidenceRefs', 'At most 20 evidence references are allowed');
  if (required && !value.length) invalid('evidenceRefs', 'Evidence is required', 'MSG01');
  const seen = new Set();
  return value.map(item => {
    const mediaId = typeof item === 'string' ? item : item?.mediaId ?? item?.id;
    if (typeof mediaId !== 'string' || !MEDIA_ID.test(mediaId) || seen.has(mediaId)) invalid('evidenceRefs', 'Evidence ID is invalid or duplicated');
    seen.add(mediaId);
    return { mediaId, kind: 'COMPLAINT', caption: null };
  });
}

function amount(value, { allowZero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) invalid('amountVnd', 'Amount must be a whole number of VND');
  return value;
}

export function submissionTarget(input) {
  const scope = oneOf(input.scope ?? 'VISIT', ['VISIT', 'BOOKING'], 'scope');
  const bookingId = input.bookingId !== undefined || scope === 'BOOKING' ? complaintId(input.bookingId, 'bookingId') : null;
  const visitId = scope === 'VISIT' ? complaintId(input.visitId, 'visitId') : null;
  if (scope === 'BOOKING' && input.visitId !== undefined && input.visitId !== null) invalid('visitId', 'A booking complaint has no visit ID');
  return { scope, bookingId, visitId };
}

export function normalizeSubmission(input) {
  return {
    description: text(input.description ?? input.details ?? input.message, 'description', 1000),
    evidenceRefs: evidence(input.evidenceRefs ?? input.photoRefs)
  };
}

export function normalizeResolution(input) {
  const handlingNotes = text(input.handlingNotes ?? input.staffNotes, 'handlingNotes', 8000);
  const customerResult = text(input.customerResult ?? input.summary ?? input.resolution, 'customerResult');
  if (input.proposal === undefined || input.proposal === null) return { handlingNotes, customerResult, proposal: null };
  const proposal = fields(input.proposal, ['amountVnd', 'reason', 'evidenceRefs']);
  return {
    handlingNotes, customerResult,
    proposal: {
      amountVnd: amount(proposal.amountVnd),
      reason: text(proposal.reason, 'reason'),
      evidenceRefs: evidence(proposal.evidenceRefs, true)
    }
  };
}

export const normalizeReview = input => ({ handlingNotes: text(input.handlingNotes ?? input.staffNotes ?? input.summary ?? input.resolution, 'handlingNotes') });
export const normalizeObjection = input => ({ reason: text(input.reason ?? input.message, 'reason') });

export function normalizeDecision(input) {
  return {
    customerResult: text(input.customerResult ?? input.summary ?? input.decision, 'customerResult'),
    amountVnd: input.amountVnd === undefined ? null : amount(input.amountVnd, { allowZero: true })
  };
}

export function normalizeRefundDecision(input) {
  const outcome = oneOf(input.outcome, ['APPROVE', 'REDUCE', 'REJECT'], 'outcome');
  if (outcome !== 'REDUCE' && input.amountVnd !== undefined) invalid('amountVnd');
  return {
    outcome,
    amountVnd: outcome === 'REDUCE' ? amount(input.amountVnd) : null,
    reason: text(input.reason, 'reason', 4000, outcome !== 'REJECT')
  };
}

export function normalizeList(query, { sitter, proposals }) {
  fields(query, ['visitId', 'state', 'category', 'q', 'sort', 'limit', 'cursor']);
  const visitId = query.visitId ? complaintId(query.visitId, 'visitId') : null;
  const state = query.state ? oneOf(query.state, sitter ? LEGACY_STATES : STATES, 'state') : null;
  const category = query.category ? oneOf(query.category, CATEGORIES, 'category') : null;
  const sort = oneOf(query.sort ?? 'newest', ['newest', 'oldest'], 'sort');
  const q = text(query.q, 'q', 100, true);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (Array.isArray(query.limit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) invalid('limit');
  const cursor = query.cursor ?? null;
  if (cursor !== null && (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(cursor))) invalid('cursor');
  return { filter: { visitId, state, category, sort, q, proposals }, limit, cursor };
}
