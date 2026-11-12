import { createHash } from 'node:crypto';
export const catalogIndexManifestDigest = manifest => createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

export const redundantCatalogIndexes = Object.freeze([
  { collection: 'servicepriceversions', name: 'serviceId_1_effectiveAt_-1_version_-1', key: { serviceId: 1, effectiveAt: -1, version: -1 },
    required: [{ serviceId: 1, version: 1 }, { serviceId: 1, effectiveAt: 1 }] },
  { collection: 'systemsettingversions', name: 'key_1_effectiveAt_-1_version_-1', key: { key: 1, effectiveAt: -1, version: -1 },
    required: [{ key: 1, version: 1 }, { key: 1, effectiveAt: 1 }] }
]);
export async function inspectCatalogIndexRetirement(db) {
  const stores = [];
  for (const spec of redundantCatalogIndexes) {
    const indexes = await db.collection(spec.collection).listIndexes().toArray();
    const candidate = indexes.find(index => index.name === spec.name);
    if (!candidate || JSON.stringify(candidate.key) !== JSON.stringify(spec.key)
      || Object.keys(candidate).some(key => !['v', 'key', 'name'].includes(key))) throw new Error('CATALOG_INDEX_CANDIDATE_CHANGED');
    if (spec.required.some(keys => !indexes.some(index => index.unique === true && JSON.stringify(index.key) === JSON.stringify(keys)
      && !index.partialFilterExpression && !index.sparse && !index.collation && index.expireAfterSeconds === undefined))) {
      throw new Error('CATALOG_INDEX_UNIQUENESS_REQUIRED');
    }
    stores.push({ collection: spec.collection, indexes: indexes.sort((a, b) => a.name.localeCompare(b.name)), candidate });
  }
  const manifest = { database: db.databaseName, stores };
  return { manifest, digest: catalogIndexManifestDigest(manifest), indexes: 2 };
}
export async function retireCatalogIndexes({ db, expectedDigest, writersFrozen }) {
  if (!writersFrozen) throw new Error('CATALOG_INDEX_FREEZE_REQUIRED');
  const dry = await inspectCatalogIndexRetirement(db);
  if (!expectedDigest || expectedDigest !== dry.digest) throw new Error('CATALOG_INDEX_DIGEST_MISMATCH');
  const completed = [];
  try {
    for (const spec of redundantCatalogIndexes) {
      await db.collection(spec.collection).dropIndex(spec.name); completed.push(spec);
    }
    return { state: 'RETIRED', completed: completed.map(row => ({ collection: row.collection, name: row.name })) };
  } catch (error) { error.completed = completed.map(row => ({ collection: row.collection, name: row.name })); throw error; }
}
export async function restoreCatalogIndexes({ db, writersFrozen }) {
  if (!writersFrozen) throw new Error('CATALOG_INDEX_FREEZE_REQUIRED');
  for (const spec of redundantCatalogIndexes) {
    const indexes = await db.collection(spec.collection).listIndexes().toArray();
    const existing = indexes.find(index => index.name === spec.name);
    if (existing && (JSON.stringify(existing.key) !== JSON.stringify(spec.key)
      || Object.keys(existing).some(key => !['v', 'key', 'name'].includes(key)))) throw new Error('CATALOG_INDEX_RESTORE_CONFLICT');
    if (!existing) await db.collection(spec.collection).createIndex(spec.key, { name: spec.name });
  }
  return { state: 'RESTORED', indexes: 2 };
}
