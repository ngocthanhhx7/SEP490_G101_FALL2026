import { instant } from '../../src/validators/pet-care.validator.js';
import { test, expect } from '@jest/globals';
import { calculateQuote } from '../../src/services/pricing/pricing-calculation.service.js';
import { scoreSitter } from '../../src/services/sitter-matching/scoring.service.js';
import {
  planInsertion,
  validateSlot
} from '../../src/services/sitter-matching/scheduling.service.js';
import {
  createRoutingProvider,
  edgeKey
} from '../../src/services/sitter-matching/routing.service.js';
const policy = {
  version: 1,
  unitMinutes: 30,
  maxPets: 4,
  extraPetBps: 5000,
  maxSurchargeBps: 20000,
  orderStepVnd: 5000000,
  orderStepBps: 200,
  maxOrderTierBps: 2000,
  rules: []
};
const pet = {
  _id: 'pet',
  species: 'DOG',
  breedCode: 'dog-poodle',
  weightKg: 12,
  traits: []
};
const price = (amount, extra = {}) =>
  calculateQuote({
    baseAmountVnd: amount,
    priceVersion: 1,
    policy,
    pets: [pet],
    durationMinutes: 30,
    ...extra
  });
test.each([
  [4999999, 0],
  [5000000, 100000],
  [10000000, 400000]
])('order tier charges the subtotal once for %i', (amount, surcharge) => {
  const q = price(amount);
  expect(q.totalVnd).toBe(amount + surcharge);
  expect(q.lines.at(-1).basisVnd).toBe(amount);
});
test('breed/trait/weight conditions are explicit, additive, and explained', () => {
  const rules = [
    {
      code: 'breed',
      label: 'Breed work',
      explanation: 'Configured verified work scope',
      scope: 'PET',
      bps: 1000,
      flatVnd: 0,
      when: { breedCodes: ['dog-poodle'] }
    },
    {
      code: 'weight',
      label: 'Handling',
      explanation: 'Handling effort',
      scope: 'VISIT',
      bps: 500,
      flatVnd: 0,
      when: { minWeightKg: 10, maxWeightKg: 20 }
    }
  ];
  const q = price(100000, { policy: { ...policy, rules } });
  expect(q.totalVnd).toBe(115000);
  expect(q.lines.map((x) => x.code)).toEqual([
    'BASE',
    'breed',
    'weight',
    'ORDER_VALUE_TIER'
  ]);
});
test('duration and multiple pets preserve unit/basis accounting', () => {
  const q = price(80000, {
    durationMinutes: 31,
    visitCount: 2,
    pets: [pet, { ...pet, _id: 'p2' }]
  });
  expect(q.totalVnd).toBe(480000);
  expect(q.paymentMode).toBe('PREPAY');
});
test('rejects overlapping exclusive rules, cap overflow, negative and unsafe money', () => {
  const rule = {
    code: 'a',
    label: 'A',
    explanation: 'A',
    scope: 'PET',
    bps: 1000,
    flatVnd: 0,
    exclusiveGroup: 'size',
    when: {}
  };
  expect(() =>
    price(80000, {
      policy: { ...policy, rules: [rule, { ...rule, code: 'b' }] }
    })
  ).toThrow('Overlapping');
  expect(() => price(60000000)).toThrow('Order tier');
  expect(() => price(-1)).toThrow();
  expect(() =>
    price(Number.MAX_SAFE_INTEGER, { durationMinutes: 60 })
  ).toThrow();
});
test('scores the documented example and exposes a reason for all five dimensions', () => {
  const result = scoreSitter({
    stats: {
      similarVisits: 16,
      ratingSum: 47,
      ratingCount: 10,
      completed: 40,
      faults: 1,
      onTime: 36,
      late: 4
    },
    historyCounts: [3],
    extraTravelMinutes: 15,
    busyMinutes: 240
  });
  expect(result.score).toBe(77.9);
  expect(result.breakdown).toHaveLength(5);
  expect(result.rating).toBe(4.7);
});
test('new sitters have no fabricated public rating and invalid statistics are rejected', () => {
  const stats = {
    similarVisits: 0,
    ratingSum: 0,
    ratingCount: 0,
    completed: 0,
    faults: 0,
    onTime: 0,
    late: 0
  };
  expect(
    scoreSitter({
      stats,
      historyCounts: [0],
      extraTravelMinutes: 0,
      busyMinutes: 60
    }).rating
  ).toBeNull();
  expect(() =>
    scoreSitter({
      stats: { ...stats, ratingSum: 6, ratingCount: 1 },
      historyCounts: [0],
      extraTravelMinutes: 0,
      busyMinutes: 60
    })
  ).toThrow();
});
const day = '2026-11-01',
  start = Date.parse(day + 'T10:10:00+07:00'),
  end = start + 30 * 60000;
const profile = {
  windows: [{ weekday: 0, startMinute: 480, endMinute: 1080 }],
  dayOffDates: [],
  starts: [
    {
      localDate: day,
      point: { coordinates: [0, 0] },
      availableFrom: day + 'T08:00:00+07:00',
      availableUntil: day + 'T18:00:00+07:00'
    }
  ]
};
const blocks = [
  {
    _id: 'a',
    startAt: day + 'T09:00:00+07:00',
    endAt: day + 'T09:30:00+07:00',
    point: { coordinates: [1, 1] },
    kind: 'VISIT'
  },
  {
    _id: 'c',
    startAt: day + 'T11:15:00+07:00',
    endAt: day + 'T11:45:00+07:00',
    point: { coordinates: [3, 3] },
    kind: 'VISIT'
  }
];
const matrix = (a, b) =>
  JSON.stringify(a) === JSON.stringify(b)
    ? 0
    : a[0] === 1 && b[0] === 2
      ? 15
      : 10;
test('checks both neighboring visits including handover and road buffer', async () => {
  const args = {
    profile,
    blocks,
    slot: { start, end, localDate: day },
    address: { point: { coordinates: [2, 2] } },
    matrix
  };
  expect(await planInsertion(args)).toMatchObject({
    eligible: true,
    beforeVisitId: 'a',
    afterVisitId: 'c'
  });
  expect(
    await planInsertion({
      ...args,
      slot: { start: start - 600000, end: end - 600000, localDate: day }
    })
  ).toMatchObject({ eligible: false, reason: 'TRAVEL_TIME_CONFLICT' });
  expect(await planInsertion({ ...args, matrix: () => null })).toMatchObject({
    eligible: false,
    reason: 'ROUTE_UNAVAILABLE'
  });
});
test('refuses days off, conflicts and slots without the 24h booking lead', async () => {
  expect(() =>
    validateSlot(
      { startAt: day + 'T10:00:00+07:00', endAt: day + 'T10:30:00+07:00' },
      start
    )
  ).toThrow();
  expect(
    await planInsertion({
      profile: { ...profile, dayOffDates: [day] },
      blocks,
      slot: { start, end, localDate: day },
      address: { point: { coordinates: [2, 2] } },
      matrix
    })
  ).toMatchObject({ reason: 'DAY_OFF' });
});
test('OSRM seconds are converted to minutes; null routes remain unreachable', async () => {
  const provider = createRoutingProvider({
    baseUrl: 'http://127.0.0.1:5000',
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        code: 'Ok',
        durations: [
          [0, 600],
          [null, 0]
        ]
      })
    })
  });
  const { map } = await provider.matrix([
    [105, 21],
    [106, 22]
  ]);
  expect(map.get(edgeKey([105, 21], [106, 22]))).toBe(10);
  expect(map.get(edgeKey([106, 22], [105, 21]))).toBeNull();
});

test('vet escort PER_VISIT keeps the per-visit base price despite a longer routing budget', () => {
  const result = price(150000, {
    durationMinutes: 180,
    policy: { ...policy, billingMode: 'PER_VISIT', unitMinutes: 60 }
  });
  expect(result.totalVnd).toBe(150000);
  expect(result.durationUnits).toBe(1);
});
test('routing outage never fabricates a distance or accepts cloud HTTP/credentials', async () => {
  await expect(
    createRoutingProvider({}).matrix([[105, 21]])
  ).rejects.toMatchObject({ code: 'ROUTING_UNAVAILABLE' });
  expect(() =>
    createRoutingProvider({ baseUrl: 'http://public.example.com' })
  ).toThrow();
  expect(() =>
    createRoutingProvider({ baseUrl: 'https://user:pass@example.com' })
  ).toThrow();
});

test.each([
  '2026-02-30T10:00:00Z',
  '2026-02-29T10:00:00+07:00',
  '2026-04-31T10:00:00Z'
])(
  'rejects impossible calendar instant %s before parser normalization',
  (value) => {
    expect(() => instant(value)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    );
  }
);
test('permits a real leap day with timezone offset', () => {
  expect(instant('2028-02-29T10:00:00+07:00')).toBe(
    Date.parse('2028-02-29T03:00:00Z')
  );
});
