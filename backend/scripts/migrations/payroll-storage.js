import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { payrollModels } from '../../src/models/payroll.model.js';
if (!process.argv.includes('--apply')) console.log('DRY_RUN: additive employee payroll collections/indexes; no employee or contract fixtures');
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production') throw new Error('Reviewed rollout required');
    connection = await connectDatabase(config);
    for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
    console.log('APPLIED: employee payroll storage');
  } catch { console.error('Payroll provisioning failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
