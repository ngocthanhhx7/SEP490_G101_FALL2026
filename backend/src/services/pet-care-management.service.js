import {
  exact,
  fail,
  number,
  point,
  id,
  digest
} from '../validators/pet-care.validator.js';
import { careProfileInput } from '../validators/customer-care.validator.js';

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

export function createPetCareManagement({ repository, clock = Date.now, coverageAreas = [] }) {
  const { models } = repository;
  async function command(ownerId, operation, key, body, execute) {
    id(ownerId);
    if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Idempotency key required');
    const commandId = digest([ownerId, operation, key]), fingerprint = digest(body);
    for (let attempt = 0; ; attempt++) {
      const session = await repository.connection.startSession();
      try {
        // Plain command results need no Mongoose document rollback tracking.
        return await session.withTransaction(async () => {
          const previous = await models.PetCareCommand.findById(commandId).session(session).lean();
          if (previous) {
            if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_REUSED', 'Command key reused', 409);
            return previous.result;
          }
          const result = await execute(session);
          await models.PetCareCommand.create([{ _id: commandId, fingerprint, result }], { session });
          return result;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
      finally { await session.endSession(); }
    }
  }
  const petView = doc => ({ ...doc, id: String(doc._id), _id: undefined, ownerId: undefined });
  const addressView = doc => ({ id: String(doc._id), label: doc.label, location: doc.location,
    areaCode: doc.areaCode, coordinates: doc.point?.coordinates, pointConfirmedAt: doc.pointConfirmedAt,
    privateAccessNotes: doc.privateAccessNotes ?? '', version: doc.version, state: doc.state });
  async function addressValues(body) {
    point(body.coordinates); text(body.label); text(body.location, 500); text(body.areaCode, 80);
    if (coverageAreas.length && !coverageAreas.some(row => row.code === body.areaCode)) fail('VALIDATION_FAILED', 'Choose a supported work area');
    if (body.pointConfirmed !== true) fail('ADDRESS_CONFIRMATION_REQUIRED', 'Confirm the map pin');
    if (body.privateAccessNotes !== undefined && (typeof body.privateAccessNotes !== 'string' || body.privateAccessNotes.length > 1000)) fail('VALIDATION_FAILED', 'Invalid access notes');
    return { label: body.label.trim(), location: body.location.trim(), areaCode: body.areaCode,
      privateAccessNotes: body.privateAccessNotes ?? '', point: { type: 'Point', coordinates: body.coordinates },
      pointConfirmedAt: new Date(clock()) };
  }
  async function petValues(body) {
    text(body.name); text(body.breedCode, 80); number(body.weightKg, 0.1, 150);
    if (!['DOG', 'CAT'].includes(body.species) || typeof body.careNeedsConfirmed !== 'boolean') fail('VALIDATION_FAILED', 'Invalid pet');
    const traits = body.traits ?? [];
    if (!Array.isArray(traits) || traits.length > 20 || new Set(traits).size !== traits.length) fail('VALIDATION_FAILED', 'Invalid traits');
    traits.forEach(t => text(t, 80));
    const [breed, count] = await Promise.all([
      models.PetBreed.exists({ code: body.breedCode, species: body.species, active: true }),
      models.PetTrait.countDocuments({ code: { $in: traits }, species: body.species, active: true })
    ]);
    if (!breed || count !== traits.length) fail('VALIDATION_FAILED', 'Unknown breed or trait');
    return { name: body.name.trim(), species: body.species, breedCode: body.breedCode, weightKg: body.weightKg,
      traits, careNeedsConfirmed: body.careNeedsConfirmed, ...careProfileInput(body) };
  }
  const petKeys = ['name', 'species', 'breedCode', 'weightKg', 'traits', 'careNeedsConfirmed', 'ageMonths', 'sex', 'careProfile'];
  const addressKeys = ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed', 'privateAccessNotes'];
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
      return { breeds, traits, workAreas: coverageAreas.map(({ code, label }) => ({ code, label })) };
    },
    async listPets(ownerId) {
      return models.Pet.find({ ownerId, state: 'ACTIVE' })
        .sort({ _id: 1 })
        .limit(100)
        .lean().then(rows => rows.map(petView));
    },
    async listAddresses(ownerId, management = false) {
      return models.CustomerAddress.find({ ownerId, state: 'ACTIVE' })
        .select(management ? '+location +point +privateAccessNotes' : 'label areaCode version pointConfirmedAt')
        .sort({ _id: 1 })
        .limit(100)
        .lean().then(rows => management ? rows.map(addressView) : rows);
    },
    async createPet(ownerId, body, key) {
      if (key) {
        exact(body, petKeys, ['name', 'species', 'breedCode', 'weightKg', 'careNeedsConfirmed']);
        return command(ownerId, 'CREATE_PET', key, body, async session => {
          const values = await petValues(body);
          const [doc] = await models.Pet.create([{ ...values, ownerId, state: 'ACTIVE', version: 0 }], { session });
          return { id: String(doc._id), version: 0 };
        });
      }
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
    async createAddress(ownerId, body, key) {
      if (key) {
        exact(body, addressKeys, ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed']);
        return command(ownerId, 'CREATE_ADDRESS', key, body, async session => {
          const values = await addressValues(body);
          const [doc] = await models.CustomerAddress.create([{ ...values, ownerId, version: 0 }], { session });
          return { id: String(doc._id), version: 0 };
        });
      }
      exact(
        body,
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed'],
        ['label', 'location', 'coordinates', 'areaCode', 'pointConfirmed']
      );
      point(body.coordinates);
      text(body.label);
      text(body.location, 500);
      text(body.areaCode, 80);
      if (coverageAreas.length && !coverageAreas.some(row => row.code === body.areaCode))
        fail('VALIDATION_FAILED', 'Choose a supported work area');
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
    },
    async update(ownerId, kind, resourceId, body, key) {
      id(resourceId);
      const isPet = kind === 'pet', Model = isPet ? models.Pet : models.CustomerAddress;
      exact(body, [...(isPet ? petKeys : addressKeys), 'expectedVersion'], ['expectedVersion']);
      number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
      return command(ownerId, `UPDATE_${kind}:${resourceId}`, key, body, async session => {
        const values = isPet ? await petValues(body) : await addressValues(body);
        const update = { $set: values, $inc: { version: 1 } };
        if (isPet && body.ageMonths === undefined) update.$unset = { ageMonths: 1 };
        const doc = await Model.findOneAndUpdate({ _id: resourceId, ownerId, state: 'ACTIVE', version: body.expectedVersion },
          update, { returnDocument: 'after', session, runValidators: true });
        if (!doc) fail('VERSION_CONFLICT', 'Owned active record unavailable or changed', 409);
        return { id: String(doc._id), version: doc.version };
      });
    },
    async archive(ownerId, kind, resourceId, body, key) {
      id(resourceId); exact(body, ['expectedVersion'], ['expectedVersion']);
      number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
      const Model = kind === 'pet' ? models.Pet : models.CustomerAddress;
      return command(ownerId, `ARCHIVE_${kind}:${resourceId}`, key, body, async session => {
        const doc = await Model.findOneAndUpdate({ _id: resourceId, ownerId, state: 'ACTIVE', version: body.expectedVersion },
          { $set: { state: 'ARCHIVED' }, $inc: { version: 1 } }, { returnDocument: 'after', session });
        if (!doc) fail('VERSION_CONFLICT', 'Owned active record unavailable or changed', 409);
        return { id: String(doc._id), version: doc.version };
      });
    }
  };
}
