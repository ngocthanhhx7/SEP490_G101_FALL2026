import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { migrateCatalogAudits, finalizeCatalogAuditStorage, restoreCatalogAuditStores } from '../../src/services/catalog-audit-migration.service.js';

let connection;
try {
  const config = loadConfig(), apply = process.argv.includes('--apply');
  const phase = process.argv.find(value => value.startsWith('--phase='))?.slice(8) ?? 'copy';
  if (!['copy', 'cleanup', 'restore'].includes(phase)) throw new Error('Invalid catalog audit phase');
  if (apply && (process.env.CONFIRMED_CATALOG_AUDIT_DATABASE !== config.database
    || !/^[a-f0-9]{64}$/.test(process.env.CONFIRMED_CATALOG_AUDIT_DIGEST ?? '')
    || phase !== 'copy' && process.env.CONFIRMED_CATALOG_AUDIT_CLEANUP !== 'source-copies-only')) {
    throw new Error('Explicit database/digest/cleanup confirmation required');
  }
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database,
    autoCreate: false, autoIndex: false, maxPoolSize: 2, serverSelectionTimeoutMS: 10000 }).asPromise();
  const options = { connection, apply, expectedDigest: process.env.CONFIRMED_CATALOG_AUDIT_DIGEST,
    writersDrained: process.env.CONFIRMED_CATALOG_WRITERS_DRAINED === 'true' };
  const operation = phase === 'copy' ? migrateCatalogAudits : phase === 'cleanup' ? finalizeCatalogAuditStorage : restoreCatalogAuditStores;
  console.log(JSON.stringify(await operation(options)));
} catch {
  console.error('Catalog provenance migration stopped; inspect aggregate dry-run, reviewed source, backup/restore and writer-drain gates');
  process.exitCode = 1;
} finally { await connection?.close(); }
