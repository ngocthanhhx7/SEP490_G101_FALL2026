import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { CATALOG_VERSION_AUDITS, catalogProvenanceValidator } from '../models/catalog-change-provenance.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';

const RAW = { promoteValues: false, promoteLongs: false, maxTimeMS: 5000 };
const FIELDS = ['_id', 'actorId', 'action', 'resourceType', 'resourceId', 'version', 'changedFields', 'reason', 'effectiveAt', 'occurredAt'];
const factories = [serviceVersionModel, servicePolicyVersionModel, servicePriceVersionModel, systemSettingVersionModel];
const scan = (collection, filter = {}) => collection.find(filter, RAW).sort({ _id: 1 }).batchSize(100);
const bytes = value => mongoose.mongo.BSON.calculateObjectSize(value);
const fingerprint = value => createHash('sha256').update(mongoose.mongo.BSON.serialize(
  Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])))).digest('hex');
const versionKey = (definition, version) => `${definition.target}:${version._id}`;
const targetFilter = (definition, audit) => definition.type === 'system-setting'
  ? { _id: audit.resourceId, version: audit.version } : { serviceId: audit.resourceId, version: audit.version };
const metadata = audit => ({ eventId: audit._id, action: audit.action, changedFields: [...audit.changedFields] });

// Reconstruct the original audit view exclusively from canonical version facts.
// No actor/reason/time is inferred, generated or copied redundantly.
export function catalogAuditRecord(definition, version, change = version.changeAudit) {
  return { _id: change.eventId, actorId: version.changedBy, action: change.action,
    resourceType: definition.type, resourceId: definition.type === 'system-setting' ? version._id : version.serviceId,
    version: version.version, changedFields: change.changedFields, reason: version.reason,
    effectiveAt: version.effectiveAt, occurredAt: version.recordedAt };
}

function validAudit(definition, audit) {
  return bytes(audit) <= 64 * 1024 && Object.keys(audit).length === FIELDS.length && Object.keys(audit).every(key => FIELDS.includes(key))
    && ['_id', 'actorId', 'resourceId'].every(key => audit[key]?._bsontype === 'ObjectId')
    && definition.actions.includes(audit.action) && audit.resourceType === definition.type
    && (typeof audit.version === 'number' || ['Int32', 'Double', 'Long'].includes(audit.version?._bsontype))
    && Number.isSafeInteger(Number(audit.version?.toString())) && Number(audit.version.toString()) >= 1
    && typeof audit.reason === 'string' && audit.reason.length > 0 && audit.reason.length <= 500
    && Array.isArray(audit.changedFields) && audit.changedFields.length <= 32
    && audit.changedFields.every(field => typeof field === 'string')
    && ['effectiveAt', 'occurredAt'].every(key => audit[key] instanceof Date && Number.isFinite(audit[key].getTime()));
}

async function validVersion(Model, parent, change) {
  try {
    await new Model({ ...parent, version: Number(parent.version.toString()), changeAudit: change }).validate();
    return bytes({ ...parent, changeAudit: change }) <= 1024 * 1024;
  } catch { return false; }
}

async function inspect(connection) {
  const db = connection.db, models = factories.map(factory => factory(connection));
  const report = { sourceCount: 0, versionCount: 0, pending: 0, embedded: 0, canonicalOnly: 0,
    invalidSource: 0, invalidVersion: 0, missingParent: 0, duplicateParent: 0, baseMismatch: 0,
    conflicts: 0, uncoveredVersions: 0, sourceBytes: 0, provenanceBytes: 0, sources: [] };
  const manifest = new Map(), parents = new Set(), identities = new Map(), digest = createHash('sha256');
  const sources = [...new Set(CATALOG_VERSION_AUDITS.map(definition => definition.source))];
  for (const source of sources) {
    let count = 0;
    for await (const audit of scan(db.collection(source))) {
      if (++report.sourceCount > 10000) throw new Error('Audit migration budget exceeded');
      count++; const signature = fingerprint(audit);
      manifest.set(`${source}:${audit._id}`, signature); digest.update(`${source}\0${signature}\n`);
      report.sourceBytes += bytes(audit);
      const index = CATALOG_VERSION_AUDITS.findIndex(definition => definition.source === source && definition.type === audit.resourceType);
      const definition = CATALOG_VERSION_AUDITS[index];
      if (!definition || !validAudit(definition, audit)) { report.invalidSource++; continue; }
      const matches = await db.collection(definition.target).find(targetFilter(definition, audit), RAW).limit(2).toArray();
      if (matches.length !== 1) { report.missingParent++; continue; }
      const parent = matches[0], key = versionKey(definition, parent), change = metadata(audit);
      if (parents.has(key)) { report.duplicateParent++; continue; }
      parents.add(key);
      identities.set(`${source}:${audit._id}`, key);
      if (fingerprint(catalogAuditRecord(definition, parent, change)) !== signature) { report.baseMismatch++; continue; }
      if (!await validVersion(models[index], parent, change)) { report.invalidVersion++; continue; }
      const base = { ...parent }; delete base.changeAudit;
      report.provenanceBytes += bytes({ ...base, changeAudit: change }) - bytes(base);
      if (!Object.hasOwn(parent, 'changeAudit')) report.pending++;
      else if (await validVersion(models[index], parent, parent.changeAudit)
        && fingerprint(catalogAuditRecord(definition, parent)) === signature) report.embedded++;
      else report.conflicts++;
    }
    report.sources.push({ name: source, count });
  }
  const versionDigest = createHash('sha256');
  for (const [index, definition] of CATALOG_VERSION_AUDITS.entries()) {
    for await (const parent of scan(db.collection(definition.target))) {
      if (++report.versionCount > 10000) throw new Error('Version migration budget exceeded');
      const key = versionKey(definition, parent);
      if (!Object.hasOwn(parent, 'changeAudit')) {
        versionDigest.update(`${key}\0MISSING\0${fingerprint(parent)}\n`);
        if (!parents.has(key)) report.uncoveredVersions++;
        continue;
      }
      if (!parent.changeAudit || !await validVersion(models[index], parent, parent.changeAudit)) { report.invalidVersion++; continue; }
      const audit = catalogAuditRecord(definition, parent);
      versionDigest.update(`${key}\0${fingerprint(audit)}\n`);
      if (!validAudit(definition, audit)) { report.invalidVersion++; continue; }
      const identity = `${definition.source}:${audit._id}`, previous = identities.get(identity);
      if (previous && previous !== key) report.conflicts++;
      identities.set(identity, key);
      if (!parents.has(key)) report.canonicalOnly++;
    }
  }
  report.digest = digest.digest('hex');
  report.versionDigest = versionDigest.digest('hex');
  return { report, manifest };
}

function assertReady(report, digest, completed = false) {
  if (report.digest !== digest || ['invalidSource', 'invalidVersion', 'missingParent', 'duplicateParent', 'baseMismatch',
    'conflicts', 'uncoveredVersions'].some(key => report[key]) || completed && report.pending) throw new Error('Catalog provenance invariants/digest failed');
}

export async function migrateCatalogAudits({ connection, apply = false, expectedDigest }) {
  const { report, manifest } = await inspect(connection);
  if (!apply) return { state: 'DRY_RUN', ...report };
  assertReady(report, expectedDigest);
  let applied = 0;
  for (const source of report.sources) {
    for await (const item of scan(connection.db.collection(source.name))) {
      const changed = await connection.transaction(async session => {
        const audit = await connection.db.collection(source.name).findOne({ _id: item._id }, { ...RAW, session });
        if (!audit || fingerprint(audit) !== manifest.get(`${source.name}:${item._id}`)) throw new Error('Legacy audit changed');
        const definition = CATALOG_VERSION_AUDITS.find(value => value.source === source.name && value.type === audit.resourceType);
        const collection = connection.db.collection(definition.target);
        const parent = await collection.findOne(targetFilter(definition, audit), { ...RAW, session });
        if (!parent || fingerprint(catalogAuditRecord(definition, parent, metadata(audit))) !== fingerprint(audit)) throw new Error('Canonical version facts changed');
        if (Object.hasOwn(parent, 'changeAudit')) {
          if (!parent.changeAudit || fingerprint(catalogAuditRecord(definition, parent)) !== fingerprint(audit)) throw new Error('Existing provenance conflict');
          return false;
        }
        const result = await collection.updateOne({ _id: parent._id, changeAudit: { $exists: false } },
          { $set: { changeAudit: metadata(audit) } }, { session });
        if (result.modifiedCount !== 1) throw new Error('Concurrent provenance write');
        return true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      if (changed) applied++;
    }
  }
  const verified = (await inspect(connection)).report;
  assertReady(verified, report.digest, true);
  if (verified.sourceCount !== report.sourceCount) throw new Error('New legacy events require catch-up');
  return { state: 'EMBEDDED_SOURCES_RETAINED', ...verified, applied };
}

export async function finalizeCatalogAuditStorage({ connection, apply = false, expectedDigest, writersDrained = false }) {
  const { report } = await inspect(connection);
  const result = { state: 'CLEANUP_DRY_RUN', ...report, dropCollections: report.sources.map(source => source.name) };
  if (!apply) return result;
  if (!writersDrained) throw new Error('Old catalog writers must drain first');
  assertReady(report, expectedDigest, true);
  for (const definition of CATALOG_VERSION_AUDITS) {
    const info = await connection.db.listCollections({ name: definition.target }).next();
    if (JSON.stringify(info?.options?.validator) !== JSON.stringify(catalogProvenanceValidator(definition.type))
      || info.options.validationLevel !== 'strict' || info.options.validationAction !== 'error') {
      throw new Error('Operator must install the reviewed required-provenance validator');
    }
  }
  assertReady((await inspect(connection)).report, report.digest, true);
  for (const source of result.dropCollections) {
    if (await connection.db.listCollections({ name: source }).hasNext()) await connection.db.collection(source).drop();
  }
  return { ...result, state: 'AUDITS_EMBEDDED_AND_DUPLICATE_STORES_REMOVED' };
}

// Before old-code rollback: reconstruct all old records, including new versions
// committed since cutover. Keep embedded metadata; do not restore the entire DB.
export async function restoreCatalogAuditStores({ connection, apply = false, expectedDigest, writersDrained = false }) {
  const { report } = await inspect(connection);
  if (!apply) return { state: 'RESTORE_DRY_RUN', ...report, sourceDigest: report.digest,
    digest: report.versionDigest, reconstructable: report.embedded + report.canonicalOnly };
  if (!writersDrained) throw new Error('Catalog writers must drain before reverse migration');
  if (expectedDigest !== report.versionDigest) throw new Error('Canonical audit view changed');
  assertReady(report, report.digest, true);
  let restored = 0;
  for (const definition of CATALOG_VERSION_AUDITS) {
    const destination = connection.db.collection(definition.source);
    for await (const parent of scan(connection.db.collection(definition.target))) {
      if (!parent.changeAudit) throw new Error('Version lacks verified provenance');
      const audit = catalogAuditRecord(definition, parent), existing = await destination.findOne({ _id: audit._id }, RAW);
      if (existing) { if (fingerprint(existing) !== fingerprint(audit)) throw new Error('Reverse audit conflict'); }
      else { await destination.insertOne(audit); restored++; }
    }
    await destination.createIndex({ resourceId: 1, occurredAt: -1 });
  }
  const verified = (await inspect(connection)).report;
  assertReady(verified, verified.digest, true);
  if (verified.canonicalOnly || verified.sourceCount !== verified.versionCount || verified.versionDigest !== report.versionDigest) {
    throw new Error('Reverse coverage incomplete or canonical writers still active');
  }
  return { state: 'LEGACY_AUDITS_RECONSTRUCTED', ...verified, restored,
    next: 'Operator must relax required-provenance validators before old-code activation' };
}
