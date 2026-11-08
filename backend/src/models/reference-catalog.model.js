import { Schema } from 'mongoose';
import { selectReferenceCatalogSource } from './reference-catalog-source.js';
import { referenceCatalogCollectionOptions, referenceCatalogIndexes } from './reference-catalog.storage.js';

const SPECIES = ['DOG', 'CAT'];
const baseOptions = {
  strict: 'throw',
  bufferCommands: false,
  versionKey: false,
  timestamps: true,
  discriminatorKey: 'kind',
  collectionOptions: referenceCatalogCollectionOptions
};

const baseSchema = new Schema({
  kind: { type: String, enum: ['BREED', 'TRAIT'], required: true, immutable: true, select: false },
  code: { type: String, required: true, maxlength: 80 },
  active: { type: Boolean, default: true }
}, baseOptions);
for (const { key, ...options } of referenceCatalogIndexes) baseSchema.index(key, options);

const breedSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  species: { type: String, enum: SPECIES, required: true },
  source: { type: String, required: true, maxlength: 500 }
}, { _id: false, strict: 'throw' });

const traitSchema = new Schema({
  label: { type: String, required: true, maxlength: 160 },
  species: { type: [String], required: true, enum: SPECIES },
  explanation: { type: String, required: true, maxlength: 1000 }
}, { _id: false, strict: 'throw' });

function baseModel(connection) {
  return connection.models.ReferenceCatalogEntry
    ?? connection.model('ReferenceCatalogEntry', baseSchema, 'reference_catalog');
}

export function referenceCatalogModels(connection) {
  if (!connection?.models || typeof connection.model !== 'function') {
    throw new TypeError('Database connection is required');
  }
  selectReferenceCatalogSource(connection, 'target');
  const Entry = baseModel(connection);
  const Breed = connection.models.ReferenceCatalogBreed
    ?? Entry.discriminator('ReferenceCatalogBreed', breedSchema, 'BREED');
  const Trait = connection.models.ReferenceCatalogTrait
    ?? Entry.discriminator('ReferenceCatalogTrait', traitSchema, 'TRAIT');
  // Mongoose marks discriminator keys selected during registration. Hide the
  // internal routing field again so existing inclusive projections stay exact.
  Breed.schema.path('kind').select(false);
  Trait.schema.path('kind').select(false);
  return Object.freeze({
    ReferenceCatalogEntry: Entry,
    PetBreed: Breed,
    PetTrait: Trait
  });
}

export const referenceCatalogSpecies = Object.freeze([...SPECIES]);
