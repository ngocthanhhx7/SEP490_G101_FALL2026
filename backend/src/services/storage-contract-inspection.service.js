import { isDeepStrictEqual } from 'node:util';
import { financeSourceIndexes } from './settlements/source-provisioning.js';
import { schedulingSourceIndexes } from './employee-scheduling/scheduling-storage.service.js';
import { referenceCatalogCollectionOptions, referenceCatalogIndexes } from '../models/reference-catalog.storage.js';
import { CATALOG_VERSION_AUDITS, catalogProvenanceValidator } from '../models/catalog-change-provenance.model.js';
import { rawOperationalCollections, rawOperationalCollectionOptions } from '../models/raw-operational.storage.js';
import { singleAccountRoleOptions } from '../models/user-role.storage.js';

const MAX_TIME_MS = 5000;
const collationFields = ['locale', 'caseLevel', 'caseFirst', 'strength', 'numericOrdering',
  'alternate', 'maxVariable', 'backwards', 'normalization'];
const orderedKey = key => JSON.stringify(Object.entries(key));
const simple = collation => !collation || collation.locale === 'simple';

// Compare all behavioral fields. Locale-specific implicit defaults are deliberately
// unverified unless the manifest explicitly provides the complete contract.
function compareCollation(actual, expected) {
  if (simple(expected)) return simple(actual) ? [] : ['collation'];
  const incomplete = collationFields.some(field => !Object.hasOwn(expected, field));
  const changed = collationFields.some(field => Object.hasOwn(expected, field) && actual?.[field] !== expected[field]);
  return [...(changed ? ['collation'] : []), ...(incomplete ? ['collationDefaultsUnasserted'] : [])];
}

export function compareStorageIndex(actual, expected, collectionOptions = {}) {
  const differences = [];
  if (orderedKey(actual.key) !== orderedKey(expected.key)) differences.push('key');
  if (expected.requireName && actual.name !== expected.name) differences.push('name');
  for (const field of ['unique', 'sparse', 'hidden']) {
    if (Boolean(actual[field]) !== Boolean(expected[field])) differences.push(field);
  }
  for (const field of ['partialFilterExpression', 'expireAfterSeconds']) {
    if (!isDeepStrictEqual(actual[field], expected[field])) differences.push(field);
  }
  differences.push(...compareCollation(actual.collation, expected.collation ?? collectionOptions.collation));
  return differences;
}

export function buildStorageContractManifest({ connection, env = {}, catalogProvenance = 'unasserted' }) {
  if (!['required', 'optional', 'unasserted'].includes(catalogProvenance)) throw new TypeError('Invalid provenance contract');
  const stores = new Map();
  function store(name) {
    if (!stores.has(name)) stores.set(name, { name, indexes: [], options: { collation: { locale: 'simple' } }, sources: [] });
    return stores.get(name);
  }
  function add(name, key, options = {}, source = 'raw') {
    const entry = store(name), expected = { key, ...options };
    if (!entry.indexes.some(index => isDeepStrictEqual(index, expected))) entry.indexes.push(expected);
    if (!entry.sources.includes(source)) entry.sources.push(source);
  }
  for (const model of Object.values(connection.models)) {
    if (model.baseModelName) continue; // Discriminator predicates are not separate physical indexes.
    store(model.collection.name).sources.push(model.modelName);
    for (const [key, options] of model.schema.indexes()) add(model.collection.name, key, options, model.modelName);
    if (model.schema.options.collation) store(model.collection.name).options.collation = model.schema.options.collation;
  }
  if (env.FINANCE_SOURCES_ENABLED === 'true') {
    for (const name of ['bookings', 'visits', 'payments', 'taxassessments', 'paymentintents', 'cases', 'refunds']) store(name);
    for (const [name, key, options] of financeSourceIndexes) add(name, key, { ...options, requireName: true }, 'finance-source');
    for (const name of rawOperationalCollections) Object.assign(store(name).options, rawOperationalCollectionOptions(name));
  }
  if (env.EMPLOYEE_SCHEDULING_ENABLED === 'true') {
    for (const [name, key] of schedulingSourceIndexes) add(name, key, {}, 'employee-scheduling');
  }
  if (env.BOOKING_CHECKOUT_ENABLED === 'true' || env.FINANCE_SOURCES_ENABLED === 'true') {
    // Existing readiness permits either direction after an equality owner prefix.
    store('bookings').bookingOwnerCursor = true;
  }
  if (stores.has('reference_catalog')) {
    const entry = store('reference_catalog');
    entry.indexes = referenceCatalogIndexes;
    entry.options = { ...referenceCatalogCollectionOptions, collation: { locale: 'simple' } };
    entry.exactIndexes = true;
  }
  if (stores.has('users')) Object.assign(store('users').options, singleAccountRoleOptions);
  if (catalogProvenance !== 'unasserted') {
    for (const definition of CATALOG_VERSION_AUDITS) {
      if (!stores.has(definition.target)) continue;
      Object.assign(store(definition.target).options, { validator: catalogProvenanceValidator(definition.type, catalogProvenance === 'required'),
        validationLevel: 'strict', validationAction: 'error' });
    }
  }
  return { version: 1, catalogProvenance, collections: [...stores.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

async function bounded(cursor, limit) {
  const rows = [];
  try {
    for await (const row of cursor) {
      if (rows.length === limit) throw new Error('METADATA_BUDGET');
      rows.push(row);
    }
    return rows;
  } finally { await cursor.close(); }
}

export async function inspectStorageContracts({ db, manifest }) {
  const report = { readOnly: true, manifestVersion: manifest.version, catalogProvenance: manifest.catalogProvenance,
    maxTimeMS: MAX_TIME_MS, critical: [], performance: [], unasserted: [], checkedCollections: 0, checkedIndexes: 0 };
  function finding(severity, collection, code, details = {}) { report[severity].push({ collection, code, ...details }); }
  let metadata;
  try { metadata = await bounded(db.listCollections({}, { nameOnly: false, maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }), 256); }
  catch { finding('critical', null, 'COLLECTION_METADATA_UNAVAILABLE'); return { ...report, state: 'NOT_READY' }; }
  const names = new Set(manifest.collections.map(entry => entry.name));
  for (const info of metadata) if (!info.name.startsWith('system.') && !names.has(info.name)) report.unasserted.push({ collection: info.name, scope: 'collection' });
  for (const entry of manifest.collections) {
    const info = metadata.find(row => row.name === entry.name);
    if (!info) { finding('critical', entry.name, 'COLLECTION_MISSING'); continue; }
    if (info.type !== 'collection') { finding('critical', entry.name, 'COLLECTION_TYPE'); continue; }
    report.checkedCollections++;
    const actualOptions = info.options ?? {};
    const collationDifferences = compareCollation(actualOptions.collation, entry.options.collation);
    if (collationDifferences.length) finding('critical', entry.name, 'COLLECTION_COLLATION', { differences: collationDifferences });
    if (entry.options.validator) {
      if (!isDeepStrictEqual(actualOptions.validator, entry.options.validator)
        || (actualOptions.validationLevel ?? 'strict') !== entry.options.validationLevel
        || (actualOptions.validationAction ?? 'error') !== entry.options.validationAction) finding('critical', entry.name, 'VALIDATOR_DRIFT');
    } else report.unasserted.push({ collection: entry.name, scope: 'validator' });
    let indexes;
    try { indexes = await bounded(db.collection(entry.name).listIndexes({ maxTimeMS: MAX_TIME_MS, timeoutMS: MAX_TIME_MS }), 512); }
    catch { finding('critical', entry.name, 'INDEX_METADATA_UNAVAILABLE'); continue; }
    const matched = new Set(['_id_']);
    if (!indexes.some(index => index.name === '_id_' && orderedKey(index.key) === orderedKey({ _id: 1 }))) finding('critical', entry.name, 'PRIMARY_INDEX_MISSING');
    for (const expected of entry.indexes) {
      report.checkedIndexes++;
      const sameKeys = indexes.filter(index => orderedKey(index.key) === orderedKey(expected.key));
      const compatible = sameKeys.find(index => compareStorageIndex(index, expected, entry.options).length === 0);
      if (compatible) { matched.add(compatible.name); continue; }
      const severity = expected.unique || expected.expireAfterSeconds !== undefined ? 'critical' : 'performance';
      finding(severity, entry.name, sameKeys.length ? 'INDEX_OPTIONS_DRIFT' : 'INDEX_MISSING', {
        key: expected.key, differences: sameKeys.length ? compareStorageIndex(sameKeys[0], expected, entry.options) : [] });
    }
    if (entry.bookingOwnerCursor) {
      const compatible = indexes.find(index => Object.keys(index.key).join(',') === 'customerId,_id'
        && [1, -1].includes(index.key.customerId) && [1, -1].includes(index.key._id)
        && compareStorageIndex(index, { key: index.key }, entry.options).length === 0);
      if (compatible) matched.add(compatible.name);
      else finding('performance', entry.name, 'BOOKING_OWNER_CURSOR_INDEX_MISSING');
    }
    for (const index of indexes) if (!matched.has(index.name)) {
      // Unexpected unique constraints can reject legitimate writes; unexpected TTL
      // can delete records. Never downgrade these to a performance-only warning.
      finding(entry.exactIndexes || index.unique || index.expireAfterSeconds !== undefined ? 'critical' : 'performance',
        entry.name, 'UNMATCHED_INDEX', { index: index.name, key: index.key });
    }
  }
  report.state = report.critical.length ? 'NOT_READY' : report.performance.length ? 'READY_WITH_WARNINGS' : 'READY';
  return report;
}
