import { describe, expect, test } from '@jest/globals';
import { createPetListService } from '../../src/services/pet-list.service.js';

const CUSTOMER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_CUSTOMER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const PET_IDS = [
  '000000000000000000000001',
  '000000000000000000000002',
  '000000000000000000000003',
  '000000000000000000000004',
  '000000000000000000000005',
];

function petRecord({
  id = PET_IDS[0], ownerId = CUSTOMER_ID, name = 'Milo', species = 'DOG', state = 'ACTIVE',
  version = 0, createdAt = new Date('2026-01-01T00:00:00.000Z'),
} = {}) {
  return {
    _id: id,
    ownerId,
    name,
    species,
    state,
    version,
    createdAt,
    updatedAt: createdAt,
    medicalNotes: 'synthetic private field',
    source: { intakeForm: 'synthetic private field' },
  };
}

function matchesCondition(value, condition) {
  if (!condition || typeof condition !== 'object' || condition instanceof Date) return value === condition;
  if ('$lt' in condition) return new Date(value).getTime() < new Date(condition.$lt).getTime();
  return false;
}

function matchesPet(pet, filter) {
  if (filter.$or) {
    const matchesCursor = filter.$or.some(branch => {
      if (branch.createdAt?.$lt) return matchesCondition(pet.createdAt, branch.createdAt);
      return pet.createdAt.getTime() === branch.createdAt.getTime() && pet._id < branch._id.$lt;
    });
    if (!matchesCursor) return false;
  }
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return true;
    return matchesCondition(pet[key], value);
  });
}

function createInMemoryPetModel(initialPets = []) {
  const pets = initialPets.map(pet => ({ ...pet }));
  const calls = { find: [], findOne: [], findOneAndUpdate: [], create: [] };
  let nextId = 100;

  class Query {
    constructor(execute) {
      this.execute = execute;
    }

    sort(order) {
      this.order = order;
      return this;
    }

    limit(count) {
      this.count = count;
      return this;
    }

    select(fields) {
      this.fields = fields;
      return this;
    }

    async lean() {
      let result = await this.execute();
      if (Array.isArray(result)) {
        result = [...result];
        if (this.order) {
          const [[field, direction]] = Object.entries(this.order);
          result.sort((left, right) => {
            const leftValue = left[field] instanceof Date ? left[field].getTime() : left[field];
            const rightValue = right[field] instanceof Date ? right[field].getTime() : right[field];
            const compared = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
            return compared * direction;
          });
        }
        if (this.count !== undefined) result = result.slice(0, this.count);
      }
      return result;
    }
  }

  const Pet = {
    find(filter) {
      calls.find.push(filter);
      return new Query(() => pets.filter(pet => matchesPet(pet, filter)));
    },
    findOne(filter) {
      calls.findOne.push(filter);
      return new Query(() => pets.find(pet => matchesPet(pet, filter)) ?? null);
    },
    findOneAndUpdate(filter, update, options) {
      calls.findOneAndUpdate.push({ filter, update, options });
      return new Query(() => {
        const pet = pets.find(row => matchesPet(row, filter));
        if (!pet) return null;
        Object.assign(pet, update.$set);
        for (const [field, amount] of Object.entries(update.$inc ?? {})) pet[field] += amount;
        pet.updatedAt = new Date();
        return pet;
      });
    },
    async create(document) {
      calls.create.push(document);
      const now = new Date();
      const pet = {
        ...document,
        _id: `0000000000000000000000${nextId++}`.slice(-24),
        createdAt: now,
        updatedAt: now,
      };
      pets.push(pet);
      return pet;
    },
  };

  return { Pet, pets, calls };
}

const customer = (overrides = {}) => ({
  userId: CUSTOMER_ID,
  state: 'ACTIVE',
  roles: ['CUSTOMER'],
  ...overrides,
});

describe('pet list service', () => {
  test('requires an active authenticated Customer actor', async () => {
    const { Pet } = createInMemoryPetModel();
    const service = createPetListService({ Pet });

    await expect(service.list()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await expect(service.list({ actor: customer({ state: 'DISABLED' }) }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await expect(service.list({ actor: customer({ userId: 'not-an-object-id' }) }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    await expect(service.list({ actor: customer({ roles: ['PET_SITTER'] }) }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(service.list({ actor: customer({ roles: ['UNKNOWN'] }) }))
      .rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  test('lists only active pets owned by the Customer and returns safe cursor pages', async () => {
    const { Pet, calls } = createInMemoryPetModel([
      petRecord({ id: PET_IDS[0], name: 'First', createdAt: new Date('2026-01-05T00:00:00.000Z') }),
      petRecord({ id: PET_IDS[1], name: 'Second', createdAt: new Date('2026-01-04T00:00:00.000Z') }),
      petRecord({ id: PET_IDS[2], name: 'Third', createdAt: new Date('2026-01-03T00:00:00.000Z') }),
      petRecord({ id: PET_IDS[3], ownerId: OTHER_CUSTOMER_ID, name: 'Other owner' }),
      petRecord({ id: PET_IDS[4], state: 'ARCHIVED', name: 'Archived' }),
    ]);
    const service = createPetListService({ Pet });

    const firstPage = await service.list({ actor: customer(), limit: '2' });
    expect(firstPage.items.map(pet => pet.name)).toEqual(['First', 'Second']);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items[0]).toEqual({
      id: PET_IDS[0], name: 'First', species: 'DOG', state: 'ACTIVE', version: 0,
      createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z',
    });
    expect(firstPage.items[0]).not.toHaveProperty('ownerId');
    expect(firstPage.items[0]).not.toHaveProperty('medicalNotes');
    expect(firstPage.items[0]).not.toHaveProperty('source');
    expect(Object.isFrozen(firstPage.items)).toBe(true);
    expect(Object.isFrozen(firstPage.items[0])).toBe(true);

    const secondPage = await service.list({ actor: customer(), cursor: firstPage.nextCursor });
    expect(secondPage.items.map(pet => pet.name)).toEqual(['Third']);
    expect(secondPage.nextCursor).toBeNull();
    expect(calls.find[0]).toEqual({ ownerId: CUSTOMER_ID, state: 'ACTIVE' });
    expect(calls.find[1]).toMatchObject({ ownerId: CUSTOMER_ID, state: 'ACTIVE', $or: expect.any(Array) });
  });

  test('creates from allowlisted fields and derives owner from the actor', async () => {
    const { Pet, calls } = createInMemoryPetModel();
    const service = createPetListService({ Pet });

    const created = await service.create({ actor: customer(), body: { name: '  Milo  ', species: 'DOG' } });
    expect(calls.create).toEqual([{
      ownerId: CUSTOMER_ID, name: 'Milo', species: 'DOG', state: 'ACTIVE', version: 0,
    }]);
    expect(created).toMatchObject({ name: 'Milo', species: 'DOG', state: 'ACTIVE', version: 0 });
    expect(created).not.toHaveProperty('ownerId');
    expect(created).not.toHaveProperty('medicalNotes');

    await expect(service.create({ actor: customer(), body: { name: 'Milo', species: 'DOG', ownerId: OTHER_CUSTOMER_ID } }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.create({ actor: customer(), body: { name: 'Milo', species: 'DOG', commandId: 'key-from-header' } }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.create({ actor: customer(), body: { name: '  ', species: 'DOG' } }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', details: { fieldErrors: { name: expect.any(String) } } });
    await expect(service.create({ actor: customer(), body: { name: 'Milo', species: 'BIRD' } }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED', details: { fieldErrors: { species: expect.any(String) } } });
    await expect(service.create({ actor: customer(), body: null }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('archives with a version compare-and-set and reports stale versions', async () => {
    const { Pet, calls } = createInMemoryPetModel([
      petRecord({ id: PET_IDS[0], version: 4 }),
      petRecord({ id: PET_IDS[1], ownerId: OTHER_CUSTOMER_ID }),
    ]);
    const service = createPetListService({ Pet });

    const archived = await service.archive({ actor: customer(), petId: PET_IDS[0], expectedVersion: 4 });
    expect(archived).toMatchObject({ id: PET_IDS[0], state: 'ARCHIVED', version: 5 });
    expect(archived).not.toHaveProperty('ownerId');
    expect(calls.findOneAndUpdate[0]).toMatchObject({
      filter: { _id: PET_IDS[0], ownerId: CUSTOMER_ID, state: 'ACTIVE', version: 4 },
      update: { $set: { state: 'ARCHIVED' }, $inc: { version: 1 } },
      options: { returnDocument: 'after', runValidators: true },
    });

    await expect(service.archive({ actor: customer(), petId: PET_IDS[0], expectedVersion: 4 }))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    await expect(service.archive({ actor: customer(), petId: PET_IDS[1], expectedVersion: 0 }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
    await expect(service.archive({ actor: customer(), petId: PET_IDS[2], expectedVersion: 0 }))
      .rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
  });

  test('validates list pagination and archive request values', async () => {
    const { Pet } = createInMemoryPetModel();
    const service = createPetListService({ Pet });

    await expect(service.list({ actor: customer(), limit: 0 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.list({ actor: customer(), limit: '2x' }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.list({ actor: customer(), cursor: 'invalid cursor' }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.archive({ actor: customer(), petId: 'bad-id', expectedVersion: 0 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    await expect(service.archive({ actor: customer(), petId: PET_IDS[0], expectedVersion: -1 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });
});
