import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { inspectReverseReferenceCatalog, reverseReferenceCatalog } from '../../src/services/reference-catalog-migration.service.js';
import { applyReferenceCatalog, inspectReferenceCatalog } from '../../src/services/reference-catalog-migration.service.js';

export async function runReferenceCatalogMigration(db, argv = []) {
  const allowed = ['--apply', '--reverse', '--checkpoint=', '--write-checkpoint=', '--expected-checkpoint-digest=', '--writers-frozen', '--expected-digest=', '--max-docs=', '--max-bytes=', '--batch-size=', '--max-time-ms='];
  if (argv.some(arg => !allowed.some(flag => flag.endsWith('=') ? arg.startsWith(flag) : arg === flag))) throw new Error('UNKNOWN_ARGUMENT');
  const keys = argv.map(arg => arg.split('=')[0]);
  if (new Set(keys).size !== keys.length) throw new Error('DUPLICATE_ARGUMENT');
  const value = flag => argv.find(arg => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const options = {};
  for (const [flag, field] of [['--max-docs', 'maxDocs'], ['--max-bytes', 'maxBytes'], ['--batch-size', 'batchSize'], ['--max-time-ms', 'maxTimeMS']]) {
    if (value(flag) !== undefined) options[field] = Number(value(flag));
  }
  if (argv.includes('--reverse')) {
    if (!value('--checkpoint') || value('--write-checkpoint')) throw new Error('REVERSE_CHECKPOINT_REQUIRED');
    if ((await stat(value('--checkpoint'))).size > 8 * 1024 * 1024) throw new Error('CHECKPOINT_FILE_LIMIT');
    options.checkpoint = JSON.parse(await readFile(value('--checkpoint'), 'utf8'));
    options.expectedCheckpointDigest = value('--expected-checkpoint-digest');
    if (!argv.includes('--apply')) return (await inspectReverseReferenceCatalog(db, options)).summary;
    return reverseReferenceCatalog(db, { ...options, writersFrozen: argv.includes('--writers-frozen'), expectedDigest: value('--expected-digest') });
  }
  if (!argv.includes('--apply')) {
    const result = await inspectReferenceCatalog(db, options);
    if (value('--write-checkpoint')) {
      if (result.summary.blocked || !argv.includes('--writers-frozen')) throw new Error('CHECKPOINT_FREEZE_REQUIRED');
      await writeFile(value('--write-checkpoint'), JSON.stringify(result.checkpoint), { flag: 'wx', mode: 0o600 });
    }
    return { ...result.summary, checkpointDigest: result.checkpoint.digest };
  }
  if (value('--write-checkpoint')) throw new Error('CHECKPOINT_DRY_RUN_ONLY');
  return applyReferenceCatalog(db, { ...options, writersFrozen: argv.includes('--writers-frozen'), expectedDigest: value('--expected-digest') });
}

async function main() {
  // No dotenv auto-loading or production default. Operator supplies explicit target.
  const config = loadConfig();
  const connection = await mongoose.createConnection(config.mongoUri, {
    dbName: config.database, maxPoolSize: 2, serverSelectionTimeoutMS: config.connectTimeoutMs,
    autoCreate: false, autoIndex: false
  }).asPromise();
  try {
    const result = await runReferenceCatalogMigration(connection.db, process.argv.slice(2));
    console.log(JSON.stringify(result));
    if (result.blocked) process.exitCode = 2;
  } finally { await connection.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('REFERENCE_CATALOG_MIGRATION_FAILED; inspect aggregate dry-run and operator logs'); process.exitCode = 1; });
}
