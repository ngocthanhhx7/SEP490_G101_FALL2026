import { PERFORMANCE_CASES, PERFORMANCE_REQUESTS } from './performance-case-plan.js';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inline] = value.slice(2).split('=', 2);
  args.set(key, inline ?? process.argv[index + 1] ?? 'true');
  if (inline === undefined) index += 1;
}

const baseUrl = String(args.get('base-url') ?? process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/u, '');
const frontendUrl = String(args.get('frontend-url') ?? process.env.PERF_FRONTEND_URL ?? 'http://127.0.0.1:5173').replace(/\/$/u, '');
const requireLocalMongo = args.get('require-local-mongo') === 'true';

function isLocalMongo(uri) {
  try {
    const parsed = new URL(uri);
    return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
      && (parsed.port === '' || parsed.port === '27017' || parsed.port === '27018');
  } catch {
    return false;
  }
}

async function probe(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { url, status: response.status, ok: response.ok, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { url, status: null, ok: false, durationMs: Math.round(performance.now() - started), error: error.code ?? error.name };
  }
}

const probes = await Promise.all([
  probe(`${baseUrl}/health`),
  probe(`${baseUrl}/ready`),
  probe(`${frontendUrl}/`)
]);

const mongoUri = process.env.MONGO_URI ?? '';
const enabledProviders = ['PAYOS_ENABLED', 'EMAIL_ENABLED', 'SMS_ENABLED', 'R2_ENABLED', 'AI_ENABLED']
  .filter(key => process.env[key] === 'true');
const result = {
  state: probes.every(probeResult => probeResult.ok) && (!requireLocalMongo || isLocalMongo(mongoUri)) ? 'READY' : 'BLOCKED',
  probes,
  mongo: {
    database: process.env.MONGO_DB ?? null,
    local: isLocalMongo(mongoUri),
    requiredLocal: requireLocalMongo
  },
  enabledProviders,
  cases: {
    total: PERFORMANCE_CASES.length,
    smokeMapped: Object.keys(PERFORMANCE_REQUESTS).length,
    fixtureRequired: PERFORMANCE_CASES.length - Object.keys(PERFORMANCE_REQUESTS).length
  },
  safety: {
    databaseWrite: 'not performed',
    providerCalls: 'not performed',
    note: 'Use the guarded account/fixture commands only with a local development replica set.'
  }
};

console.log(JSON.stringify(result, null, 2));
if (result.state !== 'READY') process.exitCode = 1;
