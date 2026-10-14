import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { seedDevelopmentAdmin } from '../../src/services/admin-seed.service.js';

let connection;
try {
  const config = loadConfig();
  // Refuse unsafe seeds before attempting a database connection.
  if (config.nodeEnv !== 'development' || !config.allowDevAdminSeed || !config.database.endsWith('_dev')) throw new Error('Seed disabled');
  connection = await connectDatabase(config);
  await seedDevelopmentAdmin(connection, config);
  console.log(JSON.stringify({ event: 'synthetic_admin_seeded', state: 'LOCKED' }));
} catch {
  console.error(JSON.stringify({ event: 'seed_failed', code: 'SEED_UNAVAILABLE_OR_FORBIDDEN' }));
  process.exitCode = 1;
} finally { if (connection) await connection.close(); }
