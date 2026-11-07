import mongoose from 'mongoose';
import { loadConfig } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';

// Aggregate-only diagnostics. Never calls syncIndexes, provisioning or startup.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const config = loadConfig();
const connection = await mongoose.createConnection(config.mongoUri, {
  dbName: config.database, autoCreate: false, autoIndex: false,
  bufferCommands: false, maxPoolSize: 2, serverSelectionTimeoutMS: 10000
}).asPromise().catch(error => { throw new Error(`Audit connection failed (${error.code ?? 'UNAVAILABLE'})`); });
const report = { at: new Date().toISOString(), readOnly: true, maxTimeMS: 5000,
  collections: [], references: [], errors: [] };
async function safe(check, operation) {
  try { return await operation(); }
  catch (error) { report.errors.push({ check, code: error.code ?? error.name }); return null; }
}
// Only current authoritative foreign keys. Snapshots, historical actors, raw
// string IDs and optional domain links require their own semantic audit.
const references = [
  ['contacts', 'userId', 'users'], ['pets', 'ownerId', 'users'],
  ['customeraddresses', 'ownerId', 'users'], ['sitterstatuses', 'userId', 'users'],
  ['sitterpublicprofiles', 'userId', 'users'], ['aisitterprofiles', 'userId', 'users'],
  ['servicepresentations', 'serviceId', 'services'],
  ['serviceversions', 'serviceId', 'services'], ['servicepriceversions', 'serviceId', 'services'],
  ['servicepolicyversions', 'serviceId', 'services'], ['aipricingpolicies', 'serviceId', 'services'],
  ['application_mails', 'applicationId', 'sitterapplications']
];
try {
  createApp({ config, connection, lifecycle: { draining: false }, env: process.env });
  const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map(row => row.name));
  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    if (name.startsWith('system.')) continue;
    const collection = connection.db.collection(name);
    const stats = await safe(`${name}:stats`, () => connection.db.command({ collStats: name }));
    const indexes = await safe(`${name}:indexes`, () => collection.listIndexes().toArray());
    const models = Object.values(connection.models).filter(model => model.collection.name === name);
    const entry = { name, models: models.map(model => model.modelName), documents: stats?.count,
      logicalBytes: stats?.size, indexBytes: stats?.totalIndexSize,
      indexes: indexes?.map(({ name, key, unique, sparse, partialFilterExpression, expireAfterSeconds, collation }) =>
        ({ name, key, unique, sparse, partialFilterExpression, expireAfterSeconds, collation })), duplicates: [] };
    for (const index of indexes ?? []) {
      if (!index.unique || index.name === '_id_') continue;
      // Multikey uniqueness is per-document, not an array-value group. Do not
      // misrepresent a generic aggregation as proof for those constraints.
      const fields = Object.keys(index.key);
      const arrayCounts = await safe(`${name}:${index.name}:arrays`, () => collection.aggregate([
        { $match: { $expr: { $or: fields.map(field => ({ $isArray: `$${field}` })) } } }, { $count: 'count' }
      ], { maxTimeMS: 5000 }).toArray());
      if (arrayCounts === null || arrayCounts.length) {
        entry.duplicates.push({ index: index.name, skipped: 'ARRAY_OR_DIAGNOSTIC_UNAVAILABLE' }); continue;
      }
      const conditions = [];
      if (index.partialFilterExpression) conditions.push(index.partialFilterExpression);
      if (index.sparse) conditions.push({ $or: fields.map(field => ({ [field]: { $exists: true } })) });
      const counts = await safe(`${name}:${index.name}:duplicates`, () => collection.aggregate([
        ...(conditions.length ? [{ $match: { $and: conditions } }] : []),
        { $group: { _id: Object.fromEntries(fields.map((field, i) => [`k${i}`, { $ifNull: [`$${field}`, null] }])), count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }, { $count: 'groups' }
      ], { maxTimeMS: 5000, allowDiskUse: false, ...(index.collation ? { collation: index.collation } : {}) }).toArray());
      entry.duplicates.push({ index: index.name, groups: counts === null ? null : counts[0]?.groups ?? 0 });
    }
    report.collections.push(entry);
  }
  for (const [source, field, target] of references) {
    if (!names.has(source) || !names.has(target)) {
      report.references.push({ source, field, target, skipped: 'COLLECTION_ABSENT' }); continue;
    }
    const counts = await safe(`${source}:${field}:references`, () => connection.db.collection(source).aggregate([
      { $match: { [field]: { $exists: true, $ne: null } } },
      { $lookup: { from: target, localField: field, foreignField: '_id', as: '__target' } },
      { $group: { _id: null, checked: { $sum: 1 }, missing: { $sum: { $cond: [{ $eq: [{ $size: '$__target' }, 0] }, 1, 0] } } } },
      { $project: { _id: 0, checked: 1, missing: 1 } }
    ], { maxTimeMS: 5000, allowDiskUse: false }).toArray());
    report.references.push({ source, field, target, ...(counts === null ? { unavailable: true } : counts[0] ?? { checked: 0, missing: 0 }) });
  }
  console.log(JSON.stringify(report));
} finally { await connection.close(); }
