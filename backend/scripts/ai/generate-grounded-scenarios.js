// Offline simulation inputs grounded in a captured public-road matrix.
// No DB, invented ratings, training, API calls or production model activation.
import { createHash } from 'node:crypto';
import { readFile, stat, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { groundedRoutingProvider, validateGroundedSnapshot } from '../demo-ai/fixtures.js';
import { planInsertion, validateSlot, SCHEDULE_RULES } from '../../src/services/sitter-matching/scheduling.service.js';
import { scoreSitter, DEFAULT_WEIGHTS } from '../../src/services/sitter-matching/scoring.service.js';
import { edgeKey } from '../../src/services/sitter-matching/routing.service.js';

export async function generateScenarios(input, date, emit, now = Date.now()) {
  const snapshot = validateGroundedSnapshot(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('Supply a future local date');
  const at = minute => Date.parse(`${date}T00:00:00+07:00`) + minute * 60000;
  const sourceHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const { map } = await groundedRoutingProvider(snapshot).matrix(snapshot.points);
  const matrix = (a, b) => map.get(edgeKey(a, b)) ?? null;
  const count = snapshot.points.length;
  const summary = { kind: 'GROUNDED_SCHEDULE_SIMULATION_V1', sourceCanonicalSha256: sourceHash,
    rows: 0, feasible: 0, rejected: {}, scoreThresholdMet: 0, verifiedSatisfactionLabels: 0,
    date, graphSha256: snapshot.graphSha256, policyWeights: DEFAULT_WEIGHTS, scheduleRules: SCHEDULE_RULES,
    limits: 'Feasibility and baseline scores describe simulated schedules, not observed journeys or customer satisfaction. No row is eligible for verified ranker training.' };
  for (let origin = 0; origin < count; origin++) {
    const profile = {
      dayOffDates: [], windows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMinute: 480, endMinute: 1080 })),
      starts: [{ localDate: date, point: { coordinates: snapshot.points[origin] }, availableFrom: new Date(at(480)), availableUntil: new Date(at(1080)) }]
    };
    for (let destination = 0; destination < count; destination++) {
      for (const minute of [540, 600, 840, 1020]) {
        const slot = validateSlot({ startAt: new Date(at(minute)).toISOString(), endAt: new Date(at(minute + 30)).toISOString() }, now);
        for (const pattern of ['EMPTY', 'EXISTING_VISIT', 'MIDDAY_BREAK']) {
          const blocks = pattern === 'EMPTY' ? [] : [{ _id: 'simulated-block',
            startAt: new Date(at(pattern === 'EXISTING_VISIT' ? 600 : 720)),
            endAt: new Date(at(pattern === 'EXISTING_VISIT' ? 630 : 750)),
            point: { coordinates: snapshot.points[(destination + 1) % count] },
            kind: pattern === 'EXISTING_VISIT' ? 'VISIT' : 'BREAK' }];
          const plan = await planInsertion({ profile, blocks, slot, address: { point: { coordinates: snapshot.points[destination] } }, matrix });
          const score = plan.eligible ? scoreSitter({
            stats: { similarVisits: 0, ratingSum: 0, ratingCount: 0, completed: 0, faults: 0, onTime: 0, late: 0 },
            historyCounts: [0], extraTravelMinutes: plan.extraTravelMinutes, busyMinutes: plan.busyMinutes
          }) : null;
          summary.rows++;
          if (plan.eligible) summary.feasible++;
          else summary.rejected[plan.reason] = (summary.rejected[plan.reason] ?? 0) + 1;
          if (score?.rawScore >= 60) summary.scoreThresholdMet++;
          await emit({ kind: summary.kind, scenarioId: `simulation-${origin}-${destination}-${minute}-${pattern}`,
            sourceCanonicalSha256: sourceHash, originPointIndex: origin, destinationPointIndex: destination,
            slotMinute: minute, durationMinutes: 30, pattern, plan,
            features: score?.features ?? null, baselinePolicyScore: score?.score ?? null,
            confidence: score?.confidence ?? null, observedCustomerRating: null, verified: false,
            rankTrainingEligible: false, labelSource: 'NO_CUSTOMER_SATISFACTION_LABEL' });
        }
      }
    }
  }
  return summary;
}

async function main() {
  const [snapshotPath, date, outputPath] = process.argv.slice(2);
  if (!snapshotPath || !date || !outputPath) throw new TypeError('Usage: node generate-grounded-scenarios.js SNAPSHOT LOCAL_DATE NEW_OUTPUT.jsonl');
  if ((await stat(snapshotPath)).size > 1000000) throw new TypeError('Snapshot exceeds limit');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  // Validate the date before reserving output; refuse an overwrite.
  validateSlot({ startAt: `${date}T09:00:00+07:00`, endAt: `${date}T09:30:00+07:00` }, Date.now());
  validateGroundedSnapshot(snapshot);
  const output = await open(outputPath, 'wx');
  try {
    const summary = await generateScenarios(snapshot, date, row => output.writeFile(JSON.stringify(row) + '\n'));
    console.log(JSON.stringify(summary));
  } finally { await output.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('GROUNDED_SCENARIO_EXPORT_FAILED'); process.exitCode = 1; });
}
