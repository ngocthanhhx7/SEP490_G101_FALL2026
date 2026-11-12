import { beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { userModel } from '../../src/models/user.model.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { matchingModels } from '../../src/models/sitter-matching.model.js';

let replica, connection, definitions;
const oid = () => new mongoose.Types.ObjectId();
const time = new Date('2026-11-08T00:00:00Z');
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_guard_schema', autoCreate: false, autoIndex: false }).asPromise();
  const User = userModel(connection), { Pet, CustomerAddress } = petCareModels(connection);
  const { SitterStatus } = sitterApplicationModels(connection), { SitterMatchingProfile } = matchingModels(connection);
  definitions = [
    { Model: User, fields: ['contractGuard', 'schedulingGuardVersion'], seed: () => ({ displayName: 'Synthetic worker', roles: ['PET_SITTER'], state: 'ACTIVE' }) },
    { Model: Pet, fields: ['bookingGuard'], seed: () => ({ ownerId: oid(), name: 'Synthetic pet', species: 'DOG', breedCode: 'synthetic', weightKg: 5 }) },
    { Model: CustomerAddress, fields: ['bookingGuard'], seed: () => ({ ownerId: oid(), label: 'Synthetic address', location: 'Synthetic location', point: { type: 'Point', coordinates: [105.8, 21] }, areaCode: 'synthetic', pointConfirmedAt: time }) },
    { Model: SitterStatus, fields: ['schedulingGuardVersion'], seed: () => ({ userId: oid(), status: 'ACTIVE', changedAt: time }) },
    { Model: SitterMatchingProfile, fields: ['schedulingGuardVersion'], seed: () => ({ userId: oid(), serviceIds: [oid()], species: ['DOG'], areaCodes: ['synthetic'], maxWeightKg: 20, maxPets: 2, windows: [] }) }
  ];
  for (const { Model } of definitions) { await Model.createCollection(); await Model.createIndexes(); }
}, 600000);
beforeEach(async () => { for (const { Model } of definitions) await Model.deleteMany({}); });
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('legacy records stay sparse, raw guard writes validate and ordinary reads/saves keep guards private and intact', async () => {
  for (const { Model, fields, seed } of definitions) {
    const created = await Model.create(seed()), id = created._id;
    let raw = await Model.collection.findOne({ _id: id });
    for (const field of fields) expect(raw).not.toHaveProperty(field);
    await Model.collection.updateOne({ _id: id }, { $inc: Object.fromEntries(fields.map(field => [field, 3])) });
    raw = await Model.collection.findOne({ _id: id });
    // Previously strict:'throw' rejected these persisted records at construction.
    await expect(new Model(raw).validate()).resolves.toBeUndefined();
    const publicRecord = await Model.findById(id);
    for (const field of fields) expect(publicRecord.toObject()).not.toHaveProperty(field);
    const internal = await Model.findById(id).select(fields.map(field => '+' + field).join(' '));
    for (const field of fields) expect(internal[field]).toBe(3);
    const modifiable = Model.modelName === 'User' ? 'displayName' : Model.modelName === 'Pet' ? 'name'
      : Model.modelName === 'CustomerAddress' ? 'label' : Model.modelName === 'SitterStatus' ? 'statusReason' : 'maxPets';
    publicRecord[modifiable] = modifiable === 'maxPets' ? 3 : 'Synthetic ordinary edit';
    await publicRecord.save();
    raw = await Model.collection.findOne({ _id: id });
    for (const field of fields) expect(raw[field]).toBe(3);
    // Domain writers keep using raw $inc; ODM can also represent the same field.
    await Model.updateOne({ _id: id }, { $inc: Object.fromEntries(fields.map(field => [field, 1])) });
    raw = await Model.collection.findOne({ _id: id });
    for (const field of fields) expect(raw[field]).toBe(4);
  }
});

test('declared guards reject fractional, negative and unsafe values without defaults or guard indexes', async () => {
  for (const { Model, fields, seed } of definitions) for (const field of fields) {
    for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity]) {
      await expect(new Model({ ...seed(), [field]: value }).validate()).rejects.toHaveProperty('errors.' + field);
    }
    const absent = new Model(seed());
    expect(absent[field]).toBeUndefined();
    expect(Model.schema.indexes().some(([keys]) => Object.hasOwn(keys, field))).toBe(false);
  }
});

test('parent guard still conflicts with concurrent eligibility change and abort rolls back the increment', async () => {
  const { Model: User, seed } = definitions[0];
  const user = await User.create(seed()), session = await connection.startSession();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' } });
    await User.collection.findOne({ _id: user._id }, { session });
    // A separate transaction changes eligibility after the first snapshot.
    await User.updateOne({ _id: user._id }, { $set: { state: 'LOCKED' } });
    await expect(User.collection.updateOne({ _id: user._id, state: 'ACTIVE' },
      { $inc: { schedulingGuardVersion: 1 } }, { session })).rejects.toMatchObject({ code: 112 });
    await session.abortTransaction();
    expect(await User.collection.findOne({ _id: user._id })).not.toHaveProperty('schedulingGuardVersion');
    await expect(connection.transaction(async transaction => {
      await User.collection.updateOne({ _id: user._id }, { $inc: { contractGuard: 1 } }, { session: transaction });
      throw new Error('Synthetic abort');
    })).rejects.toThrow('Synthetic abort');
    expect(await User.collection.findOne({ _id: user._id })).not.toHaveProperty('contractGuard');
  } finally { await session.endSession(); }
});
