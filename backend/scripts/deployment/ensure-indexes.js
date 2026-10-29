import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { createApp } from '../../src/app.js';

let connection;
try {
  const config = loadConfig();
  connection = await connectDatabase(config);
  createApp({ config, connection, lifecycle: { draining: false } });
  for (const model of Object.values(connection.models)) await model.createIndexes();
  console.log(JSON.stringify({ state: 'INDEXES_READY', models: Object.keys(connection.models).length }));
} catch {
  console.error('Required indexes unavailable; deployment must stop');
  process.exitCode = 1;
} finally {
  await connection?.close();
}
