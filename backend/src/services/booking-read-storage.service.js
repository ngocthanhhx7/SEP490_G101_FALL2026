import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../utils/app-error.js';

export const BOOKING_OWNER_INDEX = Object.freeze({ name: 'booking_customer_cursor', key: Object.freeze({ customerId: 1, _id: -1 }) });
const { BSON } = mongoose.mongo;
// Equality fixes the owner prefix, so either _id direction can be scanned in
// reverse. Reuse existing two-field variants instead of adding a duplicate.
const compatibleKey = key => Object.keys(key).join(',') === 'customerId,_id'
  && [1, -1].includes(key.customerId) && [1, -1].includes(key._id);
const plain = index => !index.unique && !index.sparse && !index.partialFilterExpression
  && index.expireAfterSeconds === undefined && (!index.collation || index.collation.locale === 'simple') && !index.hidden;
const equivalent = indexes => indexes.find(index => compatibleKey(index.key) && plain(index));

export async function inspectBookingReadStorage(connection) {
  const info = await connection.db.listCollections({ name: 'bookings' }, { maxTimeMS: 5000 }).next();
  const report = { state: 'DRY_RUN', collectionExists: !!info, documents: 0, owners: {}, invalidIdentifiers: 0,
    invalidOwners: 0, equivalentIndex: null, conflicts: 0, ownerKeyDigest: null, digest: null };
  if (!info) return report;
  const collection = connection.db.collection('bookings'), indexes = await collection.listIndexes({ maxTimeMS: 5000 }).toArray();
  report.equivalentIndex = equivalent(indexes)?.name ?? null;
  report.conflicts = indexes.filter(index => (index.name === BOOKING_OWNER_INDEX.name || compatibleKey(index.key))
    && (!compatibleKey(index.key) || !plain(index))).length;
  if (info.options?.collation && info.options.collation.locale !== 'simple') report.conflicts++;
  const hash = createHash('sha256');
  for await (const doc of collection.find({}, { projection: { _id: 1, customerId: 1 },
    promoteValues: false, promoteLongs: false, maxTimeMS: 5000 }).sort({ _id: 1 }).batchSize(100)) {
    if (++report.documents > 100000) throw new Error('Booking index preflight budget exceeded');
    const ownerType = !Object.hasOwn(doc, 'customerId') ? 'missing' : doc.customerId === null ? 'null'
      : doc.customerId?._bsontype === 'ObjectId' ? 'objectId' : Array.isArray(doc.customerId) ? 'array' : typeof doc.customerId;
    report.owners[ownerType] = (report.owners[ownerType] ?? 0) + 1;
    if (doc._id?._bsontype !== 'ObjectId') report.invalidIdentifiers++;
    if (!['objectId', 'missing', 'null'].includes(ownerType)) report.invalidOwners++;
    hash.update(BSON.serialize({ _id: doc._id, ...(Object.hasOwn(doc, 'customerId') ? { customerId: doc.customerId } : {}) }));
  }
  report.ownerKeyDigest = hash.digest('hex');
  // Bind an apply to both current data and index options, never to document count alone.
  const metadata = indexes.map(({ name, key, unique, sparse, partialFilterExpression, expireAfterSeconds, collation, hidden }) =>
    ({ name, key, unique, sparse, partialFilterExpression, expireAfterSeconds, collation, hidden })).sort((a, b) => a.name.localeCompare(b.name));
  report.digest = createHash('sha256').update(report.ownerKeyDigest).update(BSON.serialize({ indexes: metadata })).digest('hex');
  return report;
}

export async function provisionBookingReadStorage({ connection, apply = false, expectedDigest }) {
  const before = await inspectBookingReadStorage(connection);
  if (!apply) return before;
  if (!before.collectionExists || before.conflicts || before.invalidIdentifiers || before.invalidOwners
    || before.digest !== expectedDigest) throw new Error('Booking index preflight/digest failed');
  if (before.equivalentIndex) return { ...before, state: 'ALREADY_READY', created: false };
  await connection.db.collection('bookings').createIndex(BOOKING_OWNER_INDEX.key,
    { name: BOOKING_OWNER_INDEX.name, maxTimeMS: 30000 });
  await assertBookingReadStorage(connection);
  const after = await inspectBookingReadStorage(connection);
  if (after.conflicts || after.invalidIdentifiers || after.invalidOwners) throw new Error('Post-build booking preflight failed; retain index for investigation');
  return { ...after, state: 'INDEX_READY', created: true, ownerKeysChangedDuringBuild: before.ownerKeyDigest !== after.ownerKeyDigest };
}

export async function assertBookingReadStorage(connection) {
  const info = await connection.db.listCollections({ name: 'bookings' }, { maxTimeMS: 5000 }).next();
  if (!info || info.options?.collation && info.options.collation.locale !== 'simple'
    || !equivalent(await connection.db.collection('bookings').listIndexes({ maxTimeMS: 5000 }).toArray())) {
    throw new AppError(503, 'BOOKING_READ_STORAGE_NOT_READY', 'Provision the reviewed booking owner index before deployment');
  }
}
