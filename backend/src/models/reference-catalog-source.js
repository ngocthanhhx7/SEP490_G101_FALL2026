const choices = new WeakMap();
const LEGACY = ['aibreeds', 'aitraits'];
// Production switches only after the reviewed additive migration/shadow gate.
// This shared default covers runtime and operator CLIs without rewriting .env.
export const defaultReferenceCatalogSource = () => process.env.NODE_ENV === 'production' ? 'target' : 'legacy';

export function referenceCatalogSource(connection) {
  return choices.get(connection) ?? defaultReferenceCatalogSource();
}

export function selectReferenceCatalogSource(connection, source = referenceCatalogSource(connection)) {
  if (!connection?.models || !['legacy', 'target'].includes(source)) throw new TypeError('Invalid reference catalog source');
  if (choices.has(connection) && choices.get(connection) !== source) throw new Error('REFERENCE_CATALOG_SOURCE_LOCKED');
  const names = Object.values(connection.models).map(model => model.collection.name);
  if (source === 'target' && names.some(name => LEGACY.includes(name))) throw new Error('REFERENCE_CATALOG_LEGACY_REGISTRY');
  if (source === 'legacy' && names.includes('reference_catalog')) throw new Error('REFERENCE_CATALOG_TARGET_REGISTRY');
  choices.set(connection, source);
  return source;
}

export function assertReferenceCatalogModels(connection) {
  selectReferenceCatalogSource(connection);
}

export function referenceCatalogCliSource(argv = process.argv.slice(2)) {
  const flags = argv.filter(arg => arg.startsWith('--reference-catalog'));
  if (flags.length > 1 || (flags.length && !['--reference-catalog=legacy', '--reference-catalog=target'].includes(flags[0]))) throw new TypeError('Invalid reference catalog argument');
  return flags[0]?.split('=')[1] ?? defaultReferenceCatalogSource();
}
