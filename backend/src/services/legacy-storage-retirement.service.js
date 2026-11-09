import { createHash } from 'node:crypto';
import { legacyCompensationCollections, storageProfile, assertProfileModels } from '../config/storage-profile.js';

const names = [...legacyCompensationCollections].sort();
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function checkManifest(manifest, database) {
  if (manifest?.format !== 1 || manifest.database !== database || !Array.isArray(manifest.collections)
    || JSON.stringify(manifest.collections.map(row => row.name)) !== JSON.stringify(names)) fail('RETIRE_MANIFEST_INVALID');
  for (const row of manifest.collections) {
    // This maintenance version handles ordinary empty stores only. Fail closed on
    // validators, capped/time-series/encrypted stores, or unfamiliar index options.
    if (JSON.stringify(row.options) !== '{}' || !Array.isArray(row.indexes) || row.indexes.length > 20) fail('RETIRE_METADATA_UNSUPPORTED');
    if (!row.indexes.some(index => index.name === '_id_' && JSON.stringify(index.key) === '{"_id":1}')) fail('RETIRE_METADATA_UNSUPPORTED');
    for (const index of row.indexes) {
      if (!index.key || index.v !== 2 || typeof index.name !== 'string'
        || Object.keys(index).some(key => !['v', 'key', 'name', 'unique', 'sparse', 'partialFilterExpression', 'expireAfterSeconds'].includes(key))) fail('RETIRE_METADATA_UNSUPPORTED');
    }
  }
  if (Buffer.byteLength(JSON.stringify(manifest)) > 256 * 1024) fail('RETIRE_METADATA_LIMIT');
  return manifest;
}

async function inspectOne(db, name) {
  const rows = await db.listCollections({ name }, { nameOnly: false }).toArray();
  if (!rows.length) return null;
  if (rows.length !== 1 || rows[0].type !== 'collection') fail('RETIRE_METADATA_UNSUPPORTED');
  const collection = db.collection(name);
  if (await collection.find({}, { projection: { _id: 1 }, maxTimeMS: 5000 }).limit(1).hasNext()) fail('RETIRE_NONEMPTY');
  const indexes = (await collection.listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
  // Never sort index.key: compound index field order is part of the contract.
  return { name, options: rows[0].options, indexes };
}

export async function inspectLegacyStorage(connection) {
  if (storageProfile(process.env) !== 'EMPLOYEE') fail('RETIRE_PROFILE_REQUIRED');
  assertProfileModels(connection, 'EMPLOYEE');
  const collections = [];
  for (const name of names) {
    const row = await inspectOne(connection.db, name);
    if (!row) fail('RETIRE_SOURCE_MISSING');
    collections.push(row);
  }
  const manifest = checkManifest({ format: 1, database: connection.name, collections }, connection.name);
  return { state: 'DRY_RUN', digest: digest(manifest), manifest,
    collections: collections.length, indexes: collections.reduce((n, row) => n + row.indexes.length, 0) };
}

export async function retireLegacyStorage({ connection, manifest, expectedDigest, writersFrozen = false, restore = false }) {
  if (!writersFrozen || storageProfile(process.env) !== 'EMPLOYEE') fail('RETIRE_FREEZE_REQUIRED');
  assertProfileModels(connection, 'EMPLOYEE');
  checkManifest(manifest, connection.name);
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '') || digest(manifest) !== expectedDigest) fail('RETIRE_DIGEST_MISMATCH');
  const present = [];
  for (const expected of manifest.collections) {
    const actual = await inspectOne(connection.db, expected.name);
    if (!actual && !restore) fail('RETIRE_SOURCE_MISSING');
    if (actual && digest(actual) !== digest(expected)) fail('RETIRE_SOURCE_CHANGED');
    present.push(actual);
  }
  const completed = [];
  let inProgress;
  try {
    for (let i = 0; i < manifest.collections.length; i++) {
      const row = manifest.collections[i];
      inProgress = row.name;
      if (restore) {
        if (present[i]) continue;
        await connection.db.createCollection(row.name, row.options);
        const indexes = row.indexes.filter(index => index.name !== '_id_');
        if (indexes.length) await connection.db.command({ createIndexes: row.name, indexes });
        if (digest(await inspectOne(connection.db, row.name)) !== digest(row)) fail('RETIRE_RESTORE_MISMATCH');
      } else {
        if (digest(await inspectOne(connection.db, row.name)) !== digest(row)) fail('RETIRE_SOURCE_CHANGED');
        await connection.db.collection(row.name).drop();
      }
      completed.push(row.name);
    }
    return { state: restore ? 'RESTORED' : 'RETIRED', digest: expectedDigest, completed };
  } catch (error) {
    // DDL is not atomic. Preserve exactly which stores completed; never retry a
    // partially completed drop as if it were an untouched dry-run.
    error.completed = completed;
    error.inProgress = inProgress;
    throw error;
  }
}
