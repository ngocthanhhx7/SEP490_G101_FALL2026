import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { buildStorageContractManifest, inspectStorageContracts } from '../../src/services/storage-contract-inspection.service.js';

let connection;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !/^--catalog-provenance=(required|optional|unasserted)$/.test(arg))) throw new Error('INVALID_ARGUMENTS');
  const catalogProvenance = args[0]?.split('=')[1] ?? 'unasserted';
  const config = loadConfig();
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database,
    autoCreate: false, autoIndex: false, bufferCommands: false, maxPoolSize: 2,
    serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 }).asPromise();
  connection.on('error', () => {});
  // Compose the selected runtime models, without listening or starting jobs.
  createApp({ config, connection, env: process.env, lifecycle: { draining: false } });
  const manifest = buildStorageContractManifest({ connection, env: process.env, catalogProvenance });
  const report = await inspectStorageContracts({ db: connection.db, manifest });
  console.log(JSON.stringify({ at: new Date().toISOString(), ...report }));
  if (report.critical.length) process.exitCode = 1;
} catch {
  // Driver messages, URIs, document values and arbitrary errors are never logged.
  console.error('Storage metadata inspection unavailable; no changes applied');
  process.exitCode = 1;
} finally { await connection?.close(); }
