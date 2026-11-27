import { exact, fail, id } from './pet-care.validator.js';

export const CANCELLATION_REASON_OPTIONS = Object.freeze([
  'Thay đổi kế hoạch',
  'Thú cưng có vấn đề sức khỏe',
  'Đặt nhầm ngày hoặc giờ',
  'Lý do khác'
]);

const SCOPES = new Set(['BOOKING', 'VISIT']);

function validateScopeAndVisit(body) {
  if (!SCOPES.has(body.scope)) fail('VALIDATION_FAILED', 'Cancellation scope must be BOOKING or VISIT');
  if (body.scope === 'VISIT') {
    id(body.visitId);
    return { scope: 'VISIT', visitId: body.visitId };
  }
  if (body.visitId !== undefined && body.visitId !== null) {
    fail('VALIDATION_FAILED', 'visitId is only allowed when scope is VISIT');
  }
  return { scope: 'BOOKING', visitId: null };
}

export function bookingCancellationPreviewInput(body) {
  exact(body, ['scope', 'visitId'], ['scope']);
  return validateScopeAndVisit(body);
}

export function bookingCancellationInput(body) {
  exact(body, ['scope', 'visitId', 'reason'], ['scope']);
  const base = validateScopeAndVisit(body);
  let reason = null;
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== 'string' || body.reason.length > 500) {
      fail('VALIDATION_FAILED', 'Cancellation reason must be a string up to 500 characters');
    }
    const trimmed = body.reason.trim();
    reason = trimmed || null;
  }
  return { ...base, reason };
}

export function adminBookingRefundsQuery(query = {}) {
  const input = query && typeof query === 'object' ? query : {};
  let limit = 50;
  if (input.limit !== undefined && input.limit !== '') {
    const parsed = Number(input.limit);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
      fail('VALIDATION_FAILED', 'limit must be an integer between 1 and 100');
    }
    limit = parsed;
  }
  let bookingId = null;
  if (input.bookingId !== undefined && input.bookingId !== '') {
    id(input.bookingId);
    bookingId = input.bookingId;
  }
  return { limit, bookingId };
}
