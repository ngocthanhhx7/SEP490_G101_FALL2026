import { scoreSitter } from './scoring.service.js';

const model = Object.freeze({
  version: 'sitter-demo-2026-11-20-v1',
  source: 'SIMULATION_ONLY',
  datasetSha256: '1b596c4023455487171edd25134ac3d2b29edf7020f4db4877d643bc35c39f51',
  trainingRows: 372,
  testRows: 93,
  testMae: 25.633207721323366,
  trainingBaselineMae: 28.585433571300463,
  constantMae: 24.193548387096776,
  weights: Object.freeze({
    fit: 22.797719045110995,
    travel: 0,
    quality: 38.72767900431444,
    reliability: 31.467977274203893,
    workload: 7.006624676370671
  })
});

const commonStats = { ratingSum: 46, ratingCount: 10, completed: 20, faults: 1, onTime: 18, late: 2 };
const candidates = [
  { id: 'A', stats: { ...commonStats, similarVisits: 10 }, historyCounts: [2], extraTravelMinutes: 50, busyMinutes: 220 },
  { id: 'B', stats: { ...commonStats, similarVisits: 4 }, historyCounts: [1], extraTravelMinutes: 3, busyMinutes: 225 }
];

const rank = weights => candidates
  .map(({ id, ...input }) => ({ id, ...scoreSitter({ ...input, weights }) }))
  .sort((a, b) => b.rawScore - a.rawScore || a.id.localeCompare(b.id))
  .map(({ id, score }, index) => ({ id, score, rank: index + 1 }));

export function createSitterModelDemo({ repository }) {
  return async () => {
    const { policy } = await repository.ranking();
    return {
      model,
      baseline: { policyVersion: policy.version, weights: policy.weights, candidates: rank(policy.weights) },
      candidates: rank(model.weights)
    };
  };
}
