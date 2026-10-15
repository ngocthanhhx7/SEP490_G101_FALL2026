import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { initialServiceCatalog } from '../../src/constants/initial-service-catalog.js';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
import { provisionServiceDetails } from '../../src/services/service-details-provisioning.service.js';
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', services: initialServiceCatalog.map(({ code, name, amountVnd, unitLabel }) => ({ code, name, amountVnd, unitLabel })) }));
} else {
  let connection;
  try {
    const config = loadConfig(); connection = await connectDatabase(config);
    const catalog = await provisionInitialCatalog({ config, connection });
    const details = await provisionServiceDetails(connection);
    console.log(JSON.stringify({ catalog, details }));
  } catch { console.error('Catalog provisioning failed; raw database details omitted'); process.exitCode = 1; }
  finally { await connection?.close(); }
}
