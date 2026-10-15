import { ApiError, createApiClient } from './api-client.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

function requireIdentifier(value, field) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ApiError(`INVALID_${field.toUpperCase()}`, 400);
  return value;
}

function requireKey(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ApiError('INVALID_IDEMPOTENCY_KEY', 400);
  }
  return value;
}

function slot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.startAt !== 'string' || typeof value.endAt !== 'string') {
    throw new ApiError('INVALID_SLOT', 400);
  }
  return { startAt: value.startAt, endAt: value.endAt };
}

function proposalResult(result) {
  if (result?.pending) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !IDENTIFIER.test(value.id ?? '') || !IDENTIFIER.test(value.visitId ?? '')
    || !IDENTIFIER.test(value.sitterId ?? '') || typeof value.state !== 'string'
    || !Array.isArray(value.slots) || value.slots.some(item => {
      try { slot(item); return false; } catch { return true; }
    }) || !Number.isSafeInteger(value.version) || value.version < 0) {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return { ...result, data: value };
}

function confirmationResult(result) {
  if (result?.pending) return result;
  const value = result?.data;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !value.proposal || !value.offer || !IDENTIFIER.test(value.offer.id ?? '')
    || typeof value.offer.state !== 'string') {
    throw new ApiError('INVALID_RESPONSE', result?.status || 0);
  }
  return { ...result, data: value };
}

export function createDirectedBookingProposalApi({ request, fetchImpl, getCsrfToken, onUnauthorized, timeoutMs } = {}) {
  let defaultRequest;
  const send = (...args) => {
    if (request) return request(...args);
    if (!defaultRequest) defaultRequest = createApiClient({ fetchImpl, getCsrfToken, onUnauthorized, timeoutMs });
    return defaultRequest(...args);
  };

  async function createProposal({ bookingId, visitId, sitterId, slots, idempotencyKey } = {}) {
    const visit = requireIdentifier(visitId, 'visit_id');
    const sitter = requireIdentifier(sitterId, 'sitter_id');
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > 20) throw new ApiError('INVALID_SLOTS', 400);
    const normalized = slots.map(slot);
    const idempotency = requireKey(idempotencyKey);
    const path = bookingId === undefined || bookingId === null
      ? `/visits/${encodeURIComponent(visit)}/directed-proposals`
      : `/bookings/${encodeURIComponent(requireIdentifier(bookingId, 'booking_id'))}/visits/${encodeURIComponent(visit)}/proposals`;
    return proposalResult(await send(path, { method: 'POST', body: {
      ...(bookingId === undefined || bookingId === null ? {} : { bookingId }), sitterId: sitter, slots: normalized
    }, idempotencyKey: idempotency }));
  }

  async function getAvailability({ bookingId, visitId, sitterId, signal } = {}) {
    const visit = requireIdentifier(visitId, 'visit_id');
    const sitter = requireIdentifier(sitterId, 'sitter_id');
    const params = new globalThis.URLSearchParams({ sitterId: sitter });
    if (bookingId !== undefined && bookingId !== null) params.set('bookingId', requireIdentifier(bookingId, 'booking_id'));
    const result = await send(`/visits/${encodeURIComponent(visit)}/directed-proposals/availability?${params}`, { signal });
    if (result?.pending) return result;
    if (!Array.isArray(result?.data?.slots) || !Number.isSafeInteger(result?.data?.availabilityVersion)) {
      throw new ApiError('INVALID_RESPONSE', result?.status || 0);
    }
    return result;
  }

  async function getProposal(proposalId, options = {}) {
    const input = typeof proposalId === 'object' && proposalId !== null ? proposalId : { ...options, proposalId };
    const id = requireIdentifier(input.proposalId ?? input.id, 'proposal_id');
    return proposalResult(await send(`/directed-proposals/${encodeURIComponent(id)}`, { signal: input.signal }));
  }

  async function confirmProposal(proposalId, { expectedVersion, selectedSlot, idempotencyKey } = {}) {
    const id = requireIdentifier(proposalId, 'proposal_id');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new ApiError('INVALID_VERSION', 400);
    const idempotency = requireKey(idempotencyKey);
    return confirmationResult(await send(`/directed-proposals/${encodeURIComponent(id)}/confirm`, {
      method: 'POST', body: { selectedSlot: slot(selectedSlot) }, expectedVersion, idempotencyKey: idempotency
    }));
  }

  return Object.freeze({ createProposal, propose: createProposal, getAvailability, getProposal, confirmProposal, confirm: confirmProposal });
}

export const directedBookingProposalApi = createDirectedBookingProposalApi();
