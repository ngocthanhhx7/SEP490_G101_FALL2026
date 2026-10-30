import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { demoServiceCatalog } from '../../src/constants/demo-service-catalog.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', services: demoServiceCatalog.map(({ code, name, amountVnd, unitLabel }) => ({ code, name, amountVnd, unitLabel })) }));
} else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config);
    console.log(JSON.stringify(await provisionDemoCatalog({ connection })));
  } catch { console.error('Demo catalog provisioning failed; database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
