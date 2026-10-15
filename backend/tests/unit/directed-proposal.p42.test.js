import { expect, jest, test } from '@jest/globals';
import { createDirectedBookingProposalService } from '../../src/services/booking-proposals/directed-booking-proposal.service.js';

const actor = { userId: 'customer-1', roles: ['CUSTOMER'], state: 'ACTIVE' };
const slot = { startAt: '2026-10-20T02:00:00.000Z', endAt: '2026-10-20T03:00:00.000Z' };

function harness({ proposal = {}, clock = () => Date.parse('2026-10-19T00:00:00.000Z'), context } = {}) {
  const current = { id: 'proposal-1', customerId: actor.userId, visitId: 'visit-1', sitterId: 'sitter-1',
    state: 'PENDING_CUSTOMER_CONFIRMATION', slots: [slot], availabilityVersion: 2, version: 0, ...proposal };
  const confirmations = new Map();
  const proposalRepository = {
    findByIdempotency: jest.fn(async () => null),
    findConfirmationByIdempotency: jest.fn(async ({ idempotencyKey }) => confirmations.get(idempotencyKey) || null),
    createPending: jest.fn(async value => Object.assign(current, value)),
    findOwned: jest.fn(async () => current),
    confirmAndCreateOffer: jest.fn(async value => {
      current.state = 'CONFIRMED'; current.version += 1; current.selectedSlot = value.selectedSlot;
      const result = { proposal: { ...current }, offer: { id: 'offer-1', visitId: current.visitId,
        sitterId: current.sitterId, state: 'PENDING', dispatchSequence: 0 } };
      confirmations.set(value.idempotencyKey, result);
      return result;
    })
  };
  const service = createDirectedBookingProposalService({
    availabilityRepository: { findAvailableSlots: async () => ({ slots: [slot], availabilityVersion: 2 }) },
    proposalRepository,
    bookingRepository: context ? { getDirectedContext: async () => context } : undefined,
    clock
  });
  return { service, proposalRepository };
}

test('uses server booking context and blocks unpaid multi-visit offer dispatch', async () => {
  const { service, proposalRepository } = harness({ context: {
    directed: true, paymentRequired: true, paymentState: 'PENDING', priceSnapshot: { amountVnd: 300000 }
  } });
  const pending = await service.createProposal({ actor, bookingId: 'booking-1', visitId: 'visit-1', sitterId: 'sitter-1', slots: [slot],
    paymentRequired: false, idempotencyKey: 'proposal-key-1' });
  expect(pending.priceSnapshot).toMatchObject({ amountVnd: 300000 });
  await expect(service.confirmProposal({ actor, proposalId: pending.id, expectedVersion: 0,
    selectedSlot: slot, idempotencyKey: 'confirm-key-1' })).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
  expect(proposalRepository.confirmAndCreateOffer).not.toHaveBeenCalled();
});

test('expires a proposal using the injected server clock', async () => {
  const { service } = harness({ proposal: { expiresAt: '2026-10-18T00:00:00.000Z' } });
  await expect(service.confirmProposal({ actor, proposalId: 'proposal-1', expectedVersion: 0,
    selectedSlot: slot, idempotencyKey: 'confirm-key-2' })).rejects.toMatchObject({ code: 'PROPOSAL_EXPIRED' });
});

test('serializes concurrent confirmations and replays the same idempotency result', async () => {
  const { service, proposalRepository } = harness();
  const [first, second] = await Promise.allSettled([
    service.confirmProposal({ actor, proposalId: 'proposal-1', expectedVersion: 0, selectedSlot: slot, idempotencyKey: 'confirm-key-3' }),
    service.confirmProposal({ actor, proposalId: 'proposal-1', expectedVersion: 0, selectedSlot: slot, idempotencyKey: 'confirm-key-4' })
  ]);
  expect([first.status, second.status].sort()).toEqual(['fulfilled', 'rejected']);
  expect(proposalRepository.confirmAndCreateOffer).toHaveBeenCalledTimes(1);
  const replay = await service.confirmProposal({ actor, proposalId: 'proposal-1', expectedVersion: 0,
    selectedSlot: slot, idempotencyKey: 'confirm-key-3' });
  expect(replay.offer.id).toBe('offer-1');
});
