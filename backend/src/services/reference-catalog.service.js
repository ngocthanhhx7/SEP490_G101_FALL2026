import { petCareModels } from '../models/pet-care.model.js';
import { referenceCatalogSource } from '../models/reference-catalog-source.js';

function sourceModels(connection, source) {
  return petCareModels(connection, { referenceCatalog: source });
}

function boundedLimit(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError('Invalid reference catalog limit');
  return value;
}

export function createReferenceCatalogFacade({ connection, source = referenceCatalogSource(connection) } = {}) {
  if (!['legacy', 'target'].includes(source)) throw new TypeError('Invalid reference catalog source');
  const models = sourceModels(connection, source);
  return Object.freeze({
    source,
    models: Object.freeze({ PetBreed: models.PetBreed, PetTrait: models.PetTrait }),
    listBreeds: ({ active = true, limit = 200 } = {}) => models.PetBreed.find({ ...(active === undefined ? {} : { active }) })
      .select('code name species -_id').sort({ species: 1, name: 1 }).limit(boundedLimit(limit, 200)).lean(),
    listTraits: ({ active = true, limit = 100 } = {}) => models.PetTrait.find({ ...(active === undefined ? {} : { active }) })
      .select('code label species explanation -_id').sort({ code: 1 }).limit(boundedLimit(limit, 100)).lean(),
    existsBreed: ({ code, species, active = true }) => models.PetBreed.exists({ code, species, ...(active === undefined ? {} : { active }) }),
    countTraits: ({ codes, species, active = true }) => models.PetTrait.countDocuments({ code: { $in: codes }, species, ...(active === undefined ? {} : { active }) })
  });
}
