import { readFile, writeFile, stat } from 'node:fs/promises';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { inspectPresentationRetirement, retirePresentations, restorePresentations } from '../../src/services/service-presentation-retirement.service.js';
import { inspectCatalogIndexRetirement, retireCatalogIndexes, restoreCatalogIndexes, catalogIndexManifestDigest } from '../../src/services/catalog-index-retirement.service.js';

let connection;
try {
  const args = process.argv.slice(2), scope = args.find(arg => arg.startsWith('--scope='))?.slice(8), apply = args.includes('--apply'), restore = args.includes('--restore');
  if (!['presentations', 'indexes'].includes(scope) || args.filter(arg => arg.startsWith('--scope=')).length !== 1
    || args.length !== new Set(args).size || (apply && restore)
    || args.some(arg => !['--scope=presentations', '--scope=indexes', '--apply', '--restore'].includes(arg))) throw new Error('CATALOG_MAINTENANCE_ARGUMENT');
  const config = loadConfig(), file = process.env.CATALOG_REFINEMENT_MANIFEST;
  if (!file || ((apply || restore) && process.env.CONFIRMED_CATALOG_REFINEMENT_DATABASE !== config.database)) throw new Error('CATALOG_MAINTENANCE_SCOPE');
  const writersFrozen = process.env.CONFIRMED_CATALOG_REFINEMENT_WRITERS_FROZEN === 'true';
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false, autoIndex: false,
    maxPoolSize: 1, serverSelectionTimeoutMS: 10000 }).asPromise();
  if (!apply && !restore) {
    const dry = scope === 'presentations' ? await inspectPresentationRetirement(connection) : await inspectCatalogIndexRetirement(connection.db);
    await writeFile(file, mongoose.mongo.BSON.EJSON.stringify(dry.manifest, { relaxed: false }), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: 'DRY_RUN', scope, digest: dry.digest, documents: dry.documents, indexes: dry.indexes }));
  } else {
    if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error('CATALOG_MAINTENANCE_LIMIT');
    const manifest = mongoose.mongo.BSON.EJSON.parse(await readFile(file, 'utf8'), { relaxed: scope === 'indexes' });
    const expectedDigest = process.env.CONFIRMED_CATALOG_REFINEMENT_DIGEST;
    if (scope === 'indexes' && (manifest.database !== config.database || !writersFrozen
      || catalogIndexManifestDigest(manifest) !== expectedDigest)) throw new Error('CATALOG_MAINTENANCE_SCOPE');
    const result = scope === 'presentations'
      ? await (restore ? restorePresentations : retirePresentations)({ connection, manifest, expectedDigest, writersFrozen })
      : restore ? await restoreCatalogIndexes({ db: connection.db, writersFrozen })
        : await retireCatalogIndexes({ db: connection.db, expectedDigest, writersFrozen });
    console.log(JSON.stringify({ scope, ...result }));
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^(?:CATALOG|PRESENTATION)_[A-Z_]+$/.test(error.message) ? error.message : 'CATALOG_MAINTENANCE_FAILED', completed: error.completed ?? [] }));
  process.exitCode = 1;
} finally { await connection?.close(); }
