import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { migrateServicePresentations } from '../../src/services/service-presentation-migration.service.js';

let connection;
try {
  const config = loadConfig(), apply = process.argv.includes('--apply');
  if (apply && (process.env.CONFIRMED_PRESENTATION_DATABASE !== config.database
    || !/^[a-f0-9]{64}$/.test(process.env.CONFIRMED_PRESENTATION_DIGEST ?? ''))) {
    throw new Error('Explicit database and dry-run digest confirmation required');
  }
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database,
    autoCreate: false, autoIndex: false, maxPoolSize: 2, serverSelectionTimeoutMS: 10000 }).asPromise();
  console.log(JSON.stringify(await migrateServicePresentations({ connection, apply,
    expectedDigest: process.env.CONFIRMED_PRESENTATION_DIGEST })));
} catch {
  console.error('Presentation migration stopped; verify dry-run, reviewed source, provisioning freeze, backup and restore evidence');
  process.exitCode = 1;
} finally { await connection?.close(); }
