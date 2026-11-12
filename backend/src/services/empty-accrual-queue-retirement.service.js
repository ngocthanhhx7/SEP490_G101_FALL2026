import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { storageProfile, assertProfileModels } from '../config/storage-profile.js';

export const EMPTY_ACCRUAL_QUEUE_SCOPE = 'earningaccrualtasks-empty-employee-only';
const name = 'earningaccrualtasks', budget = { maxTimeMS: 5000, timeoutMS: 5000 };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = isDeepStrictEqual;
function profile(connection, env) {
  if (storageProfile(env) !== 'EMPLOYEE') throw new Error('QUEUE_EMPLOYEE_PROFILE_REQUIRED');
  assertProfileModels(connection, 'EMPLOYEE');
}
function metadata(row, database, partial = false) {
  if (row?.name !== name || row.database !== database || !same(row.options, {}) || !Array.isArray(row.indexes)
    || ![...(partial ? [1] : []), 2].includes(row.indexes.length)) throw new Error('QUEUE_METADATA_UNSUPPORTED');
  const expected = { _id_: { _id: 1 }, state_1_nextAttemptAt_1: { state: 1, nextAttemptAt: 1 } };
  if (!row.indexes.some(index => index.name === '_id_')) throw new Error('QUEUE_METADATA_UNSUPPORTED');
  for (const index of row.indexes) if (index.v !== 2 || !expected[index.name]
    || Object.keys(index).some(key => !['v', 'key', 'name'].includes(key))
    || JSON.stringify(index.key) !== JSON.stringify(expected[index.name])) throw new Error('QUEUE_METADATA_UNSUPPORTED');
  if (new Set(row.indexes.map(index => index.name)).size !== row.indexes.length) throw new Error('QUEUE_METADATA_UNSUPPORTED');
  return row;
}
async function inspect(connection, env, partial = false) {
  profile(connection, env);
  const info = await connection.db.listCollections({ name }, { ...budget }).next();
  if (!info) return { state: 'ABSENT', manifest: null, digest: null };
  if (info.type !== 'collection') throw new Error('QUEUE_METADATA_UNSUPPORTED');
  const collection = connection.db.collection(name);
  if (await collection.find({}, { projection: { _id: 1 }, ...budget }).limit(1).hasNext()) throw new Error('QUEUE_NOT_EMPTY');
  const indexes = (await collection.listIndexes(budget).toArray()).sort((a, b) => a.name.localeCompare(b.name));
  const manifest = metadata({ database: connection.name, name, options: info.options ?? {}, indexes }, connection.name, partial);
  return { state: 'DRY_RUN', manifest, digest: hash(manifest), documents: 0, indexes: indexes.length };
}
export const inspectEmptyAccrualQueue = (connection, { env = {} } = {}) => inspect(connection, env);

export async function retireEmptyAccrualQueue({ connection, env = {}, manifest, expectedDigest,
  database, confirmation, writersFrozen = false, restore = false, checkpoint }) {
  profile(connection, env); metadata(manifest, connection.name);
  if (database !== connection.name || confirmation !== EMPTY_ACCRUAL_QUEUE_SCOPE || !writersFrozen
    || typeof checkpoint !== 'function' || !/^[a-f0-9]{64}$/.test(expectedDigest ?? '') || hash(manifest) !== expectedDigest)
    throw new Error('QUEUE_EXPLICIT_SCOPE_REQUIRED');
  const current = await inspect(connection, env, restore);
  if (current.manifest && (!restore ? current.digest !== expectedDigest
    : !same(current.manifest.options, manifest.options) || current.manifest.indexes.some(index => !manifest.indexes.some(expected => same(index, expected)))))
    throw new Error('QUEUE_SOURCE_CHANGED');
  if (!restore && current.state === 'ABSENT') throw new Error('QUEUE_SOURCE_MISSING');
  const journal = { scope: EMPTY_ACCRUAL_QUEUE_SCOPE, database, manifest, digest: expectedDigest,
    state: restore ? 'RESTORING' : 'PREPARED', inProgress: false };
  await checkpoint(journal);
  try {
    journal.inProgress = true; await checkpoint(journal);
    if (restore) {
      if (!current.manifest) await connection.db.createCollection(name, manifest.options);
      for (const index of manifest.indexes.filter(row => row.name !== '_id_'))
        await connection.db.collection(name).createIndex(index.key, { name: index.name });
      if ((await inspect(connection, env)).digest !== expectedDigest) throw new Error('QUEUE_RESTORE_MISMATCH');
    } else {
      if ((await inspect(connection, env)).digest !== expectedDigest) throw new Error('QUEUE_SOURCE_CHANGED');
      await connection.db.collection(name).drop();
      if ((await inspect(connection, env)).state !== 'ABSENT') throw new Error('QUEUE_RETIRE_MISMATCH');
    }
    journal.inProgress = false; journal.state = restore ? 'RESTORED' : 'RETIRED'; await checkpoint(journal);
    return { state: journal.state, scope: EMPTY_ACCRUAL_QUEUE_SCOPE, documentsRemoved: 0, indexes: 2 };
  } catch (error) { journal.state = 'PARTIAL'; await checkpoint(journal); throw error; }
}
