import { createHash } from 'node:crypto';
import { mongo } from 'mongoose';
import { provisionReferenceCatalogStorage } from './reference-catalog-storage.service.js';

const COLLECTIONS = ['aibreeds', 'aitraits', 'pets', 'aipricingpolicies', 'aisitterprofiles', 'reference_catalog'];
const FIELDS = {
  BREED: ['_id', 'code', 'name', 'species', 'active', 'source', 'createdAt', 'updatedAt'],
  TRAIT: ['_id', 'code', 'label', 'species', 'explanation', 'active', 'createdAt', 'updatedAt']
};
const SPECIES = ['DOG', 'CAT'];
export { referenceCatalogIndexes } from '../models/reference-catalog.storage.js';

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]));
  return value;
}
export function catalogCanonical(value) {
  return JSON.stringify(sorted(mongo.BSON.EJSON.serialize(value, { relaxed: false })));
}
const hash = value => createHash('sha256').update(catalogCanonical(value)).digest('hex');
const validText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

function validate(row, kind, target = false) {
  const errors = [];
  const allowed = Object.hasOwn(FIELDS, kind) ? FIELDS[kind] : undefined;
  if (!allowed) return ['UNKNOWN_KIND'];
  if (Object.keys(row).some(key => !allowed.includes(key) && !(target && key === 'kind'))) errors.push('UNKNOWN_FIELD');
  if (row._id?._bsontype !== 'ObjectId') errors.push('ID_TYPE');
  if (!validText(row.code, 80)) errors.push('CODE_TYPE');
  if ('active' in row && typeof row.active !== 'boolean') errors.push('ACTIVE_TYPE');
  for (const field of ['createdAt', 'updatedAt']) if (field in row && (!(row[field] instanceof Date) || !Number.isFinite(row[field].getTime()))) errors.push('DATE_TYPE');
  if (kind === 'BREED') {
    if (!validText(row.name, 100) || !validText(row.source, 500)) errors.push('BREED_TEXT_TYPE');
    if (!SPECIES.includes(row.species)) errors.push('BREED_SPECIES_TYPE');
  } else {
    if (!validText(row.label, 160) || !validText(row.explanation, 1000)) errors.push('TRAIT_TEXT_TYPE');
    if (!Array.isArray(row.species) || row.species.some(value => !SPECIES.includes(value))) errors.push('TRAIT_SPECIES_TYPE');
  }
  return errors;
}

function limits(options) {
  const result = { maxDocs: 5000, batchSize: 100, maxTimeMS: 5000, maxBytes: 16 * 1024 * 1024, ...options };
  for (const field of ['maxDocs', 'batchSize', 'maxTimeMS', 'maxBytes']) if (!Number.isSafeInteger(result[field]) || result[field] <= 0) throw new Error('INVALID_SCAN_LIMIT');
  if (result.maxDocs > 20000 || result.batchSize > 1000 || result.maxTimeMS > 30000 || result.maxBytes > 64 * 1024 * 1024) throw new Error('SCAN_LIMIT_TOO_LARGE');
  return result;
}

async function read(db, name, projection, budget, options) {
  const rows = [];
  const cursor = db.collection(name).find({}, {
    ...(projection ? { projection } : {}), sort: { _id: 1 }, limit: options.maxDocs + 1,
    batchSize: options.batchSize, maxTimeMS: options.maxTimeMS,
    promoteValues: false, ...(options.session ? { session: options.session } : {})
  });
  try {
    for await (const row of cursor) {
      if (rows.length === options.maxDocs) throw new Error('SCAN_DOCUMENT_LIMIT');
      budget.bytes += mongo.BSON.calculateObjectSize(row);
      if (budget.bytes > options.maxBytes) throw new Error('SCAN_BYTE_LIMIT');
      rows.push(row);
    }
  } finally { await cursor.close(); }
  return rows;
}

export async function inspectReferenceCatalog(db, input = {}) {
  const options = limits(input), budget = { bytes: 0 }, errors = {};
  const add = code => { errors[code] = (errors[code] ?? 0) + 1; };
  const data = {};
  // Source rows must be complete: an inclusion projection could hide unknown fields.
  for (const name of COLLECTIONS) {
    const projection = name === 'pets' ? { _id: 1, breedCode: 1, traits: 1, species: 1 }
      : name === 'aipricingpolicies' ? { _id: 1, 'rules.when': 1 }
        : name === 'aisitterprofiles' ? { _id: 1, allowedTraits: 1 } : null;
    data[name] = await read(db, name, projection, budget, options);
  }
  const rows = [], byCode = new Map(), ids = new Set();
  for (const [name, kind] of [['aibreeds', 'BREED'], ['aitraits', 'TRAIT']]) for (const row of data[name]) {
    validate(row, kind).forEach(add);
    const key = `${kind}:${row.code}`, id = catalogCanonical(row._id);
    if (byCode.has(key)) add('DUPLICATE_CODE');
    if (ids.has(id)) add('CROSS_KIND_ID_COLLISION');
    byCode.set(key, row); ids.add(id); rows.push({ ...row, kind });
  }
  const ref = (kind, code, species) => {
    if (typeof code !== 'string') { add('REFERENCE_TYPE'); return; }
    const row = byCode.get(`${kind}:${code}`);
    if (!row) add('UNKNOWN_REFERENCE');
    else if (species && (kind === 'BREED' ? row.species !== species : !Array.isArray(row.species) || !row.species.includes(species))) add('REFERENCE_SPECIES');
  };
  const traitRefs = (values, species) => {
    if (!Array.isArray(values)) { add('REFERENCE_TYPE'); return; }
    values.forEach(code => ref('TRAIT', code, species));
  };
  for (const row of data.pets) {
    if (!SPECIES.includes(row.species)) add('REFERENCE_SPECIES');
    ref('BREED', row.breedCode, row.species); traitRefs(row.traits === undefined ? [] : row.traits, row.species);
  }
  for (const row of data.aisitterprofiles) traitRefs(row.allowedTraits === undefined ? [] : row.allowedTraits);
  for (const row of data.aipricingpolicies) {
    if (!Array.isArray(row.rules)) { add('REFERENCE_TYPE'); continue; }
    for (const rule of row.rules) {
      const when = rule?.when;
      if (when === undefined) continue;
      if (!when || typeof when !== 'object' || Array.isArray(when)) { add('REFERENCE_TYPE'); continue; }
      if (when.species !== undefined && !SPECIES.includes(when.species)) add('REFERENCE_SPECIES');
      if (when.breedCodes !== undefined) {
        if (!Array.isArray(when.breedCodes)) add('REFERENCE_TYPE');
        else when.breedCodes.forEach(code => ref('BREED', code, when.species));
      }
      if (when.traitCode !== undefined) ref('TRAIT', when.traitCode, when.species);
    }
  }
  const targetIds = new Map(), targetCodes = new Map();
  for (const row of data.reference_catalog) {
    validate(row, row.kind, true).forEach(add);
    const id = catalogCanonical(row._id), key = `${row.kind}:${row.code}`;
    if (targetCodes.has(key)) add('TARGET_DUPLICATE_CODE');
    targetIds.set(id, row); targetCodes.set(key, row);
    if (!byCode.has(key)) add('TARGET_EXTRA_RECORD');
  }
  const missing = [];
  for (const row of rows) {
    const byId = targetIds.get(catalogCanonical(row._id)), byKey = targetCodes.get(`${row.kind}:${row.code}`);
    if (byId && catalogCanonical(byId) !== catalogCanonical(row)) add('TARGET_ID_CONFLICT');
    if (byKey && catalogCanonical(byKey) !== catalogCanonical(row)) add('TARGET_CONFLICT');
    if (!byId && !byKey) missing.push(row);
  }
  const sourceData = Object.fromEntries(COLLECTIONS.filter(name => name !== 'reference_catalog').map(name => [name, data[name]]));
  const checkpointRows = Object.fromEntries(rows.map(({ kind, ...row }) => [hash({ kind, _id: row._id }), hash(row)]));
  const checkpoint = { version: 1, rows: checkpointRows };
  return {
    summary: {
      mode: 'DRY_RUN', sourceDigest: hash(sourceData), targetDigest: hash(data.reference_catalog),
      counts: Object.fromEntries(COLLECTIONS.map(name => [name, data[name].length])),
      scannedBytes: budget.bytes, missing: missing.length, errors, blocked: Object.keys(errors).length > 0,
      limits: { maxDocs: options.maxDocs, maxBytes: options.maxBytes, batchSize: options.batchSize, maxTimeMS: options.maxTimeMS }
    }, missing, checkpoint: { ...checkpoint, digest: hash(checkpoint) }
  };
}

export async function inspectReverseReferenceCatalog(db, { checkpoint, expectedCheckpointDigest, ...input } = {}) {
  if (!checkpoint || checkpoint.version !== 1 || !checkpoint.rows || Array.isArray(checkpoint.rows)
    || Object.keys(checkpoint.rows).length > 40000
    || Object.entries(checkpoint.rows).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(value))
    || hash({ version: checkpoint.version, rows: checkpoint.rows }) !== expectedCheckpointDigest
    || checkpoint.digest !== expectedCheckpointDigest) throw new Error('CHECKPOINT_DIGEST_MISMATCH');
  const options = limits(input), budget = { bytes: 0 }, data = {};
  for (const name of COLLECTIONS) {
    const projection = name === 'pets' ? { _id: 1, species: 1, breedCode: 1, traits: 1 }
      : name === 'aipricingpolicies' ? { _id: 1, 'rules.when': 1 }
        : name === 'aisitterprofiles' ? { _id: 1, allowedTraits: 1 } : null;
    data[name] = await read(db, name, projection, budget, options);
  }
  // Validate the authoritative target and all references using the same checks.
  const virtual = { ...data, aibreeds: [], aitraits: [], reference_catalog: [] };
  const errors = {}, add = code => { errors[code] = (errors[code] ?? 0) + 1; };
  for (const { kind, ...row } of data.reference_catalog) {
    if (!['BREED', 'TRAIT'].includes(kind)) { add('UNKNOWN_KIND'); continue; }
    virtual[kind === 'BREED' ? 'aibreeds' : 'aitraits'].push(row);
  }
  const virtualDb = { collection: name => ({ find: () => ({
    async *[Symbol.asyncIterator]() { yield* virtual[name]; }, async close() {}
  }) }) };
  const checked = await inspectReferenceCatalog(virtualDb, options);
  Object.assign(errors, checked.summary.errors);
  const operations = [], targetKeys = new Set();
  for (const [name, kind] of [['aibreeds', 'BREED'], ['aitraits', 'TRAIT']]) {
    const legacy = data[name], target = virtual[name];
    const byId = new Map(legacy.map(row => [catalogCanonical(row._id), row]));
    const byCode = new Map(legacy.map(row => [row.code, row]));
    const targetIds = new Set();
    for (const row of legacy) validate(row, kind).forEach(add);
    if (byCode.size !== legacy.length) add('DUPLICATE_CODE');
    for (const row of target) {
      const key = hash({ kind, _id: row._id }), id = catalogCanonical(row._id);
      targetKeys.add(key); targetIds.add(id);
      const current = byId.get(id), codeOwner = byCode.get(row.code);
      if (codeOwner && catalogCanonical(codeOwner._id) !== id) { add('REVERSE_CODE_CONFLICT'); continue; }
      if (current && catalogCanonical(current) === catalogCanonical(row)) continue;
      if (current && hash(current) !== checkpoint.rows[key]) { add('REVERSE_LEGACY_CHANGED'); continue; }
      if (!current && checkpoint.rows[key]) { add('REVERSE_LEGACY_MISSING'); continue; }
      operations.push({ collection: name, row, replace: Boolean(current) });
    }
    if (legacy.some(row => !targetIds.has(catalogCanonical(row._id)))) add('REVERSE_EXTRA_LEGACY');
  }
  if (Object.keys(checkpoint.rows).some(key => !targetKeys.has(key))) add('REVERSE_TARGET_DELETION');
  return { summary: {
    mode: 'REVERSE_DRY_RUN', blocked: Object.keys(errors).length > 0, errors,
    sourceDigest: hash(data), checkpointDigest: expectedCheckpointDigest,
    inserts: operations.filter(operation => !operation.replace).length,
    replacements: operations.filter(operation => operation.replace).length,
    scannedBytes: budget.bytes
  }, operations };
}

export async function reverseReferenceCatalog(db, { writersFrozen, expectedDigest, ...options } = {}) {
  if (!writersFrozen) throw new Error('WRITERS_FREEZE_REQUIRED');
  const before = await inspectReverseReferenceCatalog(db, options);
  if (before.summary.blocked) throw new Error('REVERSE_BLOCKED');
  if (!expectedDigest || before.summary.sourceDigest !== expectedDigest) throw new Error('SOURCE_DIGEST_MISMATCH');
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const fresh = await inspectReverseReferenceCatalog(db, { ...options, session });
      if (fresh.summary.blocked) throw new Error('REVERSE_BLOCKED');
      if (fresh.summary.sourceDigest !== expectedDigest) throw new Error('SOURCE_DIGEST_MISMATCH');
      for (const operation of fresh.operations) {
        const collection = db.collection(operation.collection);
        if (operation.replace) {
          const result = await collection.replaceOne({ _id: operation.row._id }, operation.row, { session });
          if (result.matchedCount !== 1) throw new Error('REVERSE_WRITE_CONFLICT');
        } else await collection.insertOne(operation.row, { session });
      }
      const after = await inspectReverseReferenceCatalog(db, { ...options, session });
      if (after.summary.blocked || after.operations.length) throw new Error('REVERSE_POSTCHECK_FAILED');
      return { mode: 'REVERSE_APPLY', inserts: fresh.summary.inserts, replacements: fresh.summary.replacements, verified: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
  } finally { await session.endSession(); }
}

export async function applyReferenceCatalog(db, { expectedDigest, writersFrozen = false, ...options } = {}) {
  if (!writersFrozen) throw new Error('WRITERS_FREEZE_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) throw new Error('SOURCE_DIGEST_REQUIRED');
  const before = await inspectReferenceCatalog(db, options);
  if (before.summary.blocked) throw new Error('MIGRATION_BLOCKED');
  if (before.summary.sourceDigest !== expectedDigest) throw new Error('SOURCE_DIGEST_MISMATCH');
  // Additive DDL precedes the transaction; never change/drop existing indexes.
  await provisionReferenceCatalogStorage(db);
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const fresh = await inspectReferenceCatalog(db, { ...options, session });
      if (fresh.summary.blocked) throw new Error('MIGRATION_BLOCKED');
      if (fresh.summary.sourceDigest !== expectedDigest) throw new Error('SOURCE_DIGEST_MISMATCH');
      if (fresh.missing.length) await db.collection('reference_catalog').insertMany(fresh.missing, { session, ordered: true });
      const after = await inspectReferenceCatalog(db, { ...options, session });
      if (after.summary.blocked || after.summary.missing || after.summary.sourceDigest !== expectedDigest) throw new Error('POSTCHECK_FAILED');
      return { mode: 'APPLY', inserted: fresh.missing.length, sourceDigest: expectedDigest, targetDigest: after.summary.targetDigest, verified: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
  } finally { await session.endSession(); }
}
