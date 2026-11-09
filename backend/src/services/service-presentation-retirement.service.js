import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import { servicePresentationFields } from '../models/service-presentation.model.js';
import { serviceModel } from '../models/service.model.js';

const name = 'servicepresentations', fields = Object.keys(servicePresentationFields());
const canonical = value => mongo.BSON.EJSON.stringify(value, { relaxed: false });
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fail = code => { throw new Error(code); };
const payload = row => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]]));

export async function inspectPresentationRetirement(connection) {
  const db = connection.db, info = await db.listCollections({ name }, { nameOnly: false }).next();
  if (!info || info.type !== 'collection' || JSON.stringify(info.options) !== '{}') fail('PRESENTATION_LEGACY_METADATA');
  const indexes = (await db.collection(name).listIndexes().toArray()).sort((a, b) => a.name.localeCompare(b.name));
  if (indexes.length !== 2 || !indexes.some(i => i.name === '_id_')
    || !indexes.some(i => i.unique === true && JSON.stringify(i.key) === '{"serviceId":1}')
    || indexes.some(i => i.v !== 2 || Object.keys(i).some(key => !['v', 'key', 'name', 'unique'].includes(key)))) fail('PRESENTATION_LEGACY_METADATA');
  const rows = [];
  let bytes = 0;
  for await (const row of db.collection(name).find({}, { promoteValues: false, maxTimeMS: 5000 })
    .sort({ _id: 1 }).batchSize(20).limit(1001)) {
    bytes += mongo.BSON.calculateObjectSize(row);
    if (rows.length === 1000 || bytes > 16 * 1024 * 1024) fail('PRESENTATION_SCAN_LIMIT');
    rows.push(row);
  }
  const parents = [], seen = new Set(), Service = serviceModel(connection);
  for (const row of rows) {
    if (Object.keys(row).some(key => !['_id', 'serviceId', ...fields].includes(key))
      || row._id?._bsontype !== 'ObjectId' || row.serviceId?._bsontype !== 'ObjectId') fail('PRESENTATION_SOURCE_INVALID');
    if (seen.has(String(row.serviceId))) fail('PRESENTATION_DUPLICATE_PARENT');
    seen.add(String(row.serviceId));
    const parent = await db.collection('services').findOne({ _id: row.serviceId }, { promoteValues: false, maxTimeMS: 5000 });
    if (!parent?.presentation || Object.keys(parent.presentation).some(key => !fields.includes(key))) fail('PRESENTATION_PARENT_MISSING');
    bytes += mongo.BSON.calculateObjectSize(parent);
    if (bytes > 16 * 1024 * 1024 || mongo.BSON.calculateObjectSize(parent) > 256 * 1024) fail('PRESENTATION_SCAN_LIMIT');
    if (hash(payload(row)) !== hash(payload(parent.presentation))) fail('PRESENTATION_COPY_CONFLICT');
    const candidate = new Service(parent); await candidate.validate();
    if (hash(payload(candidate.presentation.toObject())) !== hash(payload(row))) fail('PRESENTATION_COERCION');
    parents.push({ _id: parent._id, presentation: parent.presentation });
  }
  const manifest = { version: 1, database: db.databaseName, name, options: info.options, indexes, rows, parents };
  return { state: 'DRY_RUN', digest: hash(manifest), manifest, documents: rows.length, indexes: 2, scannedBytes: bytes };
}

export async function retirePresentations({ connection, manifest, expectedDigest, writersFrozen }) {
  if (!writersFrozen) fail('PRESENTATION_FREEZE_REQUIRED');
  if (manifest?.name !== name || manifest.database !== connection.name || hash(manifest) !== expectedDigest) fail('PRESENTATION_MANIFEST_MISMATCH');
  if ((await inspectPresentationRetirement(connection)).digest !== expectedDigest) fail('PRESENTATION_SOURCE_CHANGED');
  await connection.db.collection(name).drop();
  return { state: 'RETIRED', documents: manifest.rows.length, indexes: 2 };
}

export async function restorePresentations({ connection, manifest, expectedDigest, writersFrozen }) {
  if (!writersFrozen) fail('PRESENTATION_FREEZE_REQUIRED');
  if (manifest?.name !== name || manifest.database !== connection.name || hash(manifest) !== expectedDigest) fail('PRESENTATION_MANIFEST_MISMATCH');
  const db = connection.db;
  if (await db.listCollections({ name }, { nameOnly: true }).hasNext()) fail('PRESENTATION_RESTORE_REQUIRES_MISSING_STORE');
  const rows = [];
  for (const old of manifest.rows) {
    const parent = await db.collection('services').findOne({ _id: old.serviceId }, { promoteValues: false, maxTimeMS: 5000 });
    if (!parent?.presentation || Object.keys(parent.presentation).some(key => !fields.includes(key))) fail('PRESENTATION_PARENT_MISSING');
    const candidate = new (serviceModel(connection))(parent); await candidate.validate();
    if (hash(payload(candidate.presentation.toObject())) !== hash(payload(parent.presentation))) fail('PRESENTATION_COERCION');
    rows.push({ _id: old._id, serviceId: old.serviceId, ...payload(parent.presentation) });
  }
  await db.createCollection(name, manifest.options);
  await db.command({ createIndexes: name, indexes: manifest.indexes.filter(index => index.name !== '_id_') });
  if (rows.length) await db.collection(name).insertMany(rows, { ordered: true });
  const result = await inspectPresentationRetirement(connection);
  if (result.documents !== rows.length) fail('PRESENTATION_RESTORE_POSTCHECK');
  return { state: 'RESTORED_FROM_CURRENT_PARENTS', documents: rows.length, indexes: 2 };
}
