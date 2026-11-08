import { readFile, writeFile, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { inspectEmptyAccrualQueue, retireEmptyAccrualQueue } from '../../src/services/empty-accrual-queue-retirement.service.js';

let connection;
try {
  const args = process.argv.slice(2), mode = args[0], path = process.env.EMPTY_ACCRUAL_QUEUE_MANIFEST;
  if (args.length > 1 || (mode && !['--apply', '--restore'].includes(mode)) || !path) throw new Error('QUEUE_ARGUMENTS_INVALID');
  const config = loadConfig();
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false,
    autoIndex: false, bufferCommands: false, maxPoolSize: 1, serverSelectionTimeoutMS: 5000 }).asPromise();
  createApp({ config, connection, env: process.env, lifecycle: { draining: false } });
  if (!mode) {
    const result = await inspectEmptyAccrualQueue(connection, { env: process.env });
    if (result.manifest) await writeFile(path, JSON.stringify(result.manifest), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: result.state, digest: result.digest, documents: 0, indexes: result.indexes ?? 0 }));
  } else {
    const manifest = JSON.parse(await readFile(path, 'utf8')), output = `${path}.${mode.slice(2)}.journal`;
    await writeFile(output, '{}', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(await retireEmptyAccrualQueue({ connection, env: process.env, manifest,
      database: process.env.CONFIRMED_EMPTY_ACCRUAL_QUEUE_DATABASE, expectedDigest: process.env.CONFIRMED_EMPTY_ACCRUAL_QUEUE_DIGEST,
      confirmation: process.env.CONFIRMED_EMPTY_ACCRUAL_QUEUE_SCOPE, writersFrozen: process.env.CONFIRMED_EMPTY_ACCRUAL_QUEUE_WRITERS_FROZEN === 'true',
      restore: mode === '--restore', checkpoint: async value => {
        const temporary = `${output}.${process.pid}.next`, handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, output);
        if (process.platform !== 'win32') { const directory = await open(dirname(output), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
      } })));
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^QUEUE_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'QUEUE_OPERATION_FAILED',
    recovery: 'Retain manifest/journal and reconcile current metadata; never overwrite new data' }));
  process.exitCode = 1;
} finally { await connection?.close(); }
