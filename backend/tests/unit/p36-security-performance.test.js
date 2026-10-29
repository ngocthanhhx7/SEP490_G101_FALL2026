import { describe, expect, jest, test } from '@jest/globals';
import { requireCsrf, requireSession } from '../../src/middlewares/session.js';
import { rankEligibleCandidates } from '../../src/services/dispatch.service.js';

const activeCustomer = {
  userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  sessionId: 'session-synthetic',
  state: 'ACTIVE',
  roles: ['CUSTOMER'],
  expiresAt: Date.parse('2026-10-15T05:00:00.000Z')
};

function requestFor({ origin, token, protocol = 'https' } = {}) {
  const headers = { origin, 'x-csrf-token': token };
  return {
    protocol,
    auth: activeCustomer,
    get(name) {
      return name.toLowerCase() === 'host'
        ? 'paw.test'
        : headers[name.toLowerCase()];
    }
  };
}

describe('P36 security boundaries', () => {
  test.each([
    { origin: undefined, token: 'csrf' },
    { origin: 'https://evil.example', token: 'csrf' },
    { origin: 'https://paw.test', token: undefined }
  ])(
    'rejects a CSRF request outside the same-origin contract (%j)',
    async (input) => {
      const next = jest.fn();
      const middleware = requireCsrf({ verifyCsrf: jest.fn(async () => true) });
      await expect(
        middleware(requestFor(input), {}, next)
      ).rejects.toMatchObject({
        status: 403,
        code: 'CSRF_REJECTED'
      });
      expect(next).not.toHaveBeenCalled();
    }
  );

  test('requires a valid same-origin token and passes only the frozen actor', async () => {
    const verifyCsrf = jest.fn(
      async (actor, token) => actor === activeCustomer && token === 'csrf'
    );
    const next = jest.fn();
    const middleware = requireCsrf({ verifyCsrf });
    await middleware(
      requestFor({ origin: 'https://paw.test', token: 'csrf' }),
      {},
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(verifyCsrf).toHaveBeenCalledWith(activeCustomer, 'csrf');
  });

  test.each([
    { state: 'LOCKED' },
    { expiresAt: Date.parse('2026-10-14T23:59:59.000Z') },
    { roles: ['UNKNOWN'] },
    { synthetic: true }
  ])('rejects invalid session assertions (%j)', async (patch) => {
    const next = jest.fn();
    const session = { ...activeCustomer, ...patch };
    const middleware = requireSession(
      { authenticate: async () => session },
      {
        clock: () => Date.parse('2026-10-15T04:00:00.000Z')
      }
    );
    await expect(middleware({}, {}, next)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED'
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('P36 bounded dispatch projection', () => {
  const request = {
    serviceId: 'DOG_WALK',
    areaCode: 'DISTRICT_Q1',
    localDate: '2026-10-20',
    startAt: '2026-10-20T02:00:00.000Z',
    endAt: '2026-10-20T03:00:00.000Z'
  };

  test('keeps the supported 100-candidate result bounded and strips private fields', () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      sitterId: `sitter-${String(index).padStart(3, '0')}`,
      approved: true,
      active: true,
      services: ['DOG_WALK'],
      workAreas: ['DISTRICT_Q1'],
      available: true,
      dayOffDates: [],
      conflicts: [],
      activeWorkload: index,
      distanceKm: index / 10,
      rating: 4,
      ratingCount: 10,
      privatePhone: 'must-not-cross-the-service-boundary'
    }));

    const result = rankEligibleCandidates({ request, candidates, limit: 10 });
    expect(result.selected).toHaveLength(10);
    expect(result.eligibleCount).toBe(100);
    expect(result.excluded).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('privatePhone');
    expect(
      result.selected.every((item) =>
        Object.keys(item).every(
          (key) => !/private|phone|email|address/i.test(key)
        )
      )
    ).toBe(true);
    expect(() =>
      rankEligibleCandidates({
        request,
        candidates: [...candidates, ...candidates],
        limit: 10
      })
    ).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', status: 422 })
    );
  });
});
