import {
  exact,
  fail,
  number,
  point
} from '../validators/pet-care.validator.js';

const text = (value, max = 100) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value)
  )
    fail('VALIDATION_FAILED', 'Invalid text');
  return value.trim();
};

export function createPetCareManagement({ repository, clock = Date.now }) {
  const { models } = repository;
  return {
    async catalog() {
      const [breeds, traits] = await Promise.all([
        models.PetBreed.find({ active: true })
          .select('code name species -_id')
          .sort({ species: 1, name: 1 })
          .limit(200)
          .lean(),
        models.PetTrait.find({ active: true })
          .select('code label species explanation -_id')
          .sort({ code: 1 })
          .limit(100)
          .lean()
      ]);
      return { breeds, traits };
    },
    async listPets(ownerId) {
      return models.Pet.find({ ownerId, state: 'ACTIVE' })
        .sort({ _id: 1 })
        .limit(100)
        .lean();
    },
    async listAddresses(ownerId) {
      return models.CustomerAddress.find({ ownerId, state: 'ACTIVE' })
        .select('label areaCode version pointConfirmedAt')
        .sort({ _id: 1 })
        .limit(100)
        .lean();
    },
    async createPet(ownerId, body) {
      exact(
        body,
        [
          'name',
          'species',
          'breedCode',
          'weightKg',
          'traits',
          'careNeedsConfirmed'
        ],
        ['name', 'species', 'breedCode', 'weightKg', 'careNeedsConfirmed']
      );
      text(body.name);
      text(body.breedCode, 80);
      number(body.weightKg, 0.1, 150);
      if (
        !['DOG', 'CAT'].includes(body.species) ||
        typeof body.careNeedsConfirmed !== 'boolean'
      )
        fail('VALIDATION_FAILED', 'Invalid pet');
      const traits = body.traits ?? [];
      if (
        !Array.isArray(traits) ||
        traits.length > 20 ||
        new Set(traits).size !== traits.length
      )
        fail('VALIDATION_FAILED', 'Invalid traits');
      traits.forEach((t) => text(t, 80));
      const [breed, count] = await Promise.all([
        models.PetBreed.exists({
          code: body.breedCode,
          species: body.species,
          active: true
        }),
        models.PetTrait.countDocuments({
          code: { $in: traits },
          species: body.species,
          active: true
        })
      ]);
      if (!breed || count !== traits.length)
        fail('VALIDATION_FAILED', 'Unknown breed or trait');
      const doc = await models.Pet.create({
        ...body,
        traits,
        ownerId,
        state: 'ACTIVE',
        version: 0
      });
      return { id: String(doc._id), version: 0 };
    },
    async createAddress(ownerId, body) {
      exact(
        body,
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed'],
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed']
      );
      point(body.coordinates);
      text(body.label);
      text(body.location, 500);
      text(body.areaCode, 80);
      if (body.pointConfirmed !== true)
        fail('ADDRESS_CONFIRMATION_REQUIRED', 'Confirm the map pin');
      const doc = await models.CustomerAddress.create({
        ownerId,
        label: body.label,
        location: body.location,
        areaCode: body.areaCode,
        point: { type: 'Point', coordinates: body.coordinates },
        pointConfirmedAt: new Date(clock()),
        version: 0
      });
      return { id: String(doc._id), version: 0 };
    }
  };
}
