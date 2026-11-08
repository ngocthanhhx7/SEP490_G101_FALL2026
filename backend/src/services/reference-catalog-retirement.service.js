import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import { catalogCanonical, inspectReferenceCatalog, inspectReverseReferenceCatalog, reverseReferenceCatalog } from './reference-catalog-migration.service.js';
import { assertReferenceCatalogStorage } from './reference-catalog-storage.service.js';

const names = ['aibreeds', 'aitraits'];
const hash = value => createHash('sha256').update(catalogCanonical(value)).digest('hex');
const fail = code => { throw new Error(code); };
async function metadata(db, name) {
  const row = await db.listCollections({ name }, { nameOnly: false }).next();
  if (!row || row.type !== 'collection' || JSON.stringify(row.options) !== '{}') fail('CATALOG_LEGACY_METADATA');
  const indexes = (await db.collection(name).listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
  if (indexes.length !== 2 || !indexes.some(i => i.name === '_id_' && JSON.stringify(i.key) === '{"_id":1}')
    || !indexes.some(i => i.unique === true && JSON.stringify(i.key) === '{"code":1}')
    || indexes.some(i => i.v !== 2 || Object.keys(i).some(k => !['v', 'key', 'name', 'unique'].includes(k)))) fail('CATALOG_LEGACY_METADATA');
  return { name, options: row.options, indexes };
}
function validateManifest(manifest, database, digest) {
  if (!manifest || manifest.version !== 1 || manifest.database !== database || hash(manifest) !== digest
    || JSON.stringify(manifest.collections?.map(r => r.name)) !== JSON.stringify(names)
    || Buffer.byteLength(catalogCanonical(manifest)) > 20 * 1024 * 1024) fail('CATALOG_RETIRE_MANIFEST');
}
export async function inspectReferenceCatalogRetirement(db) {
  await assertReferenceCatalogStorage(db);
  const inspected = await inspectReferenceCatalog(db);
  if (inspected.summary.blocked || inspected.summary.missing) fail('CATALOG_COPY_NOT_EXACT');
  const collections = [];
  for (const name of names) {
    const meta = await metadata(db, name);
    const rows = await db.collection(name).find({}, { promoteValues: false, maxTimeMS: 5000 }).sort({ _id: 1 }).limit(5001).toArray();
    if (rows.length > 5000) fail('CATALOG_RETIRE_LIMIT');
    collections.push({ ...meta, rows });
  }
  const manifest = { version: 1, database: db.databaseName, collections, checkpoint: inspected.checkpoint,
    sourceDigest: inspected.summary.sourceDigest, targetDigest: inspected.summary.targetDigest };
  if (Buffer.byteLength(catalogCanonical(manifest)) > 20 * 1024 * 1024) fail('CATALOG_RETIRE_LIMIT');
  return { manifest, digest: hash(manifest), collections: 2, documents: collections.reduce((n, row) => n + row.rows.length, 0), indexes: 4 };
}
export async function retireReferenceCatalog({ db, manifest, expectedDigest, writersFrozen }) {
  if (!writersFrozen) fail('CATALOG_FREEZE_REQUIRED');
  validateManifest(manifest, db.databaseName, expectedDigest);
  const fresh = await inspectReferenceCatalogRetirement(db);
  if (fresh.digest !== expectedDigest) fail('CATALOG_RETIRE_CHANGED');
  const completed = [];
  try {
    for (const name of names) { await db.collection(name).drop(); completed.push(name); }
    return { state: 'RETIRED', completed, documents: fresh.documents, indexes: 4 };
  } catch (error) { error.completed = completed; throw error; }
}
export async function restoreReferenceCatalog({ db, manifest, expectedDigest, writersFrozen }) {
  if (!writersFrozen) fail('CATALOG_FREEZE_REQUIRED');
  validateManifest(manifest, db.databaseName, expectedDigest);
  await assertReferenceCatalogStorage(db);
  // Recreate only missing stores from the frozen catalog backup. Existing stores
  // must still match it exactly; never overwrite an unexpected writer's data.
  for (const row of manifest.collections) {
    const exists = await db.listCollections({ name: row.name }, { nameOnly: true }).hasNext();
    if (exists) {
      const meta = await metadata(db, row.name);
      const current = await db.collection(row.name).find({}, { promoteValues: false, maxTimeMS: 5000 }).sort({ _id: 1 }).limit(5001).toArray();
      if (hash({ ...meta, rows: current }) !== hash(row)) fail('CATALOG_RESTORE_CONFLICT');
    }
  }
  for (const row of manifest.collections) {
    if (await db.listCollections({ name: row.name }, { nameOnly: true }).hasNext()) continue;
    await db.createCollection(row.name, row.options);
    await db.command({ createIndexes: row.name, indexes: row.indexes.filter(i => i.name !== '_id_') });
    if (row.rows.length) await db.collection(row.name).insertMany(row.rows, { ordered: true });
  }
  const options = { checkpoint: manifest.checkpoint, expectedCheckpointDigest: manifest.checkpoint.digest };
  const reverse = await inspectReverseReferenceCatalog(db, options);
  if (reverse.summary.blocked) fail('CATALOG_REVERSE_BLOCKED');
  const result = await reverseReferenceCatalog(db, { ...options, writersFrozen: true, expectedDigest: reverse.summary.sourceDigest });
  return { state: 'RESTORED_AND_RECONCILED', ...result };
}

// Private operator manifests must use canonical Extended JSON to preserve BSON.
export const encodeReferenceCatalogManifest = value => mongo.BSON.EJSON.stringify(value, { relaxed: false });
export function decodeReferenceCatalogManifest(text) {
  const result = mongo.BSON.EJSON.parse(text, { relaxed: false });
  // Protocol version numbers are structural metadata, while row BSON must keep
  // its original numeric types. Do not enable relaxed decoding for the payload.
  result.version = Number(result.version);
  result.checkpoint.version = Number(result.checkpoint.version);
  return result;
}
