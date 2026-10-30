import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { applyLeashHandlingDecision } from '../../src/services/pricing/leash-handling-policy.service.js';

let connection;
try {
  const config = loadConfig(), args = process.argv.slice(2), apply = args.includes('--apply');
  const index = args.indexOf('--database');
  if (apply && (index < 0 || args[index + 1] !== config.database)) throw new Error('Explicit matching database name required');
  connection = await connectDatabase(config);
  console.log(JSON.stringify(await applyLeashHandlingDecision({ connection, apply })));
} catch (error) {
  console.error(JSON.stringify({ state: 'FAILED', code: error.code ?? 'MIGRATION_FAILED' }));
  process.exitCode = 1;
} finally { await connection?.close(); }
