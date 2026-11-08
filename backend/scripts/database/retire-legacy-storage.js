import { readFile, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { inspectLegacyStorage, retireLegacyStorage } from '../../src/services/legacy-storage-retirement.service.js';

let connection;
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(value => !['--apply', '--restore'].includes(value))) throw new Error('Invalid arguments');
  const config = loadConfig(), mode = args[0], file = process.env.LEGACY_STORAGE_MANIFEST;
  if (!file || (mode && process.env.CONFIRMED_LEGACY_STORAGE_DATABASE !== config.database)) throw new Error('Explicit scope required');
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false,
    autoIndex: false, maxPoolSize: 1, serverSelectionTimeoutMS: 10000 }).asPromise();
  if (!mode) {
    const result = await inspectLegacyStorage(connection);
    await writeFile(file, JSON.stringify(result.manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: result.state, digest: result.digest, collections: result.collections, indexes: result.indexes }));
  } else {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    console.log(JSON.stringify(await retireLegacyStorage({ connection, manifest,
      expectedDigest: process.env.CONFIRMED_LEGACY_STORAGE_DIGEST,
      writersFrozen: process.env.CONFIRMED_LEGACY_WRITERS_FROZEN === 'true', restore: mode === '--restore' })));
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^RETIRE_[A-Z_]+$/.test(error.code ?? '') ? error.code : 'RETIRE_FAILED', completed: error.completed ?? [], inProgress: error.inProgress }));
  process.exitCode = 1;
} finally { await connection?.close(); }
