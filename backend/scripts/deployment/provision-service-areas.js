import { readFile } from 'node:fs/promises';
import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { referenceCatalogCliSource } from '../../src/models/reference-catalog-source.js';
import { provisionServiceAreaStorage, seedServiceAreas } from '../../src/services/service-area-provisioning.service.js';
let connection;
try {
  const apply = process.argv.includes('--apply');
  if (process.argv.slice(2).some(value => !['--apply', '--dry-run'].includes(value))) throw new TypeError('Unknown argument');
  const dataset = JSON.parse(await readFile(new URL('../../data/vn-administrative-units-2025.json', import.meta.url), 'utf8'));
  connection = await connectDatabase(loadConfig(), { referenceCatalog: referenceCatalogCliSource() });
  if (apply) await provisionServiceAreaStorage(connection);
  console.log(JSON.stringify(await seedServiceAreas(connection, dataset, { apply })));
} catch { console.error('Area provisioning failed; inspect private diagnostics, no automatic overwrite'); process.exitCode = 1; }
finally { await connection?.close(); }
