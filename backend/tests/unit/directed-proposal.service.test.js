import { describe, expect, jest, test } from '@jest/globals';
import { createDirectedSitterProposalService } from '../../src/services/directed-proposal.service.js';

const customer = { userId: 'customer-001', roles: ['CUSTOMER'], state: 'ACTIVE' };
const slotA = { startAt: '2026-10-20T02:00:00.000Z', endAt: '2026-10-20T03:00:00.000Z' };
const slotB = { startAt: '2026-10-21T02:00:00.000Z', endAt: '2026-10-21T03:00:00.000Z' };

function harness({ availability = { slots: [slotA, slotB], availabilityVersion: 4 } } = {}) {
  const proposals = new Map();
  let nextId = 1;
  const availabilityRepository = { findAvailableSlots: jest.fn(async () => availability) };
  const proposalRepository = {
    findByIdempotency: jest.fn(async ({ idempotencyKey }) => [...proposals.values()].find(item => item.idempotencyKey === idempotencyKey) ?? null),
    createPending: jest.fn(async command => {
      const proposal = { id: `proposal-${nextId++}`, version: 0, state: 'PENDING_CUSTOMER_CONFIRMATION', ...command };
      proposals.set(proposal.id, proposal);
      return proposal;
    }),
    findOwned: jest.fn(async ({ proposalId, customerId }) => {
      const proposal = proposals.get(proposalId);
      return proposal?.customerId === customerId ? proposal : null;
    }),
    confirmAndCreateOffer: jest.fn(async ({ proposalId, selectedSlot }) => {
      const proposal = proposals.get(proposalId);
      if (!proposal || proposal.state !== 'PENDING_CUSTOMER_CONFIRMATION') return null;
      proposal.state = 'CONFIRMED';
      proposal.selectedSlot = selectedSlot;
      proposal.version += 1;
      return { proposal, offer: { id: 'offer-1', visitId: proposal.visitId, sitterId: proposal.sitterId,
        state: 'PENDING', deadline: '2026-10-19T02:00:00.000Z', dispatchSequence: 0 } };
    })
  };
  return { service: createDirectedSitterProposalService({ availabilityRepository, proposalRepository }),
    availabilityRepository, proposalRepository, proposals };
}

describe('directed sitter proposal gate', () => {
  test('reads availability and creates a pending customer proposal without an offer', async () => {
    const { service, availabilityRepository, proposalRepository } = harness();
    const result = await service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotA], idempotencyKey: 'proposal-key-001' });
    expect(result).toMatchObject({ state: 'PENDING_CUSTOMER_CONFIRMATION', visitId: 'visit-001', sitterId: 'sitter-001', version: 0 });
    expect(result.slots).toEqual([slotA]);
    expect(availabilityRepository.findAvailableSlots).toHaveBeenCalledWith({ sitterId: 'sitter-001', visitId: 'visit-001', slots: [slotA] });
    expect(proposalRepository.confirmAndCreateOffer).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/pet|address|private/i);
  });

  test('replays idempotent proposal creation and rejects a slot unavailable on the server', async () => {
    const { service, proposalRepository } = harness({ availability: { slots: [slotB], availabilityVersion: 5 } });
    await expect(service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotA], idempotencyKey: 'proposal-key-001' })).rejects.toMatchObject({ code: 'NO_AVAILABLE_SLOT' });

    const first = await service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotB], idempotencyKey: 'proposal-key-002' });
    const replay = await service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotB], idempotencyKey: 'proposal-key-002' });
    expect(replay).toEqual(first);
    expect(proposalRepository.createPending).toHaveBeenCalledTimes(1);
  });

  test('returns a business no-slot result when availability is empty', async () => {
    const { service } = harness({ availability: { slots: [], availabilityVersion: 5 } });
    await expect(service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotA], idempotencyKey: 'proposal-key-empty' })).rejects.toMatchObject({ code: 'NO_AVAILABLE_SLOT' });
  });

  test('requires customer confirmation before atomically creating the offer', async () => {
    const { service, proposalRepository } = harness();
    const pending = await service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotA, slotB], idempotencyKey: 'proposal-key-001' });
    const result = await service.confirmProposal({ actor: customer, proposalId: pending.id, expectedVersion: 0,
      selectedSlot: slotA, idempotencyKey: 'confirm-key-001' });
    expect(result).toMatchObject({ proposal: { state: 'CONFIRMED', selectedSlot: slotA }, offer: {
      visitId: 'visit-001', sitterId: 'sitter-001', state: 'PENDING' } });
    expect(proposalRepository.confirmAndCreateOffer).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'customer-001', proposalId: pending.id, expectedVersion: 0, selectedSlot: slotA
    }));
  });

  test('conceals missing/other-customer proposals and rejects stale or unproposed slots', async () => {
    const { service } = harness();
    await expect(service.confirmProposal({ actor: customer, proposalId: 'missing', expectedVersion: 0,
      selectedSlot: slotA, idempotencyKey: 'confirm-key-001' })).rejects.toMatchObject({ status: 404 });
    const pending = await service.createProposal({ actor: customer, visitId: 'visit-001', sitterId: 'sitter-001',
      slots: [slotA], idempotencyKey: 'proposal-key-001' });
    await expect(service.confirmProposal({ actor: customer, proposalId: pending.id, expectedVersion: 1,
      selectedSlot: slotA, idempotencyKey: 'confirm-key-002' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(service.confirmProposal({ actor: customer, proposalId: pending.id, expectedVersion: 0,
      selectedSlot: slotB, idempotencyKey: 'confirm-key-003' })).rejects.toMatchObject({ code: 'SLOT_NOT_PROPOSED' });
  });

  test('does not let a sitter or inactive customer create/confirm a proposal', async () => {
    const { service } = harness();
    await expect(service.createProposal({ actor: { userId: 'sitter-001', roles: ['PET_SITTER'], state: 'ACTIVE' },
      visitId: 'visit-001', sitterId: 'sitter-001', slots: [slotA], idempotencyKey: 'proposal-key-001' }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(service.createProposal({ actor: { ...customer, state: 'LOCKED' }, visitId: 'visit-001',
      sitterId: 'sitter-001', slots: [slotA], idempotencyKey: 'proposal-key-002' }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});
