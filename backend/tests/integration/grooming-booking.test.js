import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { groomingRuntimeModule } from '../../src/routes/grooming.routes.js';
import { registerModules } from '../../src/routes/module-registry.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { provisionInitialCatalog } from '../../src/services/initial-catalog-provisioning.service.js';
import { provisionServiceDetails } from '../../src/services/service-details-provisioning.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { provisionCustomerTierStorage } from '../../src/services/customer-tier-storage.service.js';
import { provisionGroomingStorage } from '../../src/services/grooming/grooming-storage.service.js';
import { createGroomingShopServices } from '../../src/services/grooming/grooming-shop-services.service.js';
import { createShopShiftSource } from '../../src/services/grooming/shop-shift-source.service.js';
import { createGroomingSlots } from '../../src/services/grooming/grooming-slots.service.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { groomingModels } from '../../src/models/grooming-appointment.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { serviceModel } from '../../src/models/service.model.js';
import { groomingLocalDate } from '../../src/utils/grooming-slot-time.js';

const oid = () => new mongoose.Types.ObjectId();
const ADDRESS = 'Cửa hàng Paw World, 25 Láng Hạ, Đống Đa';
const DAY = 86400000, HOUR = 3600000;
// The clock sits on the day after provisioning so every catalog version is already effective.
const TODAY = groomingLocalDate(Date.now() + DAY);
const at = (date, time) => new Date(`${date}T${time}:00+07:00`);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const NOW = at(TODAY, '08:00').getTime();
const SHOP_CODES = ['pet-bathing', 'hair-trimming', 'nail-trimming', 'ear-eye-cleaning', 'coat-brushing'];
const WINDOWS = [1, 2, 3, 4, 5, 6, 7].flatMap(weekday => [
  { weekday, startLocalTime: '08:00', endLocalTime: '12:00' }, { weekday, startLocalTime: '14:00', endLocalTime: '17:00' }
]);
const actors = Object.fromEntries(['CUSTOMER', 'CUSTOMER2', 'STAFF', 'PET_SITTER', 'ADMIN'].map(role =>
  [role, { userId: String(oid()), roles: [role === 'CUSTOMER2' ? 'CUSTOMER' : role], state: 'ACTIVE' }]));
let replica, connection, server, base, db, services, pets, repository, payroll, scheduling, product;
const sid = code => String(services[code]);
const call = (method, path, role = 'CUSTOMER', csrf = true) => {
  const req = request(base)[method](`/api/v1/grooming${path}`);
  if (role) req.set('x-test-role', role);
  if (method !== 'get') { req.set('Origin', base); if (csrf) req.set('X-CSRF-Token', 'synthetic-csrf'); }
  return req;
};
const pet = (name, code, answers = {}) => ({ petId: String(pets[name]._id), serviceIds: code.map(sid), answers: { biteOrScratch: 'NO', skinCondition: 'NO', ...answers } });
const slotBody = (date, ...rows) => ({ date, pets: rows.map(({ petId, serviceIds }) => ({ petId, serviceIds })) });
const slotsOf = async (date, ...rows) => (await call('post', '/slots').send(slotBody(date, ...rows)).expect(200)).body.data.slots;
const times = slots => slots.map(slot => `${slot.time}:${slot.state[0]}`);

async function sitter({ type = 'FULL_TIME', codes = SHOP_CODES, windows = WINDOWS, dayOff = [], capabilityActive = true, verified = true,
  signedAt = new Date(NOW - 30 * DAY), effectiveAt = new Date(NOW - 30 * DAY), endsAt, synthetic = false, statusActive = true } = {}) {
  const _id = oid();
  await db.collection('users').insertOne({ _id, displayName: `Synthetic sitter ${_id}`, roles: ['PET_SITTER'], state: 'ACTIVE', ...(synthetic ? { synthetic: true } : {}) });
  await db.collection('sitterstatuses').insertOne({ userId: _id, status: statusActive ? 'ACTIVE' : 'SUSPENDED' });
  await payroll.EmploymentContract.create({ employeeId: _id, version: 1, employmentType: type, salaryBasis: 'GROSS', monthlyBaseVnd: 10000000, payCycle: 'MONTHLY',
    weeklyMinutes: 2400, signedAt, effectiveAt, ...(endsAt ? { endsAt } : {}), contractReference: 'SYNTHETIC-FIXTURE', workplaceRegion: 1,
    workplaceReference: 'Synthetic shop', ...(verified ? { verifiedBy: oid() } : { verifiedBy: oid() }), recordedAt: new Date(NOW - 30 * DAY) });
  if (!verified) await payroll.EmploymentContract.collection.updateOne({ employeeId: _id }, { $unset: { verifiedBy: '' } });
  await db.collection('aisitterprofiles').insertOne({ userId: _id, serviceIds: codes.map(code => services[code]), active: capabilityActive, dayOffDates: [] });
  await scheduling.EmployeeAvailability.create({ _id: String(_id), zone: 'Asia/Ho_Chi_Minh', workingWindows: windows, areas: [], dayOffDates: dayOff, state: 'ACTIVE', version: 1, effectiveFrom: '2000-01-01' });
  await scheduling.EmployeeAvailabilityRevision.create({ sitterId: String(_id), effectiveFrom: '2000-01-01', version: 1, workingWindows: windows });
  return _id;
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_grooming_booking' }).asPromise();
  db = connection.db;
  await provisionInitialCatalog({ connection }); await provisionServiceDetails(connection); await provisionDemoCatalog({ connection });
  repository = createPricingRepository(connection);
  for (const model of Object.values(repository.models)) { await model.createCollection(); await model.createIndexes(); }
  payroll = payrollModels(connection); scheduling = employeeSchedulingModels(connection); product = productSalesModels(connection);
  for (const model of [...Object.values(payroll), ...Object.values(scheduling)]) { await model.createCollection(); await model.createIndexes(); }
  for (const name of ['users', 'bookings', 'payments', 'productorders', 'sitterstatuses', 'aisitterprofiles', 'visits']) await db.createCollection(name).catch(() => {});
  await provisionCustomerTierStorage(connection); await provisionGroomingStorage(connection);
  await db.collection('customer_tier_policies').updateOne({ _id: 'current' }, { $set: {
    state: 'APPROVED', approvedAt: new Date(0), approvedBy: 'synthetic-reviewer', approvalReference: 'synthetic-fixture-only' } });
  const rows = await serviceModel(connection).find({}).select('code').lean();
  services = Object.fromEntries(rows.map(row => [row.code, row._id]));
  await repository.models.PetBreed.create([{ code: 'dog-mixed', name: 'Synthetic dog', species: 'DOG', active: true, source: 'synthetic fixture' },
    { code: 'cat-mixed', name: 'Synthetic cat', species: 'CAT', active: true, source: 'synthetic fixture' }]);
  const session = { authenticate: async req => actors[req.get('x-test-role')] ? { ...actors[req.get('x-test-role')], expiresAt: NOW + HOUR } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json(), requestId);
  registerModules(app, [groomingRuntimeModule({ connection, sessionService: session, clock: () => NOW,
    env: { GROOMING_BOOKING_ENABLED: 'true', BOOKING_FACILITY_ADDRESS: ADDRESS }, config: { auth: { enabled: true } } })]);
  app.use(errorHandler(() => {}));
  server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 600000);
afterAll(async () => { await new Promise(resolve => server?.close(resolve) ?? resolve()); await connection?.close(); await replica?.stop(); }, 30000);

beforeEach(async () => {
  for (const name of ['users', 'sitterstatuses', 'aisitterprofiles', 'visits', 'bookings', 'customer_tiers']) await db.collection(name).deleteMany({});
  for (const model of [payroll.EmploymentContract, scheduling.EmployeeAvailability, scheduling.EmployeeAvailabilityRevision, ...Object.values(groomingModels(connection))]) await model.deleteMany({});
  await product.ProductCustomerRefusal.collection.deleteMany({});
  await repository.models.Pet.deleteMany({});
  await db.collection('customer_tier_policies').updateOne({ _id: 'current' }, { $set: { state: 'APPROVED' } });
  await repository.models.PricingPolicy.updateMany({ status: 'RETIRED', approvalSource: 'synthetic-restore' }, { $set: { status: 'APPROVED' } });
  await db.collection('users').insertMany(Object.values(actors).map(actor => ({ _id: new mongoose.Types.ObjectId(actor.userId), roles: actor.roles, state: 'ACTIVE' })));
  const owner = actors.CUSTOMER.userId;
  const make = (name, species, breedCode, weightKg, more = {}) => repository.models.Pet.create({ ownerId: owner, name, species, breedCode, weightKg, traits: [], careNeedsConfirmed: true, ...more });
  pets = { Milo: await make('Milo', 'DOG', 'dog-mixed', 12), Bo: await make('Bơ', 'DOG', 'dog-mixed', 4), Muop: await make('Mướp', 'CAT', 'cat-mixed', 4) };
});

describe('options and access', () => {
  test('lists the five shop services, the fixed questions, the shop and the seven-day window', async () => {
    const data = (await call('get', '/options').expect(200)).body.data;
    expect(data.services.map(row => row.code).sort()).toEqual([...SHOP_CODES].sort());
    expect(data.services.every(row => row.bookable && row.durationMinutes > 0 && row.fromPriceVnd > 0)).toBe(true);
    expect(data.services.find(row => row.code === 'pet-bathing')).toMatchObject({ durationMinutes: 60, fromPriceVnd: 100000 });
    expect(data.services.find(row => row.code === 'hair-trimming')).toMatchObject({ durationMinutes: 90, fromPriceVnd: 200000 });
    expect(data.shop).toEqual({ address: ADDRESS, hotline: null });
    expect(data.window).toEqual({ slotMinutes: 60, firstDate: TODAY, lastDate: addDays(TODAY, 6), minLeadMinutes: 60 });
    expect(data.questions.map(row => row.code)).toEqual(['biteOrScratch', 'skinCondition']);
    expect(data.questions[0]).toMatchObject({ blocking: ['YES'], answers: [['NO', 'Không'], ['SOMETIMES', 'Đôi khi'], ['YES', 'Có']] });
  });

  test('home, boarding, health and massage services are not shop grooming services', async () => {
    const codes = (await call('get', '/options').expect(200)).body.data.services.map(row => row.code);
    for (const code of ['home-care', 'pet-boarding', 'basic-health-check', 'pet-massage', 'dog-walking', 'basic-training']) expect(codes).not.toContain(code);
  });

  test.each(['STAFF', 'PET_SITTER', 'ADMIN'])('%s cannot use any grooming endpoint', async role => {
    await call('get', '/options', role).expect(403);
    await call('post', '/slots', role).send({}).expect(403);
    await call('post', '/quotes', role).send({}).expect(403);
  });

  test('an anonymous caller gets 401 and a customer POST without CSRF gets 403', async () => {
    await call('get', '/options', null).expect(401);
    await call('post', '/quotes', null).send({}).expect(401);
    await call('post', '/quotes', 'CUSTOMER', false).send({}).expect(403);
  });

  test('the module is absent unless GROOMING_BOOKING_ENABLED is true and rejects an invalid flag', () => {
    const base = { connection, config: { auth: { enabled: true } } };
    expect(groomingRuntimeModule({ ...base, env: {} })).toBeNull();
    expect(groomingRuntimeModule({ ...base, env: { GROOMING_BOOKING_ENABLED: 'false' } })).toBeNull();
    expect(groomingRuntimeModule({ connection, config: { auth: { enabled: false } }, env: { GROOMING_BOOKING_ENABLED: 'true' } })).toBeNull();
    expect(() => groomingRuntimeModule({ ...base, env: { GROOMING_BOOKING_ENABLED: 'yes' } })).toThrow(TypeError);
  });

  test('a service without an APPROVED pricing policy is listed as not bookable and cannot be chosen', async () => {
    await repository.models.PricingPolicy.updateMany({ serviceId: services['pet-bathing'] }, { $set: { status: 'RETIRED', approvalSource: 'synthetic-restore' } });
    const data = (await call('get', '/options').expect(200)).body.data;
    expect(data.services.find(row => row.code === 'pet-bathing').bookable).toBe(false);
    expect(data.services.find(row => row.code === 'hair-trimming').bookable).toBe(true);
    await call('post', '/quotes').send({ pets: [pet('Bo', ['pet-bathing'])] }).expect(409).expect(res => expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE'));
    await sitter();
    await call('post', '/slots').send(slotBody(addDays(TODAY, 1), pet('Bo', ['pet-bathing']))).expect(409);
  });
});

describe('time slots', () => {
  test('a full-time sitter on a shop shift opens the slots inside the working hours, and no others', async () => {
    await sitter();
    expect(times(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toEqual(['08:00:A', '09:00:A', '10:00:A', '11:00:A', '14:00:A', '15:00:A', '16:00:A']);
  });

  test('today lists only slots starting at least sixty minutes from now', async () => {
    await sitter();
    expect(times(await slotsOf(TODAY, pet('Bo', ['pet-bathing'])))).toEqual(['09:00:A', '10:00:A', '11:00:A', '14:00:A', '15:00:A', '16:00:A']);
  });

  test('the lead time boundary is exact: 60 minutes is bookable and 59 minutes is not', async () => {
    await sitter();
    const shopServices = createGroomingShopServices({ connection, clock: () => NOW });
    const slotsAt = clock => createGroomingSlots({ connection, clock, shopServices, shiftSource: createShopShiftSource({ connection, clock }) })
      .list(actors.CUSTOMER.userId, { date: TODAY, pets: [{ petId: String(pets.Bo._id), serviceIds: [sid('pet-bathing')] }] });
    const exact = await slotsAt(() => at(TODAY, '07:00').getTime());
    expect(times(exact.slots)[0]).toBe('08:00:A');
    const late = await slotsAt(() => at(TODAY, '07:01').getTime());
    expect(times(late.slots)[0]).toBe('09:00:A');
  });

  test('the window is seven days: day six is listed, day seven is refused', async () => {
    await sitter();
    expect((await slotsOf(addDays(TODAY, 6), pet('Bo', ['pet-bathing']))).length).toBeGreaterThan(0);
    await call('post', '/slots').send(slotBody(addDays(TODAY, 7), pet('Bo', ['pet-bathing']))).expect(422);
    await call('post', '/slots').send(slotBody(addDays(TODAY, -1), pet('Bo', ['pet-bathing']))).expect(422);
  });

  test.each([
    ['a part-time sitter', { type: 'PART_TIME' }],
    ['a sitter without the service capability', { codes: ['hair-trimming'] }],
    ['an inactive capability record', { capabilityActive: false }],
    ['a day off', { dayOff: [addDays(TODAY, 1)] }],
    ['hours that never cover a whole slot', { windows: [1, 2, 3, 4, 5, 6, 7].map(weekday => ({ weekday, startLocalTime: '08:00', endLocalTime: '08:30' })) }],
    ['an unverified contract', { verified: false }],
    ['an expired contract', { endsAt: new Date(NOW - DAY) }],
    ['a contract not yet effective', { effectiveAt: new Date(NOW + 30 * DAY) }],
    ['a suspended sitter', { statusActive: false }],
    ['a synthetic account', { synthetic: true }]
  ])('%s opens no slot', async (_label, fixture) => {
    await sitter(fixture);
    expect(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']))).toEqual([]);
  });

  test('an assigned home visit removes the sitter from the overlapping slot only', async () => {
    const id = await sitter();
    await db.collection('visits').insertOne({ sitterId: id, state: 'ASSIGNED', startAt: at(addDays(TODAY, 1), '10:30'), endAt: at(addDays(TODAY, 1), '11:30') });
    expect(times(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toEqual(['08:00:A', '09:00:A', '14:00:A', '15:00:A', '16:00:A']);
    await db.collection('visits').updateOne({ sitterId: id }, { $set: { state: 'COMPLETED' } });
    expect((await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toHaveLength(7);
  });

  test('a slot whose places are all held is listed as full and the others stay open', async () => {
    await sitter();
    const { GroomingSlot } = groomingModels(connection);
    await GroomingSlot.create({ _id: `${addDays(TODAY, 1)}T09:00+07:00`, held: 1 });
    await GroomingSlot.create({ _id: `${addDays(TODAY, 1)}T15:00+07:00`, held: 1 });
    expect(times(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toEqual(['08:00:A', '09:00:F', '10:00:A', '11:00:A', '14:00:A', '15:00:F', '16:00:A']);
  });

  test('capacity is the number of sitters: two sitters keep a slot open after one place is held', async () => {
    await sitter(); await sitter();
    await groomingModels(connection).GroomingSlot.create({ _id: `${addDays(TODAY, 1)}T09:00+07:00`, held: 1 });
    const slots = await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']));
    expect(times(slots)).toContain('09:00:A');
    await groomingModels(connection).GroomingSlot.updateOne({ _id: `${addDays(TODAY, 1)}T09:00+07:00` }, { $set: { held: 2 } });
    expect(times(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toContain('09:00:F');
  });

  test('pets are groomed at the same time, so two pets need two places', async () => {
    await sitter();
    const two = await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']), pet('Milo', ['pet-bathing']));
    expect(two.map(slot => slot.state)).toEqual(Array(7).fill('FULL'));
    await sitter();
    expect((await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']), pet('Milo', ['pet-bathing']))).map(slot => slot.state)).toEqual(Array(7).fill('AVAILABLE'));
  });

  test('services of one pet run one after another and need every slot they cover', async () => {
    await sitter();
    // Bathing 60 + hair trimming 90 = 150 minutes = three slots.
    const slots = await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing', 'hair-trimming']));
    expect(times(slots)).toEqual(['08:00:A', '09:00:A', '10:00:F', '11:00:F', '14:00:A', '15:00:F', '16:00:F']);
  });

  test('a sitter must have every chosen service to be counted', async () => {
    await sitter({ codes: ['pet-bathing'] });
    expect(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing', 'hair-trimming']))).toEqual([]);
    expect((await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']))).length).toBe(7);
  });

  test('validation and ownership', async () => {
    await sitter();
    const good = pet('Bo', ['pet-bathing']);
    await call('post', '/slots').send({ date: addDays(TODAY, 1), pets: [] }).expect(422);
    await call('post', '/slots').send({ date: '2026-02-30', pets: [good] }).expect(422);
    await call('post', '/slots').send({ date: addDays(TODAY, 1), pets: [good], extra: 1 }).expect(422);
    await call('post', '/slots').send({ date: addDays(TODAY, 1), pets: [good, good] }).expect(422);
    await call('post', '/slots').send({ date: addDays(TODAY, 1), pets: [{ petId: good.petId, serviceIds: [] }] }).expect(422);
    await call('post', '/slots', 'CUSTOMER2').send(slotBody(addDays(TODAY, 1), good)).expect(404);
    await repository.models.Pet.updateOne({ _id: pets.Bo._id }, { $set: { state: 'ARCHIVED' } });
    await call('post', '/slots').send(slotBody(addDays(TODAY, 1), good)).expect(404);
    await call('post', '/slots').send(slotBody(addDays(TODAY, 1), { petId: String(pets.Milo._id), serviceIds: [String(services['home-care'])] })).expect(409);
  });
});

describe('final price', () => {
  const lines = row => row.lines.map(line => [line.label, line.sizeLabel, line.amountVnd]);

  test('prices each service by the pet size from the approved policy, per pet, with the tier discount on the total', async () => {
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'SILVER', asOf: new Date(NOW) });
    const body = { pets: [pet('Milo', ['pet-bathing', 'nail-trimming']), pet('Bo', ['pet-bathing', 'hair-trimming']), pet('Muop', ['pet-bathing'])] };
    const data = (await call('post', '/quotes').send(body).expect(200)).body.data;
    expect(data.currency).toBe('VND');
    expect(data.pets.map(row => row.name)).toEqual(['Milo', 'Bơ', 'Mướp']);
    // Medium dog (5 to 15 kg) +10%; dog under 5 kg no surcharge; medium cat (4 to 6 kg) +10%.
    expect(lines(data.pets[0])).toEqual([['Tắm và vệ sinh thú cưng', 'chó 5–15 kg', 110000], ['Cắt móng', 'chó 5–15 kg', 55000]]);
    expect(data.pets[0].priceVnd).toBe(165000);
    expect(lines(data.pets[1])).toEqual([['Tắm và vệ sinh thú cưng', 'chó dưới 5 kg', 100000], ['Cắt tỉa lông', 'chó dưới 5 kg', 200000]]);
    expect(data.pets[1].priceVnd).toBe(300000);
    expect(lines(data.pets[2])).toEqual([['Tắm và vệ sinh thú cưng', 'mèo 4–6 kg', 110000]]);
    expect(data.subtotalVnd).toBe(165000 + 300000 + 110000);
    expect(data.tier).toMatchObject({ code: 'SILVER', discountBps: 300, applied: true, blockedReason: null });
    expect(data.tier.discountVnd).toBe(17250);
    expect(data.totalVnd).toBe(575000 - 17250);
  });

  test('the combo discount, order tier and care-trait surcharges of home care never apply', async () => {
    await repository.models.Pet.updateOne({ _id: pets.Bo._id }, { $set: { traits: ['fleas', 'long-coat', 'stranger-fear'] } });
    const data = (await call('post', '/quotes').send({ pets: [pet('Bo', ['pet-bathing'])] }).expect(200)).body.data;
    expect(data.subtotalVnd).toBe(100000);
    expect(data.pets[0].lines).toHaveLength(1);
  });

  test.each([
    ['a Member without a tier record', null, 0, 'MEMBER'],
    ['Silver', 'SILVER', 300, 'SILVER'],
    ['Gold', 'GOLD', 500, 'GOLD']
  ])('%s gets the policy discount', async (_label, tier, bps, code) => {
    if (tier) await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier, asOf: new Date(NOW) });
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing', 'hair-trimming'])] }).expect(200)).body.data;
    expect(data.subtotalVnd).toBe(110000 + 220000);
    expect(data.tier).toMatchObject({ code, discountBps: bps, blockedReason: null });
    expect(data.tier.discountVnd).toBe(Math.floor(330000 * bps / 10000));
    expect(data.totalVnd).toBe(330000 - data.tier.discountVnd);
  });

  test('the discount is rounded down to a whole dong', async () => {
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'SILVER', asOf: new Date(NOW) });
    await db.collection('customer_tier_policies').updateOne({ _id: 'current' }, { $set: { 'discountsBps.SILVER': 333 } });
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['nail-trimming'])] }).expect(200)).body.data;
    expect(data.subtotalVnd).toBe(55000);
    expect(data.tier.discountVnd).toBe(1831);
    expect(data.totalVnd).toBe(53169);
  });

  test('an overdue bill keeps the tier but gives no discount', async () => {
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'GOLD', asOf: new Date(NOW) });
    await db.collection('bookings').insertOne({ customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), paymentState: 'OVERDUE' });
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'])] }).expect(200)).body.data;
    expect(data.tier).toEqual({ code: 'GOLD', discountBps: 0, discountVnd: 0, applied: false, blockedReason: 'OVERDUE' });
    expect(data.totalVnd).toBe(data.subtotalVnd);
  });

  test('a customer who may only pay in advance gets no discount; two refusals are still within the limit', async () => {
    const customerId = new mongoose.Types.ObjectId(actors.CUSTOMER.userId);
    await db.collection('customer_tiers').insertOne({ _id: customerId, tier: 'GOLD', asOf: new Date(NOW) });
    await product.ProductCustomerRefusal.collection.insertMany([{ customerId, orderId: oid() }, { customerId, orderId: oid() }]);
    expect((await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'])] }).expect(200)).body.data.tier).toMatchObject({ discountBps: 500, blockedReason: null });
    await product.ProductCustomerRefusal.collection.insertOne({ customerId, orderId: oid() });
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'])] }).expect(200)).body.data;
    expect(data.tier).toMatchObject({ code: 'GOLD', discountBps: 0, discountVnd: 0, applied: false, blockedReason: 'PREPAID_ONLY' });
  });

  test('an unapproved tier policy gives no discount instead of an error', async () => {
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'GOLD', asOf: new Date(NOW) });
    await db.collection('customer_tier_policies').updateOne({ _id: 'current' }, { $set: { state: 'DRAFT' } });
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'])] }).expect(200)).body.data;
    expect(data.tier).toMatchObject({ discountBps: 0, discountVnd: 0, applied: false, blockedReason: 'POLICY_UNAPPROVED' });
  });

  test('a pet that bites or scratches is referred to the shop (MSG63) and nothing is stored', async () => {
    const response = await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing']), pet('Bo', ['pet-bathing'], { biteOrScratch: 'YES' })] }).expect(422);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_PET_REFERRAL_REQUIRED', petId: String(pets.Bo._id), petName: 'Bơ', hotline: null });
    const { GroomingAppointment, GroomingSlot } = groomingModels(connection);
    expect(await GroomingAppointment.countDocuments()).toBe(0);
    expect(await GroomingSlot.countDocuments()).toBe(0);
  });

  test('"sometimes" biting and a skin condition can still be booked', async () => {
    const data = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'], { biteOrScratch: 'SOMETIMES', skinCondition: 'YES' })] }).expect(200)).body.data;
    expect(data.pets[0].priceVnd).toBe(110000);
  });

  test('validation, ownership and unavailable services', async () => {
    const good = pet('Bo', ['pet-bathing']);
    await call('post', '/quotes').send({ pets: [] }).expect(422);
    await call('post', '/quotes').send({ pets: [{ petId: good.petId, serviceIds: good.serviceIds }] }).expect(422);
    await call('post', '/quotes').send({ pets: [{ ...good, answers: { biteOrScratch: 'MAYBE', skinCondition: 'NO' } }] }).expect(422);
    await call('post', '/quotes').send({ pets: [{ ...good, answers: { biteOrScratch: 'NO' } }] }).expect(422);
    await call('post', '/quotes').send({ pets: [good, good] }).expect(422);
    await call('post', '/quotes', 'CUSTOMER2').send({ pets: [good] }).expect(404);
    await call('post', '/quotes').send({ pets: [{ ...good, serviceIds: [String(services['home-care'])] }] }).expect(409);
    await call('post', '/quotes').send({ pets: [{ ...good, serviceIds: [String(oid())] }] }).expect(409);
    // The cat is not supported by a dog-only service; the shop catalog has no such service, so a cat price still works.
    expect((await call('post', '/quotes').send({ pets: [pet('Muop', ['ear-eye-cleaning'])] }).expect(200)).body.data.pets[0].priceVnd).toBeGreaterThan(0);
  });
});

describe('storage', () => {
  test('provisioning creates the four collections with a unique appointment code and is repeatable', async () => {
    await provisionGroomingStorage(connection);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    for (const name of ['groomingappointments', 'groomingslots', 'groomingcommands', 'groomingcounters']) expect(names).toContain(name);
    const indexes = await groomingModels(connection).GroomingAppointment.collection.listIndexes().toArray();
    expect(indexes.some(row => row.unique && JSON.stringify(row.key) === JSON.stringify({ code: 1 }))).toBe(true);
    expect(indexes.map(row => JSON.stringify(row.key))).toEqual(expect.arrayContaining([
      JSON.stringify({ customerId: 1, 'slot.startAt': -1 }), JSON.stringify({ 'slot.localDate': 1, status: 1, 'slot.startAt': 1 }),
      JSON.stringify({ 'pets.petId': 1, 'slot.startAt': 1 })]));
  });

  const appointment = (more = {}, petMore = {}) => ({
    code: 'GR-0001', customerId: oid(), slot: { startAt: at(TODAY, '10:00'), endAt: at(TODAY, '11:00'), localDate: TODAY, startLocalTime: '10:00' },
    pets: [{ petId: oid(), petSnapshot: { name: 'Milo', species: 'DOG', breedCode: 'dog-mixed', weightKg: 12, petVersion: 0 },
      services: [{ serviceId: oid(), name: 'Tắm và vệ sinh thú cưng', durationMinutes: 60, priceVnd: 110000 }],
      answers: { biteOrScratch: 'NO', skinCondition: 'NO' }, finalPriceVnd: 110000, durationMinutes: 60, slotKeys: [`${TODAY}T10:00+07:00`], ...petMore }],
    tier: { code: 'SILVER', discountBps: 300, discountBlockedReason: null }, pricing: { subtotalVnd: 110000, tierDiscountVnd: 3300, totalVnd: 106700, currency: 'VND' },
    shop: { address: ADDRESS }, bookedAt: new Date(NOW), ...more
  });

  test('an appointment starts Booked with Booked pets, has a unique code and never stores a very risky bite answer', async () => {
    const { GroomingAppointment } = groomingModels(connection);
    const saved = await GroomingAppointment.create(appointment());
    expect(saved.status).toBe('BOOKED');
    expect(saved.pets[0].status).toBe('BOOKED');
    expect(saved.version).toBe(0);
    await expect(GroomingAppointment.create(appointment())).rejects.toMatchObject({ code: 11000 });
    await expect(GroomingAppointment.create(appointment({ code: 'GR-0002' }, { answers: { biteOrScratch: 'YES', skinCondition: 'NO' } }))).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(GroomingAppointment.create(appointment({ code: 'BAD' }))).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(GroomingAppointment.create(appointment({ code: 'GR-0003', status: 'PAID' }))).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(GroomingAppointment.create(appointment({ code: 'GR-0004', pets: [] }))).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('a later use case can change one pet through arrayFilters without touching the others', async () => {
    const { GroomingAppointment } = groomingModels(connection);
    const saved = await GroomingAppointment.create(appointment({ code: 'GR-0010' }));
    await GroomingAppointment.updateOne({ _id: saved._id }, { $set: { 'pets.$[pet].status': 'CHECKED_IN', 'pets.$[pet].confirmedDifficulty': 'NORMAL' } },
      { arrayFilters: [{ 'pet._id': saved.pets[0]._id }] });
    expect((await GroomingAppointment.findById(saved._id).lean()).pets[0]).toMatchObject({ status: 'CHECKED_IN', confirmedDifficulty: 'NORMAL' });
  });
});
