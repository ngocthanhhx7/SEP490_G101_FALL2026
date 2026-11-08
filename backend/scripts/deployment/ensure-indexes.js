import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { referenceCatalogCliSource } from '../../src/models/reference-catalog-source.js';
import { createApp } from '../../src/app.js';
import { provisionDeploymentStorage } from '../../src/services/deployment-storage.service.js';

let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config, { referenceCatalog: referenceCatalogCliSource() });
  createApp({ config, connection, lifecycle: { draining: false } });
  console.log(JSON.stringify(await provisionDeploymentStorage({ connection, env: process.env })));
} catch {
  console.error('Required indexes unavailable; deployment must stop');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
