import { describe, expect, jest, test } from '@jest/globals';
import { createAutoAssignmentJob } from '../../src/jobs/auto-assignment.job.js';
import { createSitterDispatchService } from '../../src/services/dispatch.service.js';

const AS_OF = '2026-10-14T04:00:00.000Z';
const sitter = {
  sitterId: 'sitter-001', approved: true, active: true, services: ['DOG_WALK'], workAreas: ['DISTRICT_Q1'],
  available: true, dayOffDates: [], conflicts: [], activeWorkload: 0, distanceKm: 2
};
const visit = (overrides = {}) => ({
  visitId: 'visit-001', bookingId: 'booking-001', serviceId: 'DOG_WALK', areaCode: 'DISTRICT_Q1',
  startAt: '2026-10-20T02:00:00.000Z', endAt: '2026-10-20T03:00:00.000Z',
  state: 'DISPATCH_PENDING', dispatchAllowed: true, dispatchSequence: 2, candidates: [sitter], ...overrides
});

function harness({ visits = [visit()], createOffer = async command => ({ status: 'CREATED', offer: {
  id: 'offer-001', visitId: command.visitId, sitterId: command.sitterId, state: 'PENDING',
  deadline: '2026-10-19T02:00:00.000Z', dispatchSequence: command.dispatchSequence
} }) } = {}) {
  const findDispatchableVisits = jest.fn(async () => visits);
  const createOfferAtomically = jest.fn(createOffer);
  const dispatchService = createSitterDispatchService({ listCandidates: async ({ request }) => visits.find(item => item.visitId === request.visitId)?.candidates ?? [] });
  const job = createAutoAssignmentJob({ repository: { findDispatchableVisits, createOfferAtomically }, dispatchService,
    clock: () => new Date(AS_OF) });
  return { job, findDispatchableVisits, createOfferAtomically };
}

describe('P21 auto assignment job', () => {
  test('rejects an oversized queue without making any offer writes', async () => {
    const { job, createOfferAtomically } = harness({ visits: Array.from({ length: 101 }, () => visit()) });
    await expect(job.runOnce()).rejects.toMatchObject({ code: 'DISPATCH_UNAVAILABLE' });
    expect(createOfferAtomically).not.toHaveBeenCalled();
  });
  test('creates a pending offer through the atomic repository port and never assigns directly', async () => {
    const { job, findDispatchableVisits, createOfferAtomically } = harness();
    await expect(job.runOnce()).resolves.toMatchObject({ queried: 1, created: 1, alreadyHandled: 0, skipped: 0, failed: 0 });
    expect(findDispatchableVisits).toHaveBeenCalledWith({ asOf: AS_OF, limit: 100 });
    expect(createOfferAtomically).toHaveBeenCalledWith(expect.objectContaining({
      visitId: 'visit-001', sitterId: 'sitter-001', dispatchSequence: 2,
      idempotencyKey: expect.stringMatching(/^auto-assignment:v1:[a-f0-9]{64}$/),
      asOf: AS_OF
    }));
    expect(createOfferAtomically.mock.calls[0][0]).not.toHaveProperty('assignedSitterId');
  });

  test('skips directed, unpaid, stale and malformed visits without creating offers', async () => {
    const candidates = [
      visit({ visitId: 'directed', directed: true }),
      visit({ visitId: 'unpaid', paymentRequired: true, paymentStatus: 'PENDING' }),
      visit({ visitId: 'wrong-state', state: 'COMPLETED' }),
      { visitId: 'malformed' }
    ];
    const { job, createOfferAtomically } = harness({ visits: candidates });
    await expect(job.runOnce()).resolves.toMatchObject({ queried: 4, created: 0, skipped: 4, failed: 0 });
    expect(createOfferAtomically).not.toHaveBeenCalled();
  });

  test('handles atomic deduplication and repository races without counting false success', async () => {
    const { job } = harness({ createOffer: async () => ({ status: 'ALREADY_EXISTS' }) });
    await expect(job.runOnce()).resolves.toMatchObject({ created: 0, alreadyHandled: 1, failed: 0 });
    const race = harness({ createOffer: async () => { throw new Error('SLOT_CONFLICT'); } });
    await expect(race.job.runOnce()).resolves.toMatchObject({ created: 0, alreadyHandled: 0, failed: 1 });
  });

  test('coalesces concurrent runs and keeps idempotency key stable across later runs', async () => {
    const createOffer = jest.fn(async () => ({ status: 'CREATED', offer: {
      id: 'offer-001', visitId: 'visit-001', sitterId: 'sitter-001', state: 'PENDING', dispatchSequence: 2
    } }));
    const { job, createOfferAtomically } = harness({ createOffer });
    const first = job.runOnce();
    const second = job.runOnce();
    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({ created: 1 });
    await job.runOnce();
    expect(createOfferAtomically.mock.calls).toHaveLength(2);
    expect(createOfferAtomically.mock.calls[0][0].idempotencyKey)
      .toBe(createOfferAtomically.mock.calls[1][0].idempotencyKey);
  });

  test('rejects missing ports and invalid clock values', async () => {
    expect(() => createAutoAssignmentJob({ repository: {}, dispatchService: {} })).toThrow(TypeError);
    const { job } = harness();
    const invalidClockJob = createAutoAssignmentJob({ repository: {
      findDispatchableVisits: async () => [], createOfferAtomically: async () => ({ status: 'SKIPPED' })
    }, dispatchService: { suggest: async () => ({ selected: [] }) }, clock: () => '2026-10-14T04:00:00' });
    await expect(invalidClockJob.runOnce()).rejects.toThrow('clock must return a valid timezone-aware instant');
    expect(job).toHaveProperty('runOnce');
  });
});
