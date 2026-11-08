import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { referenceCatalogCliSource } from '../../src/models/reference-catalog-source.js';
import { createApp } from '../../src/app.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';
import { assertRawOperationalValidation } from '../../src/services/raw-operational-validation.service.js';

let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config, { referenceCatalog: referenceCatalogCliSource() });
  createApp({ config, connection, lifecycle: { draining: false } });
  const result = await provisionDeploymentStorage({ connection, env: process.env });
  if (process.env.FINANCE_SOURCES_ENABLED === 'true') await assertRawOperationalValidation(connection.db);
  console.log(JSON.stringify(result));
} catch {
  console.error('Required storage contracts unavailable; deployment must stop');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
