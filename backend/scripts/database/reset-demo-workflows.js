import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { resetDemoWorkflows } from '../../src/services/demo-workflow-reset.service.js';

let connection;
try {
  if (process.argv.slice(2).some(value => value !== '--apply')) throw new Error('Unknown argument');
  const config = loadConfig(), apply = process.argv.includes('--apply');
  if (apply && process.env.CONFIRMED_DEMO_RESET_DATABASE !== config.database) throw new Error('Database confirmation required');
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database,
    autoCreate: false, autoIndex: false, maxPoolSize: 1, serverSelectionTimeoutMS: 10000 }).asPromise();
  console.log(JSON.stringify(await resetDemoWorkflows({ connection, apply,
    expectedDigest: process.env.CONFIRMED_DEMO_RESET_DIGEST,
    writersFrozen: process.env.CONFIRMED_DEMO_WRITERS_FROZEN === 'true' })));
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^RESET_[A-Z_]+$/.test(error.code ?? '') ? error.code : 'RESET_FAILED' }));
  process.exitCode = 1;
} finally { await connection?.close(); }
