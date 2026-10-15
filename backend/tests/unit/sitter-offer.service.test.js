import { describe, expect, test } from '@jest/globals';
import { createSitterOfferService } from '../../src/services/sitter-offer.service.js';

const SITTER = 'sitter-1';
const OTHER = 'sitter-2';
const OFFER = 'offer-1';
const VISIT = 'visit-1';
const now = Date.parse('2026-10-15T00:00:00.000Z');
const actor = { userId: SITTER, roles: ['PET_SITTER'], state: 'ACTIVE' };

function offer(overrides = {}) {
  return { id: OFFER, visitId: VISIT, sitterId: SITTER, state: 'PENDING', version: 1,
    offeredAt: '2026-10-14T23:00:00.000Z', deadline: '2026-10-15T01:00:00.000Z',
    startAt: '2026-10-16T02:00:00.000Z', endAt: '2026-10-16T03:00:00.000Z',
    serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [{ id: 'pet-1', name: 'Milo', species: 'DOG' }], ...overrides };
}

function visit(overrides = {}) {
  return { id: VISIT, visitId: VISIT, startAt: '2026-10-16T02:00:00.000Z', endAt: '2026-10-16T03:00:00.000Z', ...overrides };
}

function repository(seed = {}) {
  const state = { offer: offer(), visit: visit(), accepted: false, declined: false, calls: [], ...seed };
  const operations = new Map();
  let queue = Promise.resolve();
  return {
    state,
    async listOffers({ sitterId, limit }) {
      if (sitterId !== SITTER) return { items: [], nextCursor: null };
      return { items: state.offer ? [state.offer].slice(0, limit) : [], nextCursor: null };
    },
    async getOffer({ sitterId }) { return sitterId === SITTER ? globalThis.structuredClone(state.offer) : null; },
    async listAssignedVisits({ sitterId }) {
      return { items: sitterId === SITTER ? (state.assignments ?? []) : [], nextCursor: null };
    },
    async runOfferCommand(command) {
      const prior = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await prior;
      try {
        const fingerprint = JSON.stringify(command.payload);
        const existing = operations.get(command.idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw Object.assign(new Error('reuse'), { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
          return globalThis.structuredClone(existing.result);
        }
        const tx = {
          getOffer: async () => globalThis.structuredClone(state.offer),
          getVisit: async () => globalThis.structuredClone(state.visit),
          recheckEligibility: async ({ sitterId }) => ({ eligible: sitterId === SITTER && !state.suspended }),
          checkSlotAvailability: async () => state.slotAvailable !== false,
          acceptOffer: async ({ expectedVersion }) => {
            state.offer = { ...state.offer, state: 'ACCEPTED', version: expectedVersion + 1 };
            state.accepted = true; state.calls.push('accept');
            return { state: 'ACCEPTED', sitterId: SITTER, version: expectedVersion + 1, assignmentId: 'assignment-1' };
          },
          declineOffer: async ({ expectedVersion }) => {
            state.offer = { ...state.offer, state: 'DECLINED', version: expectedVersion + 1 };
            state.declined = true; state.calls.push('decline');
            return { state: 'DECLINED', version: expectedVersion + 1 };
          },
          appendAuditAndOutbox: async event => state.calls.push(event.type)
        };
        const result = await command.execute(tx);
        operations.set(command.idempotencyKey, { fingerprint, result: globalThis.structuredClone(result) });
        return result;
      } finally { release(); }
    }
  };
}

describe('sitter offer projections and commands', () => {
  test('lists bounded offers without private address or access fields', async () => {
    const repo = repository();
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    const result = await service.list(actor, { limit: 20 });
    expect(result.items[0]).toMatchObject({ id: OFFER, visitId: VISIT, canRespond: true, pets: [{ name: 'Milo' }] });
    expect(result.items[0]).not.toHaveProperty('privateAccessNotes');
    expect(result.items[0]).not.toHaveProperty('address');
    await expect(service.list({ ...actor, roles: ['CUSTOMER'] })).rejects.toMatchObject({ status: 403 });
  });

  test('accepts assignment-state filters for the assigned schedule', async () => {
    const repo = repository({ assignments: [{ id: VISIT, visitId: VISIT, sitterId: SITTER, state: 'ASSIGNED', version: 1,
      startAt: '2026-10-16T02:00:00.000Z', endAt: '2026-10-16T03:00:00.000Z', serviceName: 'Chăm sóc chó', areaCode: 'Q1', pets: [] }] });
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.assignments(actor, { state: 'ASSIGNED' })).resolves.toMatchObject({ items: [{ visitId: VISIT }] });
  });

  test('accept rechecks eligibility and slot inside the repository command', async () => {
    const repo = repository();
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.accept(actor, OFFER, 1, 'accept-offer-1')).resolves.toMatchObject({ state: 'ASSIGNED', sitterId: SITTER });
    expect(repo.state.calls).toEqual(['accept', 'OfferAccepted']);
    await expect(service.accept(actor, OFFER, 1, 'accept-offer-1')).resolves.toMatchObject({ state: 'ASSIGNED' });
    expect(repo.state.calls).toHaveLength(2);
  });

  test.each([
    ['expired', { deadline: '2026-10-14T23:59:59.000Z' }, 'OFFER_EXPIRED'],
    ['revoked', { revoked: true }, 'OFFER_REVOKED'],
    ['suspended', { suspended: true }, 'SITTER_NOT_ELIGIBLE'],
    ['slot conflict', {}, 'SLOT_UNAVAILABLE']
  ])('%s offer acceptance is rejected without assignment', async (_name, changes, code) => {
    const repo = _name === 'suspended' ? repository({ suspended: true }) : repository({ offer: offer(changes) });
    if (_name === 'slot conflict') repo.state.slotAvailable = false;
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.accept(actor, OFFER, 1, `accept-${_name.replace(/ /g, '-')}`)).rejects.toMatchObject({ code });
    expect(repo.state.accepted).toBe(false);
  });

  test('deadline is exclusive and decline remains an operational offer decision', async () => {
    const repo = repository();
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.decline(actor, OFFER, 1, 'decline-offer-1')).resolves.toMatchObject({ state: 'DECLINED' });
    expect(repo.state.calls).toEqual(['decline', 'OfferDeclined']);
  });

  test.each([
    ['another assignment', { sitterId: OTHER }, 'VISIT_ALREADY_ASSIGNED'],
    ['unverified payment', { paymentRequired: true, paymentStatus: 'PENDING' }, 'PAYMENT_REQUIRED'],
    ['directed mismatch', { directed: true, requestedSitterId: OTHER }, 'DIRECTED_SITTER_MISMATCH']
  ])('rejects acceptance when the visit has a %s guard', async (_name, changes, code) => {
    const repo = repository({ visit: visit(changes) });
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.accept(actor, OFFER, 1, `accept-guard-${_name.replace(/ /g, '-')}`)).rejects.toMatchObject({ code });
    expect(repo.state.accepted).toBe(false);
  });

  test('does not allow another sitter to read an offer', async () => {
    const repo = repository();
    const service = createSitterOfferService({ repository: repo, clock: () => now });
    await expect(service.detail({ ...actor, userId: OTHER }, OFFER)).rejects.toMatchObject({ status: 404 });
  });
});
