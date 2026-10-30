import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { petCareModels } from '../../src/models/pet-care.model.js';
import { provisionHanoiDemo } from '../../src/services/hanoi-demo-population.service.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';
import { createCheckoutAvailabilityService } from '../../src/services/booking-proposals/checkout-availability.service.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { createPricingService } from '../../src/services/pricing/pricing.service.js';
import { DEMO_WORK_AREAS } from '../../src/constants/demo-work-areas.js';

let replica, connection;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_hanoi_population' }).asPromise();
  await provisionDemoCatalog({ connection });
  const { PetBreed } = petCareModels(connection);
  await PetBreed.create([{ code: 'demo-dog', species: 'DOG', name: 'Chó demo', source: 'Fixture' },
    { code: 'demo-cat', species: 'CAT', name: 'Mèo demo', source: 'Fixture' }]);
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('seeds linked Hanoi fixtures once, preserves live records, and yields eligible directed candidates', async () => {
  const preserved = { _id: new mongoose.Types.ObjectId(), displayName: 'Preserved account', state: 'ACTIVE', roles: ['CUSTOMER'] };
  await connection.collection('users').insertOne(preserved);
  const auth = { contactLookupSecret: 'x'.repeat(32), contactEncryptionKey: 'y'.repeat(32) };
  const result = await provisionHanoiDemo({ connection, auth });
  expect(result).toMatchObject({ state: 'APPLIED', sitters: 42, customers: 21, pets: 42, zones: 21, trainingEligible: false });
  expect(await provisionHanoiDemo({ connection, auth })).toMatchObject({ state: 'ALREADY_APPLIED' });
  expect(await connection.collection('users').findOne({ _id: preserved._id })).toEqual(preserved);
  expect(await connection.collection('users').countDocuments({ fixtureKey: /^hanoi-coursework/ })).toBe(64);
  for (const name of ['contacts','payments','bookings','aivisitoutcomes','airankmodels']) expect(await connection.collection(name).countDocuments()).toBe(0);
  const customer = await connection.models.User.findOne({ fixtureKey: /:customer-2$/ }).lean();
  const pet = await connection.models.Pet.findOne({ ownerId: customer._id, species: 'DOG' }).lean();
  const address = await connection.models.CustomerAddress.findOne({ ownerId: customer._id }).lean();
  const service = await connection.collection('services').findOne({ code: 'home-care' });
  const clock = () => Date.parse('2026-11-01T00:00:00Z');
  const pricing = createPricingService({ repository: createPricingRepository(connection, clock), clock });
  const quote = await pricing.basket(String(customer._id), { items: [{ serviceId: String(service._id), petIds: [String(pet._id)], durationMinutes: 60, visitCount: 1 }] });
  const repository = createEmployeeScheduleRepository({ connection, clock, coverageAreas: DEMO_WORK_AREAS });
  const availability = createCheckoutAvailabilityService({ connection, repository, clock });
  const search = await availability.search({ userId: String(customer._id), roles: ['CUSTOMER'], state: 'ACTIVE' }, {
    quoteId: quote.quoteId, visit: { itemIndex: 0, startAt: '2026-11-03T02:00:00Z', location: 'HOME', addressId: String(address._id) } });
  expect(search.sitters.length).toBeGreaterThan(0);
  expect(search.sitters.every(row => row.displayName.endsWith('(Demo)'))).toBe(true);
});
