import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { payrollModels } from '../../src/models/payroll.model.js';
if (!process.argv.includes('--apply')) console.log('DRY_RUN: employee payroll collections/indexes; replace obsolete all-history period index after active-period index exists; no employee or contract fixtures');
else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config);
    for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
    const statements = payrollModels(connection).PayrollStatement.collection;
    const obsolete = (await statements.listIndexes().toArray()).find(index => index.name === 'employeeId_1_periodStart_1_periodEnd_1');
    if (obsolete) {
      if (!obsolete.unique || obsolete.partialFilterExpression || JSON.stringify(obsolete.key) !== JSON.stringify({ employeeId: 1, periodStart: 1, periodEnd: 1 }))
        throw new Error('Unexpected obsolete period index; manual review required');
      await statements.dropIndex(obsolete.name);
    }
    console.log('APPLIED: employee payroll storage');
  } catch { console.error('Payroll provisioning failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
