import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional backend directory lets the same harness compare two Git checkouts.
// This is an in-process synthetic diagnostic, never a page/booking load test.
const backend = resolve(process.argv[2] ?? '.');
const { createSitterDispatchService } = await import(pathToFileURL(resolve(backend, 'src/services/dispatch.service.js')).href);
const request = { serviceId: 'DOG_WALK', areaCode: 'Q1',
  startAt: '2026-10-20T09:00:00+07:00', endAt: '2026-10-20T10:00:00+07:00' };
const candidates = Array.from({ length: 100 }, (_, i) => ({
  sitterId: `sitter-${String(i).padStart(3, '0')}`, approved: true, active: true,
  services: ['DOG_WALK'], workAreas: ['Q1'], available: true, isDayOff: false,
  hasConflict: false, activeWorkload: i % 5, distanceKm: i % 10
}));

let repositoryCalls = 0, rankerCalls = 0;
const service = createSitterDispatchService({
  listCandidates: async () => { repositoryCalls += 1; return candidates; },
  ranker: async ({ candidates }) => { rankerCalls += 1; return candidates.map(item => item.sitterId).reverse(); }
});
const command = { request, limit: 100 };
for (let i = 0; i < 200; i += 1) await service.suggest(command);
repositoryCalls = 0; rankerCalls = 0;
const durations = [];
for (let i = 0; i < 2000; i += 1) {
  const start = performance.now();
  const result = await service.suggest(command);
  durations.push(performance.now() - start);
  if (result.selected.length !== 100 || result.fallbackUsed) throw new Error('Unexpected benchmark result');
}
durations.sort((a, b) => a - b);
const percentile = fraction => Number(durations[Math.ceil(durations.length * fraction) - 1].toFixed(4));
console.log(JSON.stringify({
  diagnostic: 'SYNTHETIC_DISPATCH_SERVICE_ONLY', node: process.version,
  samples: durations.length, candidates: 100, concurrency: 1,
  p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
  repositoryPortCalls: repositoryCalls, rankerPortCalls: rankerCalls,
  mongoQueryCount: null, pageP95Ms: null, bookingP95Ms: null
}, null, 2));
