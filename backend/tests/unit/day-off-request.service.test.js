import { describe, expect, test } from '@jest/globals';
import { createDayOffRequestService, getDayOffServiceDate } from '../../src/services/day-off-request.service.js';

const SITTER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const activeSitter = { userId: 'sitter-user', roles: ['PET_SITTER'], state: 'ACTIVE' };
const CLOCK = () => new Date('2026-10-14T17:00:00.000Z');

class DayOffRepositoryDouble {
  constructor({ version = 7, visitConflicts = { items: [], hasMore: false } } = {}) {
    this.availability = { sitterId: SITTER_ID, version, dayOffDates: [] };
    this.visitConflicts = visitConflicts;
    this.requests = [];
    this.idempotency = new Map();
    this.nextId = 1;
    this.calls = { create: 0, conflictLookup: 0, overlapLookup: 0 };
    this.queue = Promise.resolve();
    this.transaction = {
      getIdempotencyResult: async identity => this.idempotency.get(this.idempotencyKey(identity)) ?? null,
      getAvailabilityForSitter: async sitterId => sitterId === this.availability.sitterId ? this.availability : null,
      findOverlappingDayOffRequests: async ({ sitterId, startDate, endDate }) => {
        this.calls.overlapLookup += 1;
        return this.requests.some(request => request.sitterId === sitterId
          && ['PENDING', 'APPROVED'].includes(request.state)
          && request.startDate <= endDate && request.endDate >= startDate);
      },
      findConfirmedVisitConflicts: async query => {
        this.calls.conflictLookup += 1;
        this.lastConflictQuery = query;
        return this.visitConflicts;
      },
      createPendingDayOffRequest: async ({ request }) => {
        this.calls.create += 1;
        const requestId = this.nextId.toString(16).padStart(24, '0');
        this.nextId += 1;
        this.requests.push({ id: requestId, ...request });
        return { requestId };
      },
      saveIdempotencyResult: async ({ identity, payloadHash, result }) => {
        this.idempotency.set(this.idempotencyKey(identity), { payloadHash, result });
      }
    };
  }

  idempotencyKey({ actorRef, operation, resourceRef, key }) {
    return [actorRef, operation, resourceRef, key].join(':');
  }

  async runForSitterActor(actor, callback) {
    const previous = this.queue;
    let release;
    this.queue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (actor.userId !== 'sitter-user') {
        const error = new Error('not the owner');
        error.status = 404;
        error.code = 'RESOURCE_NOT_FOUND';
        throw error;
      }
      return await callback(this.transaction, { sitterId: SITTER_ID });
    } finally {
      release();
    }
  }
}

function createService(repository = new DayOffRepositoryDouble(), clock = CLOCK) {
  return {
    repository,
    service: createDayOffRequestService({ repository, clock })
  };
}

function request(service, overrides = {}) {
  return service.request({
    actor: activeSitter,
    startDate: '2026-10-20',
    endDate: '2026-10-22',
    expectedVersion: 7,
    idempotencyKey: 'request-key-1',
    ...overrides
  });
}

describe('day-off request service', () => {
  test('uses Vietnam local calendar dates and accepts valid inclusive ranges', async () => {
    expect(getDayOffServiceDate(new Date('2026-10-14T16:59:59.999Z'))).toBe('2026-10-14');
    expect(getDayOffServiceDate(new Date('2026-10-14T17:00:00.000Z'))).toBe('2026-10-15');

    const { repository, service } = createService();
    const result = await request(service);
    expect(result).toMatchObject({
      request: { state: 'PENDING', startDate: '2026-10-20', endDate: '2026-10-22', availabilityVersion: 7 },
      conflicts: { count: 0 },
      availabilityChanged: false,
      requiresStaffReview: true,
      hasConfirmedVisitConflicts: false
    });
    expect(result.request.id).toMatch(/^[0-9a-f]{24}$/);
    expect(repository.lastConflictQuery).toMatchObject({
      sitterId: SITTER_ID, startDate: '2026-10-20', endDate: '2026-10-22', limit: 101,
    });
    expect(repository.availability.dayOffDates).toEqual([]);
    expect(repository.requests).toHaveLength(1);
    expect(repository.requests[0].state).toBe('PENDING');
  });

  test('reports only the confirmed-visit conflict count and leaves availability unchanged', async () => {
    const repository = new DayOffRepositoryDouble({ visitConflicts: { items: [{ id: 'private-visit-ref' }, { id: 'other-ref' }], hasMore: false } });
    const { service } = createService(repository);
    const result = await request(service);
    expect(result.conflicts).toEqual({ count: 2 });
    expect(result.requiresStaffReview).toBe(true);
    expect(result.hasConfirmedVisitConflicts).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/customer|address|accessNotes/i);
    expect(repository.availability.dayOffDates).toEqual([]);
  });

  test('bounds confirmed-visit conflict reads and reports a saturated count', async () => {
    const repository = new DayOffRepositoryDouble({
      visitConflicts: { items: Array.from({ length: 101 }, (_, index) => ({ id: `visit-${index}`, customerAddress: 'private' })), hasMore: true },
    });
    const { service } = createService(repository);
    const result = await request(service);
    expect(result.conflicts).toEqual({ count: 101 });
    expect(JSON.stringify(result)).not.toMatch(/visit-|customerAddress|private/);
    expect(repository.lastConflictQuery.limit).toBe(101);
  });

  test.each([
    ['malformed date', { startDate: '2026-2-20' }, 'startDate'],
    ['impossible calendar date', { startDate: '2026-02-30' }, 'startDate'],
    ['reversed range', { startDate: '2026-10-22', endDate: '2026-10-20' }, 'endDate'],
    ['past local date', { startDate: '2026-10-14', endDate: '2026-10-14' }, 'startDate'],
    ['negative version', { expectedVersion: -1 }, 'expectedVersion'],
    ['short idempotency key', { idempotencyKey: 'short' }, 'idempotencyKey'],
    ['missing idempotency key', { idempotencyKey: '' }, 'idempotencyKey']
  ])('rejects %s before opening a transaction', async (_label, overrides) => {
    const { repository, service } = createService();
    await expect(request(service, overrides)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(repository.calls.create).toBe(0);
  });

  test('requires an active sitter actor and conceals another sitter’s availability', async () => {
    const { repository, service } = createService();
    await expect(request(service, { actor: { userId: 'staff-user', roles: ['STAFF'], state: 'ACTIVE' } }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(request(service, { actor: { ...activeSitter, userId: 'other-sitter' } }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
    expect(repository.calls.create).toBe(0);
  });

  test('rejects stale availability versions and overlapping active requests', async () => {
    const stale = createService();
    await expect(request(stale.service, { expectedVersion: 6 }))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    expect(stale.repository.calls.create).toBe(0);

    const overlap = createService();
    await request(overlap.service);
    await expect(request(overlap.service, { idempotencyKey: 'different-key' }))
      .rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    expect(overlap.repository.calls.create).toBe(1);
  });

  test('rejects dates already approved in Availability before creating a request', async () => {
    const repository = new DayOffRepositoryDouble();
    repository.availability.dayOffDates = ['2026-10-21'];
    const { service } = createService(repository);
    await expect(request(service)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    expect(repository.calls.create).toBe(0);
  });

  test('replays the same idempotent result and rejects key reuse with a different payload', async () => {
    const { repository, service } = createService();
    const first = await request(service);
    const replay = await request(service);
    expect(replay).toEqual(first);
    expect(repository.calls.create).toBe(1);
    expect(repository.calls.overlapLookup).toBe(1);

    await expect(request(service, { endDate: '2026-10-23' }))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    expect(repository.calls.create).toBe(1);
  });

  test('replays a saved request after its start date has passed', async () => {
    let now = new Date('2026-10-14T17:00:00.000Z');
    const repository = new DayOffRepositoryDouble();
    const { service } = createService(repository, () => now);
    const first = await request(service);
    now = new Date('2026-10-20T17:00:00.000Z');
    await expect(request(service)).resolves.toEqual(first);
    expect(repository.calls.create).toBe(1);
  });

  test('serializes overlapping concurrent submissions so only one becomes pending', async () => {
    const { repository, service } = createService();
    const results = await Promise.allSettled([
      request(service, { idempotencyKey: 'concurrent-1' }),
      request(service, { idempotencyKey: 'concurrent-2' })
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ status: 409, code: 'INVALID_STATE' });
    expect(repository.requests).toHaveLength(1);
    expect(repository.availability.dayOffDates).toEqual([]);
  });
});
