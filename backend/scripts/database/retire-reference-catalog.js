import { readFile, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { inspectReferenceCatalogRetirement, retireReferenceCatalog, restoreReferenceCatalog,
  encodeReferenceCatalogManifest, decodeReferenceCatalogManifest } from '../../src/services/reference-catalog-retirement.service.js';

let connection;
try {
  const args = process.argv.slice(2), mode = args[0], config = loadConfig(), file = process.env.REFERENCE_CATALOG_RETIRE_MANIFEST;
  if (args.length > 1 || args.some(arg => !['--apply', '--restore'].includes(arg)) || !file) throw new Error('CATALOG_OPERATOR_SCOPE');
  if (mode && process.env.CONFIRMED_REFERENCE_CATALOG_DATABASE !== config.database) throw new Error('CATALOG_OPERATOR_SCOPE');
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false, autoIndex: false,
    maxPoolSize: 1, serverSelectionTimeoutMS: 10000 }).asPromise();
  if (!mode) {
    const result = await inspectReferenceCatalogRetirement(connection.db);
    await writeFile(file, encodeReferenceCatalogManifest(result.manifest), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: 'DRY_RUN', digest: result.digest, collections: result.collections, documents: result.documents, indexes: result.indexes }));
  } else {
    const raw = await readFile(file, 'utf8');
    if (Buffer.byteLength(raw) > 20 * 1024 * 1024) throw new Error('CATALOG_MANIFEST_LIMIT');
    const operation = mode === '--restore' ? restoreReferenceCatalog : retireReferenceCatalog;
    console.log(JSON.stringify(await operation({ db: connection.db, manifest: decodeReferenceCatalogManifest(raw),
      expectedDigest: process.env.CONFIRMED_REFERENCE_CATALOG_DIGEST, writersFrozen: process.env.CONFIRMED_REFERENCE_CATALOG_WRITERS_FROZEN === 'true' })));
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^CATALOG_[A-Z_]+$/.test(error.message) ? error.message : 'CATALOG_RETIRE_FAILED', completed: error.completed ?? [] }));
  process.exitCode = 1;
} finally { await connection?.close(); }
