import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { referenceCatalogCliSource } from '../../src/models/reference-catalog-source.js';
import { GROOMING_DEMO_KEY, provisionGroomingDemo } from '../../src/services/grooming/grooming-demo-seed.service.js';

// Demo shop pet sitters for grooming booking. Needs the demo service catalog first (seed:demo-services).
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ state: 'DRY_RUN', key: GROOMING_DEMO_KEY, sitters: 2, shifts: 'every day 08:00-12:00 and 14:00-17:00' }));
} else {
  let connection;
  try {
    const config = loadConfig();
    if (config.nodeEnv === 'production' || !config.database.endsWith('_dev')) throw new Error('Development database required');
    connection = await connectDatabase(config, { referenceCatalog: referenceCatalogCliSource() });
    console.log(JSON.stringify(await provisionGroomingDemo({ connection })));
  } catch {
    console.error('Grooming demo provisioning failed; database details omitted');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
