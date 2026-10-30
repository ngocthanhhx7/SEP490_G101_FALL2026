import { expect, test } from '@jest/globals';
import { generateScenarios } from '../../scripts/ai/generate-grounded-scenarios.js';

test('grounded scenario export preserves unavailable routes and never creates satisfaction labels', async () => {
  const snapshot = {
    kind: 'PWC_PUBLIC_OSRM_SAMPLE_V1', source: 'OSRM_STATIC_ROAD_ETA',
    observedAt: '2025-01-01T00:00:00Z', graphSha256: 'a'.repeat(64), osmSha256: 'b'.repeat(64),
    profile: 'OSRM_CAR_V2610', bounds: [105.15, 20.45, 106.15, 21.55],
    points: [[105.8, 21], [105.81, 21], [105.82, 21]],
    durations: [[0, 120, null], [240, 0, 180], [null, 300, 0]],
    distances: [[0, 500, null], [600, 0, 700], [null, 800, 0]],
    snappingDistances: [0, 0, 0], groundTruthTravelTimes: false, customerData: false,
    attribution: 'Synthetic regression fixture; not a collected road dataset', purpose: 'Isolated test only'
  };
  const rows = [];
  const summary = await generateScenarios(snapshot, '2026-11-03', row => rows.push(row), Date.parse('2026-10-30T00:00:00Z'));
  expect(rows).toHaveLength(108);
  expect(new Set(rows.map(row => row.scenarioId)).size).toBe(rows.length);
  expect(summary.rejected.ROUTE_UNAVAILABLE).toBeGreaterThan(0);
  expect(summary.rejected.VISIT_CONFLICT).toBe(9);
  expect(summary.verifiedSatisfactionLabels).toBe(0);
  expect(rows.every(row => row.verified === false && row.observedCustomerRating === null && row.rankTrainingEligible === false)).toBe(true);
  expect(rows.filter(row => row.features).every(row => row.features.fit === 0 && row.confidence === 'LIMITED_HISTORY')).toBe(true);
  expect(rows.find(row => row.originPointIndex === 0 && row.destinationPointIndex === 2 && row.pattern === 'EMPTY').plan.reason).toBe('ROUTE_UNAVAILABLE');
});
