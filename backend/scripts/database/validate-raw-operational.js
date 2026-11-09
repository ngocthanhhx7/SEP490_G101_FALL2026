import { readFile, writeFile, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { RAW_OPERATIONAL_CONTRACT } from '../../src/models/raw-operational.storage.js';
import { inspectRawOperationalValidation, installRawOperationalValidation, restoreRawOperationalValidation } from '../../src/services/raw-operational-validation.service.js';

let connection;
try {
  const flags = process.argv.slice(2), apply = flags.includes('--apply'), restore = flags.includes('--restore');
  if (flags.some(flag => !['--apply', '--restore'].includes(flag) && !/^--manifest=.+$/.test(flag))
    || flags.filter(flag => flag.startsWith('--manifest=')).length > 1 || (apply && restore)) throw new Error('INVALID_ARGUMENTS');
  const path = flags.find(flag => flag.startsWith('--manifest='))?.slice(11);
  if ((apply || restore) && !path) throw new Error('ROLLBACK_MANIFEST_REQUIRED');
  const config = loadConfig();
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false,
    autoIndex: false, bufferCommands: false, maxPoolSize: 1, serverSelectionTimeoutMS: 5000 }).asPromise();
  connection.on('error', () => {});
  const db = connection.db, report = await inspectRawOperationalValidation(db);
  let result;
  if (apply || restore) {
    const previous = restore ? JSON.parse(await readFile(path, 'utf8')) : undefined;
    const output = restore ? `${path}.restore` : path;
    await writeFile(output, '{}', { flag: 'wx', mode: 0o600 });
    const input = { db, database: process.env.CONFIRMED_RAW_VALIDATION_DATABASE,
      contract: process.env.CONFIRMED_RAW_VALIDATION_CONTRACT, digest: process.env.CONFIRMED_RAW_VALIDATION_DIGEST,
      checkpoint: async data => {
        const temporary = `${output}.${process.pid}.next`, handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, output);
        if (process.platform !== 'win32') {
          const directory = await open(dirname(output), 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        }
      } };
    result = restore ? await restoreRawOperationalValidation({ ...input, journal: previous }) : await installRawOperationalValidation(input);
  } else {
    if (path) await writeFile(path, JSON.stringify(report), { flag: 'wx', mode: 0o600 });
    result = { state: 'DRY_RUN', contract: RAW_OPERATIONAL_CONTRACT, digest: report.digest, readyForApply: report.readyForApply,
      collections: report.collections.map(({ name, documents, invalid, compatible, foreignValidator }) => ({ name, documents, invalid, compatible, foreignValidator })) };
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED',
    code: /^RAW_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'RAW_OPERATION_UNAVAILABLE',
    ...(typeof error.code === 'number' ? { databaseCode: error.code } : {}),
    recovery: 'Retain the manifest and reconcile partial progress before retry' }));
  process.exitCode = 1;
} finally { await connection?.close(); }
