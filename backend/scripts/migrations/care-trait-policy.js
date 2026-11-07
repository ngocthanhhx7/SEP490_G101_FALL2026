import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { applyCareTraitDecision } from '../../src/services/pricing/care-trait-policy.service.js';
let connection;
try {
  const config = loadConfig(), args = process.argv.slice(2), apply = args.includes('--apply');
  const database = args[args.indexOf('--database') + 1], expectedPlanHash = args[args.indexOf('--expected-plan-hash') + 1];
  if (apply && (!args.includes('--database') || database !== config.database)) throw new Error('Matching database confirmation required');
  connection = await connectDatabase(config);
  console.log(JSON.stringify(await applyCareTraitDecision({ connection, apply, expectedPlanHash })));
} catch (error) {
  console.error(JSON.stringify({ state: 'FAILED', code: error.code ?? 'MIGRATION_FAILED' })); process.exitCode = 1;
} finally { await connection?.close(); }
