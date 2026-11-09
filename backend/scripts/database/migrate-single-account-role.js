import { open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { inspectSingleAccountRoles, migrateSingleAccountRoles, restoreSingleAccountRoleValidator,
  SINGLE_ACCOUNT_ROLE_CONTRACT } from '../../src/services/single-account-role.service.js';

let connection;
try {
  const args = process.argv.slice(2), mode = args[0], path = process.env.SINGLE_ACCOUNT_ROLE_MANIFEST;
  if (args.length > 1 || (mode && !['--apply', '--restore-validator'].includes(mode)) || !path) throw new Error('ROLE_ARGUMENTS_INVALID');
  const config = loadConfig();
  connection = await mongoose.createConnection(config.mongoUri, { dbName: config.database, autoCreate: false, autoIndex: false,
    bufferCommands: false, maxPoolSize: 2, serverSelectionTimeoutMS: 5000 }).asPromise();
  if (!mode) {
    const plan = await inspectSingleAccountRoles(connection.db);
    await writeFile(path, JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ state: 'DRY_RUN', digest: plan.digest, documents: plan.documents,
      changedUsers: plan.targets.length, blockedUsers: plan.blocked.length, foreignValidator: plan.foreignValidator,
      readyForApply: plan.readyForApply, totals: plan.totals }));
  } else {
    const plan = JSON.parse(await readFile(path, 'utf8')), output = `${path}.${mode.slice(2)}.journal`;
    await writeFile(output, '{}', { flag: 'wx', mode: 0o600 });
    const input = { database: process.env.CONFIRMED_SINGLE_ROLE_DATABASE,
      contract: process.env.CONFIRMED_SINGLE_ROLE_CONTRACT, digest: process.env.CONFIRMED_SINGLE_ROLE_DIGEST,
      writersFrozen: process.env.CONFIRMED_SINGLE_ROLE_WRITERS_FROZEN === 'true', checkpoint: async value => {
        const temporary = `${output}.${process.pid}.next`, handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
        await rename(temporary, output);
        if (process.platform !== 'win32') {
          const directory = await open(dirname(output), 'r'); try { await directory.sync(); } finally { await directory.close(); }
        }
      } };
    if (plan.contract !== SINGLE_ACCOUNT_ROLE_CONTRACT) throw new Error('ROLE_MANIFEST_INVALID');
    if (mode === '--apply' && plan.digest !== input.digest) throw new Error('ROLE_MANIFEST_INVALID');
    console.log(JSON.stringify(mode === '--apply'
      ? await migrateSingleAccountRoles({ connection, ...input })
      : await restoreSingleAccountRoleValidator({ db: connection.db, journal: plan, ...input })));
  }
} catch (error) {
  console.error(JSON.stringify({ state: 'STOPPED', code: /^ROLE_[A-Z_]+$/.test(error.message ?? '') ? error.message : 'ROLE_OPERATION_FAILED',
    recovery: 'Retain private manifest/journal; reconcile current state without restoring old user/session data' }));
  process.exitCode = 1;
} finally { await connection?.close(); }
