import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { HANOI_DEMO_KEY } from '../../src/constants/hanoi-demo-population.js';
import { hanoiDemoSummary, provisionHanoiDemo } from '../../src/services/hanoi-demo-population.service.js';

let connection;
try {
  if (!process.argv.includes('--apply')) console.log(JSON.stringify({ state: 'DRY_RUN', ...hanoiDemoSummary() }));
  else {
    const config = loadConfig();
    if (process.env.CONFIRMED_DEMO_KEY !== HANOI_DEMO_KEY || process.env.CONFIRMED_DEMO_DATABASE !== config.database) throw new Error('TARGET_CONFIRMATION_REQUIRED');
    connection = await connectDatabase(config);
    console.log(JSON.stringify(await provisionHanoiDemo({ connection, auth: config.auth })));
  }
} catch {
  console.error('Demo provisioning stopped; check reviewed source, backup, target confirmation, catalog and model validation.');
  process.exitCode = 1;
} finally { await connection?.close(); }
