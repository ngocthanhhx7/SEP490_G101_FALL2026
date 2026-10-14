import { describe, expect, jest, test } from '@jest/globals';
import {
  createSitterDispatchService,
  evaluateCandidate,
  normalizeDispatchRequest,
  rankEligibleCandidates
} from '../../src/services/dispatch.service.js';

const request = (overrides = {}) => ({
  visitId: 'visit-001', bookingId: 'booking-001', serviceId: 'DOG_WALK', areaCode: 'DISTRICT_Q1',
  startAt: '2026-10-20T02:00:00.000Z', endAt: '2026-10-20T03:00:00.000Z',
  dispatchAllowed: true, ...overrides
});

const candidate = (sitterId, overrides = {}) => ({
  sitterId, approved: true, active: true, services: ['DOG_WALK'], workAreas: ['DISTRICT_Q1'],
  available: true, dayOffDates: [], conflicts: [], activeWorkload: 1,
  distanceKm: 2, rating: 4.8, ratingCount: 4, ...overrides
});

describe('P21 sitter eligibility and deterministic dispatch', () => {
  test('fails closed when a hard-gate snapshot is missing', () => {
    const result = evaluateCandidate(candidate('sitter-1', { conflicts: undefined, conflictChecked: undefined }), request());
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('CONFLICT_STATUS_UNKNOWN');
  });

  test('removes inactive, unapproved, wrong-service, wrong-area, unavailable, day-off and conflicting sitters before ranking', () => {
    const records = [
      candidate('good'),
      candidate('inactive', { active: false }),
      candidate('unapproved', { approved: false }),
      candidate('service-mismatch', { services: ['CAT_SITTING'] }),
      candidate('area-mismatch', { workAreas: ['CITY_HCM'] }),
      candidate('busy', { available: false }),
      candidate('day-off', { dayOffDates: ['2026-10-20'] }),
      candidate('conflict', { conflicts: [{ visitId: 'existing' }] })
    ];
    const result = rankEligibleCandidates({ request: request(), candidates: records, limit: 10 });
    expect(result.selected.map(item => item.sitterId)).toEqual(['good']);
    expect(result.excluded.find(item => item.sitterId === 'inactive').reasons).toContain('NOT_ACTIVE');
    expect(result.excluded.find(item => item.sitterId === 'day-off').reasons).toContain('DAY_OFF');
    expect(result.excluded.find(item => item.sitterId === 'conflict').reasons).toContain('VISIT_CONFLICT');
    expect(JSON.stringify(result)).not.toMatch(/existing/);
  });

  test('uses stable rules and keeps a new unrated sitter eligible without a fabricated score', () => {
    const result = rankEligibleCandidates({ request: request(), candidates: [
      candidate('rated-high', { activeWorkload: 5, distanceKm: 1, rating: 5 }),
      candidate('new-sitter', { activeWorkload: 0, distanceKm: 4, rating: undefined, ratingCount: undefined }),
      candidate('rated-low', { activeWorkload: 0, distanceKm: 4, rating: 3 })
    ], limit: 10 });
    expect(result.selected.map(item => item.sitterId)).toEqual(['new-sitter', 'rated-low', 'rated-high']);
    expect(result.selected[0].reasons).toContain('NEW_OR_UNRATED_SITTER');
    expect(result.selected[0]).not.toHaveProperty('score');
    expect(result.selected.map(item => item.rank)).toEqual([1, 2, 3]);
  });

  test('tie-breaks by sitter id and ignores duplicate records', () => {
    const result = rankEligibleCandidates({ request: request(), candidates: [
      candidate('sitter-b', { activeWorkload: 1, distanceKm: 2 }),
      candidate('sitter-a', { activeWorkload: 1, distanceKm: 2 }),
      candidate('sitter-a', { activeWorkload: 0, distanceKm: 0 })
    ], limit: 10 });
    expect(result.selected.map(item => item.sitterId)).toEqual(['sitter-a', 'sitter-b']);
  });

  test('payment gate blocks a prepay visit until P51 marks dispatch allowed', () => {
    expect(() => normalizeDispatchRequest({ ...request(), dispatchAllowed: undefined,
      paymentRequired: true, paymentStatus: 'PENDING' })).toThrow(expect.objectContaining({ code: 'PAYMENT_REQUIRED' }));
    expect(normalizeDispatchRequest({ ...request(), dispatchAllowed: true,
      paymentRequired: true, paymentStatus: 'PENDING' })).toMatchObject({ dispatchAllowed: true });
    expect(normalizeDispatchRequest({ ...request(), paymentRequired: true,
      paymentStatus: 'VERIFIED' })).toMatchObject({ paymentRequired: true });
  });

  test('does not trust a caller supplied local date that differs from the service timezone', () => {
    expect(() => normalizeDispatchRequest({ ...request(), localDate: '2026-10-21' }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  test('provider ranking errors fall back to explainable deterministic ordering', async () => {
    const listCandidates = jest.fn(async () => [candidate('sitter-b'), candidate('sitter-a')]);
    const ranker = jest.fn(async () => { throw new Error('provider unavailable'); });
    const service = createSitterDispatchService({ listCandidates, ranker });
    const result = await service.suggest({ request: request(), limit: 2 });
    expect(result.rankingSource).toBe('DETERMINISTIC_RULES');
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe('RANKER_UNAVAILABLE');
    expect(result.selected.map(item => item.sitterId)).toEqual(['sitter-a', 'sitter-b']);
    expect(listCandidates).toHaveBeenCalledWith({ request: expect.objectContaining({ serviceId: 'DOG_WALK' }), limit: 2 });
  });

  test('provider output cannot inject an ineligible or unknown candidate', async () => {
    const service = createSitterDispatchService({
      listCandidates: async () => [candidate('sitter-a'), candidate('sitter-b')],
      ranker: async () => ['not-a-candidate', 'sitter-a']
    });
    const result = await service.suggest({ request: request(), limit: 2 });
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toBe('RANKER_INVALID_RESULT');
  });

  test('normalizes candidate provider failures to a safe dispatch error', async () => {
    const service = createSitterDispatchService({ listCandidates: async () => {
      throw new Error('provider unavailable');
    } });
    await expect(service.suggest({ request: request() }))
      .rejects.toMatchObject({ status: 503, code: 'DISPATCH_UNAVAILABLE' });
  });
});
