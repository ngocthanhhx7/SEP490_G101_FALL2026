import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';

if (!process.argv.includes('--apply')) console.log('DRY_RUN: employee scheduling collections and additive indexes; no employees, contracts, assignments or credentials');
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config);
    await provisionEmployeeScheduling(connection);
    console.log('APPLIED: employee scheduling storage');
  } catch { console.error('Scheduling provisioning failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
