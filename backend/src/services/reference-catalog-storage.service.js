import { referenceCatalogCollectionOptions, referenceCatalogIndexes } from '../models/reference-catalog.storage.js';

function same(value, other) {
  if (Array.isArray(value)) return Array.isArray(other) && value.length === other.length && value.every((item, index) => same(item, other[index]));
  if (value && typeof value === 'object') return other && Object.keys(value).length === Object.keys(other).length && Object.keys(value).every(key => same(value[key], other[key]));
  return value === other;
}

function compatible(index, expected) {
  return JSON.stringify(index.key) === JSON.stringify(expected.key)
    && Boolean(index.unique) === Boolean(expected.unique)
    && same(index.partialFilterExpression, expected.partialFilterExpression)
    && !index.sparse && index.expireAfterSeconds === undefined && index.hidden !== true && !index.collation;
}

export async function assertReferenceCatalogStorage(db) {
  const info = await db.listCollections({ name: 'reference_catalog' }, { nameOnly: false }).next();
  if (!info || info.options.collation || !same(info.options.validator, referenceCatalogCollectionOptions.validator)
    || (info.options.validationLevel ?? 'strict') !== 'strict' || (info.options.validationAction ?? 'error') !== 'error') throw new Error('REFERENCE_CATALOG_VALIDATOR_NOT_READY');
  const indexes = await db.collection('reference_catalog').listIndexes().toArray();
  if (indexes.length !== 3 || referenceCatalogIndexes.some(expected => !indexes.some(index => compatible(index, expected)))) throw new Error('REFERENCE_CATALOG_INDEX_NOT_READY');
}

export async function provisionReferenceCatalogStorage(db) {
  await db.createCollection('reference_catalog', referenceCatalogCollectionOptions).catch(error => { if (error.code !== 48) throw error; });
  // Existing incompatible validator/indexes fail closed; no implicit collMod/drop.
  const info = await db.listCollections({ name: 'reference_catalog' }, { nameOnly: false }).next();
  if (info.options.collation || !same(info.options.validator, referenceCatalogCollectionOptions.validator)
    || (info.options.validationLevel ?? 'strict') !== 'strict' || (info.options.validationAction ?? 'error') !== 'error') throw new Error('REFERENCE_CATALOG_VALIDATOR_NOT_READY');
  const indexes = await db.collection('reference_catalog').listIndexes().toArray();
  if (indexes.some(index => index.name !== '_id_' && !referenceCatalogIndexes.some(expected => index.name === expected.name && compatible(index, expected)))) throw new Error('REFERENCE_CATALOG_INDEX_CONFLICT');
  await db.collection('reference_catalog').createIndexes(referenceCatalogIndexes);
  await assertReferenceCatalogStorage(db);
}
