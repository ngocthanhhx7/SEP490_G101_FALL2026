import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { provisionSettlementStorage } from '../../src/services/settlements/provisioning.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', operation: 'Add canonical finance source collections and unique indexes; no data import or policy activation' }));
} else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production') throw new Error('Production provisioning is outside this command scope');
    connection = await connectDatabase(config);
    await provisionSettlementStorage(connection);
    await provisionFinanceSources(connection);
    console.log(JSON.stringify({ state: 'FINANCE_SOURCE_STORAGE_PROVISIONED', policyState: 'UNCHANGED' }));
  } catch {
    console.error('Finance source provisioning failed; raw database details omitted'); process.exitCode = 1;
  } finally { await connection?.close(); }
}
