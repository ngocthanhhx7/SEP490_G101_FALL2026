import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import { RAW_OPERATIONAL_CONTRACT, rawOperationalCollections, rawOperationalCollectionOptions } from '../models/raw-operational.storage.js';

const MAX_TIME_MS = 5000, DOCUMENT_CAP = 100000;
const normalized = options => ({ validator: options?.validator ?? {}, validationLevel: options?.validationLevel ?? 'strict',
  validationAction: options?.validationAction ?? 'error' });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = isDeepStrictEqual;

export async function assertRawOperationalValidation(db) {
  for (const name of rawOperationalCollections) {
    const info = await db.listCollections({ name }, { maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }).next();
    if (!info || info.type !== 'collection' || !same(normalized(info.options), rawOperationalCollectionOptions(name)))
      throw new Error('RAW_VALIDATOR_NOT_READY');
  }
}

export async function inspectRawOperationalValidation(db) {
  const collections = [];
  for (const name of rawOperationalCollections) {
    const info = await db.listCollections({ name }, { maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }).next();
    if (!info || info.type !== 'collection') throw new Error('RAW_COLLECTION_UNAVAILABLE');
    const expected = rawOperationalCollectionOptions(name), options = normalized(info.options);
    const indexes = (await db.collection(name).listIndexes({ maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }).toArray())
      .sort((a, b) => a.name.localeCompare(b.name));
    let documents = 0;
    const data = createHash('sha256');
    for await (const row of db.collection(name).find({}, { promoteValues: false,
      maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }).sort({ _id: 1 }).batchSize(100)) {
      if (++documents > DOCUMENT_CAP) throw new Error('RAW_DOCUMENT_BUDGET');
      data.update(mongoose.mongo.BSON.serialize(row));
    }
    const invalid = await db.collection(name).aggregate([
      { $limit: DOCUMENT_CAP + 1 }, { $match: { $nor: [expected.validator] } }, { $count: 'count' }
    ], { maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS, allowDiskUse: false }).toArray();
    collections.push({ name, documents, dataHash: data.digest('hex'), indexes, options,
      invalid: invalid[0]?.count ?? 0, compatible: same(options, expected),
      foreignValidator: Object.keys(options.validator).length > 0 && !same(options.validator, expected.validator) });
  }
  const snapshot = { contract: RAW_OPERATIONAL_CONTRACT, database: db.databaseName, collections };
  return { ...snapshot, digest: hash(snapshot), readyForApply: collections.every(row => !row.invalid && !row.foreignValidator),
    limits: { maxTimeMS: MAX_TIME_MS, documentCapPerCollection: DOCUMENT_CAP, transactionalSnapshot: false } };
}

function confirmation(db, input) {
  if (input.database !== db.databaseName || input.contract !== RAW_OPERATIONAL_CONTRACT
    || !/^[a-f0-9]{64}$/.test(input.digest ?? '') || typeof input.checkpoint !== 'function') throw new Error('RAW_CONFIRMATION_REQUIRED');
}

export async function installRawOperationalValidation({ db, ...input }) {
  confirmation(db, input);
  const before = await inspectRawOperationalValidation(db);
  if (before.digest !== input.digest || !before.readyForApply) throw new Error('RAW_PREFLIGHT_CHANGED_OR_BLOCKED');
  const journal = { contract: RAW_OPERATIONAL_CONTRACT, database: db.databaseName, state: 'PREPARED', before,
    completed: [], inProgress: null };
  await input.checkpoint(journal); // Durable rollback metadata before the first DDL.
  try {
    for (const row of before.collections) {
      if (row.compatible) continue;
      journal.state = 'APPLYING'; journal.inProgress = row.name; await input.checkpoint(journal);
      await db.command({ collMod: row.name, ...rawOperationalCollectionOptions(row.name) }, { timeoutMS: MAX_TIME_MS });
      journal.completed.push(row.name); journal.inProgress = null; await input.checkpoint(journal);
    }
    const after = await inspectRawOperationalValidation(db);
    if (!after.collections.every((row, index) => row.compatible && row.invalid === 0
      && row.dataHash === before.collections[index].dataHash && same(row.indexes, before.collections[index].indexes)))
      throw new Error('RAW_POSTFLIGHT_CHANGED');
    journal.state = 'APPLIED'; journal.afterDigest = after.digest; await input.checkpoint(journal);
    return { state: 'APPLIED', contract: RAW_OPERATIONAL_CONTRACT, digest: after.digest, changed: [...journal.completed],
      documentsChanged: false, indexesChanged: false };
  } catch (error) {
    journal.state = 'PARTIAL'; await input.checkpoint(journal);
    // Keep the journal's inProgress too: a lost DDL acknowledgement needs metadata reconciliation.
    throw error;
  }
}

export async function restoreRawOperationalValidation({ db, journal, ...input }) {
  confirmation(db, input);
  if (journal.contract !== RAW_OPERATIONAL_CONTRACT || journal.database !== db.databaseName
    || journal.before?.collections?.length !== rawOperationalCollections.length
    || !same(journal.before.collections.map(row => row.name), [...rawOperationalCollections])
    || journal.before.collections.some(row => Object.keys(row.options?.validator ?? {}).length > 0
      && !same(row.options.validator, rawOperationalCollectionOptions(row.name).validator))
    || journal.before.digest !== hash({ contract: journal.before.contract, database: journal.before.database, collections: journal.before.collections }))
    throw new Error('RAW_ROLLBACK_MANIFEST_INVALID');
  const before = await inspectRawOperationalValidation(db);
  if (before.digest !== input.digest) throw new Error('RAW_PREFLIGHT_CHANGED_OR_BLOCKED');
  const progress = { contract: RAW_OPERATIONAL_CONTRACT, database: db.databaseName, state: 'RESTORING', completed: [], inProgress: null };
  await input.checkpoint(progress);
  for (const row of [...journal.before.collections].reverse()) {
    const actual = before.collections.find(item => item.name === row.name);
    if (same(actual.options, row.options)) continue;
    if (!same(actual.options, rawOperationalCollectionOptions(row.name))) throw new Error('RAW_ROLLBACK_FOREIGN_VALIDATOR');
    progress.inProgress = row.name; await input.checkpoint(progress);
    await db.command({ collMod: row.name, ...row.options }, { timeoutMS: MAX_TIME_MS });
    progress.completed.push(row.name); progress.inProgress = null; await input.checkpoint(progress);
  }
  const after = await inspectRawOperationalValidation(db);
  if (!after.collections.every((row, index) => same(row.options, journal.before.collections[index].options)
    && row.dataHash === before.collections[index].dataHash && same(row.indexes, before.collections[index].indexes)))
    throw new Error('RAW_ROLLBACK_POSTFLIGHT_CHANGED');
  progress.state = 'RESTORED'; await input.checkpoint(progress);
  return { state: 'RESTORED', documentsChanged: false, indexesChanged: false, restored: progress.completed,
    metadataComparison: 'Normalized validator defaults; MongoDB may retain explicit strict/error/empty-validator fields' };
}
