import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { demoCatalogKey, demoServiceCatalog } from '../../src/constants/demo-service-catalog.js';

let connection;
try {
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ state: 'DRY_RUN', key: demoCatalogKey, services: demoServiceCatalog.length }));
  } else {
    const config = loadConfig();
    if (process.env.CONFIRMED_CATALOG_KEY !== demoCatalogKey || process.env.CONFIRMED_CATALOG_DATABASE !== config.database) {
      throw new Error('Explicit catalog and target database confirmation required');
    }
    connection = await connectDatabase(config);
    console.log(JSON.stringify(await provisionDemoCatalog({ connection })));
  }
} catch {
  console.error('Catalog provisioning stopped; verify reviewed release, backup and explicit target confirmation');
  process.exitCode = 1;
} finally { await connection?.close(); }
