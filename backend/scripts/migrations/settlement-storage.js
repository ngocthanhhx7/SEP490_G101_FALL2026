import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', operation: 'Create missing settlement collections and indexes; never drop or rewrite existing records/indexes' }));
} else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production') throw new Error('Production provisioning is outside this command scope');
    connection = await connectDatabase(config);
    await provisionSettlementStorage(connection);
    console.log(JSON.stringify({ state: 'STORAGE_PROVISIONED', policyState: 'UNCHANGED' }));
  } catch {
    console.error('Settlement provisioning failed; raw database details omitted');
    process.exitCode = 1;
  } finally { await connection?.close(); }
}
