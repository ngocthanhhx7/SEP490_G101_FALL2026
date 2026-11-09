import { test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { referenceCatalogModels } from '../../src/models/reference-catalog.model.js';
import { applyReferenceCatalog, catalogCanonical, inspectReferenceCatalog } from '../../src/services/reference-catalog-migration.service.js';
import { runReferenceCatalogMigration } from '../../scripts/migrations/reference-catalog.js';
import { createReferenceCatalogFacade } from '../../src/services/reference-catalog.service.js';
import { referenceCatalogCliSource } from '../../src/models/reference-catalog-source.js';

function fakeDb(collections) {
  return { collection: name => ({ find: () => ({
    async *[Symbol.asyncIterator]() { yield* collections[name] ?? []; }, async close() {}
  }) }) };
}
const oid = () => new mongoose.Types.ObjectId();
const breed = { _id: oid(), code: 'same-code', name: 'Poodle', species: 'DOG', active: true, source: 'fixture' };
const trait = { _id: oid(), code: 'same-code', label: 'Calm', species: ['DOG', 'CAT'], explanation: 'fixture', active: true };

test('typed discriminators preserve scalar breed and array trait species', async () => {
  const connection = mongoose.createConnection();
  try {
    const models = referenceCatalogModels(connection);
    expect(models.PetBreed.collection.name).toBe('reference_catalog');
    expect(models.PetTrait.collection.name).toBe('reference_catalog');
    expect(models.PetBreed.schema.discriminatorMapping.value).toBe('BREED');
    expect(models.PetTrait.schema.discriminatorMapping.value).toBe('TRAIT');
    expect(models.PetBreed.schema.path('species').instance).toBe('String');
    expect(models.PetTrait.schema.path('species').instance).toBe('Array');
    expect(models.PetBreed.schema.path('label')).toBeUndefined();
    expect(() => new models.PetBreed({ ...breed, unexpected: true })).toThrow();
    expect(new models.PetBreed(breed).validateSync()).toBeUndefined();
    expect(new models.PetTrait(trait).validateSync()).toBeUndefined();
    expect(models.ReferenceCatalogEntry.schema.indexes()).toEqual(expect.arrayContaining([
      [{ kind: 1, code: 1 }, expect.objectContaining({ unique: true })]
    ]));
  } finally { await connection.destroy(); }
});

test('legacy default is stable and conflicting source choices are blocked', async () => {
  const connection = mongoose.createConnection();
  const targetConnection = mongoose.createConnection();
  try {
    const legacy = petCareModels(connection), target = petCareModels(targetConnection, { referenceCatalog: 'target' });
    expect(legacy.PetBreed.collection.name).toBe('aibreeds');
    expect(legacy.PetTrait.collection.name).toBe('aitraits');
    expect(target.PetBreed.collection.name).toBe('reference_catalog');
    expect(target.PetTrait.collection.name).toBe('reference_catalog');
    expect(() => petCareModels(connection, { referenceCatalog: 'target' })).toThrow('REFERENCE_CATALOG_SOURCE_LOCKED');
    expect(petCareModels(targetConnection).PetBreed).toBe(target.PetBreed);
    expect(() => createReferenceCatalogFacade({ connection: targetConnection, source: 'legacy' })).toThrow('REFERENCE_CATALOG_SOURCE_LOCKED');
    expect(Object.keys(target).sort()).toEqual(Object.keys(legacy).sort());
    expect(connection.models.PricingPolicy).toBeUndefined();
    expect(petCareModels(connection).PetBreed).toBe(legacy.PetBreed);
    expect(() => petCareModels(connection, { referenceCatalog: 'invalid' })).toThrow();
  } finally { await connection.destroy(); await targetConnection.destroy(); }
});

test('source CLI is explicit and rejects malformed or duplicate choices', () => {
  expect(referenceCatalogCliSource([])).toBe('legacy');
  expect(referenceCatalogCliSource(['--reference-catalog=target'])).toBe('target');
  expect(() => referenceCatalogCliSource(['--reference-catalog=wrong'])).toThrow();
  expect(() => referenceCatalogCliSource(['--reference-catalog=target', '--reference-catalog=legacy'])).toThrow();
});

test('dry-run is aggregate-only and allows same code in different kinds', async () => {
  const result = await runReferenceCatalogMigration(fakeDb({ aibreeds: [breed], aitraits: [trait] }));
  expect(result.blocked).toBe(false);
  expect(result.missing).toBe(2);
  expect(result.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain(breed.code);
  expect(result.rows).toBeUndefined();
});

test.each([
  ['unknown field', { aibreeds: [{ ...breed, unexpected: true }] }, 'UNKNOWN_FIELD'],
  ['wrong BSON type', { aibreeds: [{ ...breed, active: new mongoose.mongo.BSON.Int32(1) }] }, 'ACTIVE_TYPE'],
  ['wrong id type', { aibreeds: [{ ...breed, _id: 'string-id' }] }, 'ID_TYPE'],
  ['scalar trait species', { aitraits: [{ ...trait, species: 'DOG' }] }, 'TRAIT_SPECIES_TYPE'],
  ['unknown reference', { pets: [{ _id: oid(), species: 'DOG', breedCode: 'unknown', traits: [] }] }, 'UNKNOWN_REFERENCE'],
  ['reference type', { pets: [{ _id: oid(), species: 'DOG', breedCode: breed.code, traits: 7 }] }, 'REFERENCE_TYPE'],
  ['reference species', { pets: [{ _id: oid(), species: 'CAT', breedCode: breed.code, traits: [] }] }, 'REFERENCE_SPECIES'],
  ['id collision', { aitraits: [{ ...trait, _id: breed._id }] }, 'CROSS_KIND_ID_COLLISION'],
  ['duplicate code', { aibreeds: [breed, { ...breed, _id: oid() }] }, 'DUPLICATE_CODE'],
  ['target conflict', { reference_catalog: [{ ...breed, kind: 'BREED', name: 'Changed' }] }, 'TARGET_CONFLICT'],
  ['unknown target kind', { reference_catalog: [{ ...breed, kind: 'OTHER' }] }, 'UNKNOWN_KIND']
])('%s blocks migration', async (_label, override, code) => {
  const result = await inspectReferenceCatalog(fakeDb({ aibreeds: [breed], aitraits: [trait], ...override }));
  expect(result.summary.blocked).toBe(true);
  expect(result.summary.errors[code]).toBeGreaterThan(0);
});

test('digest preserves BSON types, dates and field absence', () => {
  expect(catalogCanonical({ value: new mongoose.mongo.BSON.Int32(1) })).not.toBe(catalogCanonical({ value: new mongoose.mongo.BSON.Double(1) }));
  expect(catalogCanonical({ value: oid() })).not.toBe(catalogCanonical({ value: 'text' }));
  expect(catalogCanonical({ value: new Date(0) })).not.toBe(catalogCanonical({ value: '1970-01-01T00:00:00.000Z' }));
  expect(catalogCanonical({})).not.toBe(catalogCanonical({ active: true }));
});

test('document/byte limits and apply guards fail closed', async () => {
  const db = fakeDb({ aibreeds: [breed, { ...breed, _id: oid(), code: 'other' }] });
  await expect(inspectReferenceCatalog(db, { maxDocs: 1 })).rejects.toThrow('SCAN_DOCUMENT_LIMIT');
  await expect(inspectReferenceCatalog(db, { maxBytes: 1 })).rejects.toThrow('SCAN_BYTE_LIMIT');
  await expect(inspectReferenceCatalog(db, { maxDocs: NaN })).rejects.toThrow('INVALID_SCAN_LIMIT');
  await expect(applyReferenceCatalog(db)).rejects.toThrow('WRITERS_FREEZE_REQUIRED');
  await expect(applyReferenceCatalog(db, { writersFrozen: true })).rejects.toThrow('SOURCE_DIGEST_REQUIRED');
  await expect(applyReferenceCatalog(db, { writersFrozen: true, expectedDigest: '0'.repeat(64) })).rejects.toThrow('SOURCE_DIGEST_MISMATCH');
  await expect(runReferenceCatalogMigration(db, ['--unknown'])).rejects.toThrow('UNKNOWN_ARGUMENT');
});
