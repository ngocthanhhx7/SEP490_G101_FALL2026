import { test, expect, jest } from '@jest/globals';
import { createDirectedSitterProposalService } from '../../../src/services/directed-proposal.service.js';
const OWNER = { userId: 'customer-1', state: 'ACTIVE', roles: ['CUSTOMER'] };
const SLOT = { startAt: '2026-11-18T10:00:00.000Z', endAt: '2026-11-18T11:00:00.000Z' };
function fixture({ available = true, foreign = false, unknown = false } = {}) {
  const saved = [], offers = [];
  const proposal = { id: 'proposal-1', bookingId: 'booking-1', visitId: 'visit-1', sitterId: 'known-sitter', customerId: foreign ? 'customer-2' : OWNER.userId,
    state: 'PENDING_CUSTOMER_CONFIRMATION', slots: [SLOT], availabilityVersion: 0, version: 0, paymentRequired: false,
    priceSnapshot: { amountVnd: 150000, currency: 'VND', serviceName: 'Home visit' } };
  const availabilityRepository = { findAvailableSlots: jest.fn(async () => ({ slots: available ? [SLOT] : [], availabilityVersion: 0 })) };
  const proposalRepository = { findByIdempotency: async () => null,
    createPending: jest.fn(async input => { saved.push(input); return { ...proposal, ...input }; }),
    findOwned: async () => proposal,
    confirmAndCreateOffer: jest.fn(async input => { offers.push(input); return {
      proposal: { ...proposal, state: 'CONFIRMED', version: 1, selectedSlot: input.selectedSlot },
      offer: { id: 'offer-1', visitId: 'visit-1', sitterId: 'known-sitter', state: 'OPEN', dispatchSequence: 0 } }; }) };
  const bookingRepository = { getDirectedContext: jest.fn(async () => ({ directed: true,
    sitterId: unknown ? 'different-sitter' : 'known-sitter', paymentRequired: false, priceSnapshot: proposal.priceSnapshot })) };
  return { service: createDirectedSitterProposalService({ availabilityRepository, proposalRepository, bookingRepository }),
    proposalRepository, saved, offers, create: { actor: OWNER, bookingId: 'booking-1', visitId: 'visit-1', sitterId: 'known-sitter', slots: [SLOT], idempotencyKey: 'synthetic-proposal' },
    confirm: { actor: OWNER, proposalId: 'proposal-1', expectedVersion: 0, selectedSlot: SLOT, idempotencyKey: 'synthetic-confirm' } };
}

// SRS: GBR-01/02/12; UC-25: chỉ khách của booking chọn sitter từng chăm pet, chỉ thời gian khả thi; snapshot giá giữ nguyên.
test("PROPOSAL-01-UTCID01 [N] Lưu lựa chọn sitter quen với giờ khả thi và giá snapshot", async () => {
  const f = fixture();
  const actual = await f.service.createProposal(f.create);
  expect(actual).toMatchObject({ sitterId: 'known-sitter', slots: [SLOT], priceSnapshot: { amountVnd: 150000, currency: 'VND' } });
  expect(f.saved).toHaveLength(1); expect(f.offers).toEqual([]);
});

// SRS: GBR-12; UC-25
test("PROPOSAL-01-UTCID02 [A] Không lưu giờ sitter không thể nhận", async () => {
  const f = fixture({ available: false });
  await expect(f.service.createProposal(f.create)).rejects.toMatchObject({ code: 'NO_AVAILABLE_SLOT', status: 409 });
  expect(f.saved).toEqual([]);
});

// SRS: GBR-12; UC-25
test("PROPOSAL-01-UTCID03 [A] Không chọn sitter khác context đã xác minh", async () => {
  const f = fixture({ unknown: true });
  await expect(f.service.createProposal(f.create)).rejects.toMatchObject({ code: 'DIRECTED_PROPOSAL_NOT_ALLOWED', status: 409 });
  expect(f.saved).toEqual([]);
});

// SRS: GBR-01
test("PROPOSAL-01-UTCID04 [A] Anonymous không được tạo lựa chọn", async () => {
  const f = fixture(); f.create.actor = null;
  await expect(f.service.createProposal(f.create)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  expect(f.saved).toEqual([]);
});

// SRS: GBR-02; UC-25
test("PROPOSAL-01-UTCID05 [A] Staff không được chọn thay qua method Customer", async () => {
  const f = fixture(); f.create.actor = { ...OWNER, roles: ["STAFF"] };
  await expect(f.service.createProposal(f.create)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(f.saved).toEqual([]);
});
