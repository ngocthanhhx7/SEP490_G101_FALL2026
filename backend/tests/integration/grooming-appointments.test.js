import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
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
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { groomingModels } from '../../src/models/grooming-appointment.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { serviceModel } from '../../src/models/service.model.js';
import { groomingLocalDate } from '../../src/utils/grooming-slot-time.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';

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
  { weekday, startLocalTime: '08:00', endLocalTime: '12:00', workLocation: 'SHOP' }, { weekday, startLocalTime: '14:00', endLocalTime: '17:00', workLocation: 'SHOP' }
]);
const actors = Object.fromEntries(['CUSTOMER', 'CUSTOMER2', 'CUSTOMER3', 'CUSTOMER4', 'STAFF', 'PET_SITTER', 'ADMIN'].map(role =>
  [role, { userId: String(oid()), roles: [role.startsWith('CUSTOMER') ? 'CUSTOMER' : role], state: 'ACTIVE' }]));
let replica, connection, server, base, db, services, pets, repository, payroll, scheduling, product;
const sid = code => String(services[code]);
const call = (method, path, role = 'CUSTOMER', csrf = true) => {
  const req = request(base)[method](`/api/v1/grooming${path}`);
  if (role) req.set('x-test-role', role);
  if (method !== 'get') { req.set('Origin', base); if (csrf) req.set('X-CSRF-Token', 'synthetic-csrf'); }
  return req;
};
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
  await db.collection('aisitterprofiles').insertOne({ userId: _id, serviceIds: codes.map(code => services[code]), active: capabilityActive, dayOffDates: [], species: ['DOG', 'CAT'], maxWeightKg: 150, maxPets: 1, allowedTraits: [] });
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
}, 600000);

let currentNow = NOW;

// A new app for every test starts the rate limiters from zero, so the many bookings of one customer never reach the limit.
async function startApp({ hotline } = {}) {
  await stopApp();
  const session = { authenticate: async req => actors[req.get('x-test-role')] ? { ...actors[req.get('x-test-role')], expiresAt: currentNow + HOUR } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json(), requestId);
  registerModules(app, [groomingRuntimeModule({ connection, sessionService: session, clock: () => currentNow,
    env: { GROOMING_BOOKING_ENABLED: 'true', BOOKING_FACILITY_ADDRESS: ADDRESS, ...(hotline ? { GROOMING_SHOP_HOTLINE: hotline } : {}) },
    config: { auth: { enabled: true } } })]);
  app.use(errorHandler(() => {}));
  server = createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const stopApp = () => new Promise(resolve => (server ? server.close(() => { server = null; resolve(); }) : resolve()));
afterAll(async () => { await stopApp(); await connection?.close(); await replica?.stop(); }, 30000);
afterEach(stopApp);

beforeEach(async () => {
  currentNow = NOW;
  await startApp();
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

const START = at(TODAY, '09:00').toISOString();
const startOf = (time, date = TODAY) => at(date, time).toISOString();
const keyOf = (time, date = TODAY) => `${date}T${time}+07:00`;
const NO_SLOT_STORE = () => db.collection('groomingslots');
const APPOINTMENTS = () => groomingModels(connection).GroomingAppointment;
const held = async time => { const docs = await APPOINTMENTS().find({ status: 'BOOKED' }).lean(); const count = docs.flatMap(doc => doc.pets).filter(pet => pet.reservedSitterId && pet.status !== 'CANCELLED_NO_CHARGE' && pet.slotKeys.includes(keyOf(time))).length; return count || undefined; };
const petOf = (role, name, species = 'DOG', weightKg = 12) => repository.models.Pet.create({ ownerId: actors[role].userId, name, species,
  breedCode: species === 'DOG' ? 'dog-mixed' : 'cat-mixed', weightKg, traits: [], careNeedsConfirmed: true });
const row = (petDoc, codes, answers = {}) => ({ petId: String(petDoc._id), serviceIds: codes.map(sid), answers: { biteOrScratch: 'NO', skinCondition: 'NO', ...answers } });
const totalOf = async (rows, role = 'CUSTOMER') => (await call('post', '/quotes', role).send({ pets: rows }).expect(200)).body.data.totalVnd;
const payload = (rows, total, startAt = START) => ({ startAt, pets: rows, expectedTotalVnd: total });
const book = (body, key = `synthetic-key-${oid()}`, role = 'CUSTOMER') => call('post', '/appointments', role).set('Idempotency-Key', key).send(body);
// Resolves with the response; `.expect(status)` checks the status first, like a supertest request.
const bookFor = (rows, { startAt = START, role = 'CUSTOMER', key } = {}) => {
  const response = (async () => book(payload(rows, await totalOf(rows, role), startAt), key, role))();
  response.expect = async status => { const result = await response; expect(result.status).toBe(status); return result; };
  return response;
};
const seed = async ({ code, status = 'BOOKED', petStatus = 'BOOKED', petDoc = pets.Milo, times = ['10:00'], more = {} }) => APPOINTMENTS().create({
  code, customerId: oid(), slot: { startAt: at(TODAY, times[0]), endAt: at(TODAY, '12:00'), localDate: TODAY, startLocalTime: times[0] }, status,
  requestReceipt: { key: String(oid()), fingerprint: 'synthetic', result: {} },
  pets: [{ reservedSitterId: oid(), petId: petDoc._id, petSnapshot: { name: petDoc.name, species: 'DOG', breedCode: 'dog-mixed', weightKg: 12, petVersion: 0 }, status: petStatus,
    services: [{ serviceId: oid(), name: 'Tắm và vệ sinh thú cưng', durationMinutes: 60, priceVnd: 110000 }],
    answers: { biteOrScratch: 'NO', skinCondition: 'NO' }, finalPriceVnd: 110000, durationMinutes: 60 * times.length, slotKeys: times.map(time => keyOf(time)) }],
  tier: { code: null, discountBps: 0, discountBlockedReason: null }, pricing: { subtotalVnd: 110000, tierDiscountVnd: 0, totalVnd: 110000, currency: 'VND' },
  shop: { address: ADDRESS }, bookedAt: new Date(NOW), ...more
});

describe('access and input', () => {
  test('only a signed-in customer can use the appointment endpoints', async () => {
    await call('post', '/appointments', null).send({}).expect(401);
    await call('get', '/appointments', null).expect(401);
    await call('get', `/appointments/${oid()}`, null).expect(401);
    for (const role of ['STAFF', 'PET_SITTER', 'ADMIN']) {
      await book({}, undefined, role).expect(403);
      await call('get', '/appointments', role).expect(403);
      await call('get', `/appointments/${oid()}`, role).expect(403);
    }
    await call('post', '/appointments', 'CUSTOMER', false).set('Idempotency-Key', 'synthetic-key-1').send({}).expect(403);
  });

  test('refuses a missing or malformed Idempotency-Key and a malformed body before anything is stored', async () => {
    await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])];
    const good = payload(rows, await totalOf(rows));
    await call('post', '/appointments').send(good).expect(422);
    for (const key of ['short', 'x'.repeat(201), 'has space in key']) await book(good, key).expect(422);
    const bad = [{ ...good, extra: 1 }, { ...good, expectedTotalVnd: 110000.5 }, { ...good, expectedTotalVnd: -1 }, { ...good, expectedTotalVnd: '110000' },
      { ...good, startAt: startOf('09:30') }, { ...good, startAt: START.replace('.000Z', 'Z') }, { ...good, startAt: 'tomorrow' }, { ...good, startAt: 1 },
      { ...good, pets: [] }, { ...good, pets: [rows[0], rows[0]] }, { startAt: good.startAt, pets: rows }];
    for (const body of bad) await book(body).expect(422);
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
    expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
  });

  test('refuses a slot that is too soon or outside the seven-day window and accepts the boundaries', async () => {
    await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])], total = await totalOf(rows);
    await book(payload(rows, total, startOf('08:00'))).expect(422);
    await book(payload(rows, total, startOf('00:00', addDays(TODAY, 7)))).expect(422);
    await book(payload(rows, total, startOf('10:00', addDays(TODAY, -1)))).expect(422);
    await book(payload(rows, total, START)).expect(201);
    await book(payload([row(pets.Bo, ['pet-bathing'])], await totalOf([row(pets.Bo, ['pet-bathing'])]), startOf('10:00', addDays(TODAY, 6)))).expect(201);
  });

  test('refuses another customer pet, an archived pet and a service that is not a shop service', async () => {
    await sitter();
    const other = await petOf('CUSTOMER2', 'Lu');
    await book(payload([row(other, ['pet-bathing'])], 110000)).expect(404);
    await repository.models.Pet.collection.updateOne({ _id: pets.Bo._id }, { $set: { state: 'ARCHIVED' } });
    await book(payload([row(pets.Bo, ['pet-bathing'])], 100000)).expect(404);
    const response = await book(payload([row(pets.Milo, ['home-care'])], 0)).expect(409);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
  });

  test('a pet that bites or scratches is referred to the shop and nothing is held', async () => {
    await sitter();
    const response = await book(payload([row(pets.Bo, ['pet-bathing'], { biteOrScratch: 'YES' })], 100000)).expect(422);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_PET_REFERRAL_REQUIRED', petName: 'Bơ' });
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
    expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
  });

  test('needs the shop address', async () => {
    await sitter();
    const bare = groomingRuntimeModule({ connection, sessionService: { authenticate: async () => null, verifyCsrf: async () => true }, clock: () => NOW,
      env: { GROOMING_BOOKING_ENABLED: 'true' }, config: { auth: { enabled: true } } });
    const rows = [row(pets.Milo, ['pet-bathing'])];
    await expect(bare.service.book(actors.CUSTOMER, payload(rows, await totalOf(rows)), 'synthetic-key-address')).rejects
      .toMatchObject({ status: 409, code: 'FACILITY_ADDRESS_REQUIRED' });
  });
});

describe('booking', () => {
  test('saves a Booked appointment with the final price of each pet, holds one place per pet and slot, and takes no payment', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing', 'nail-trimming']), row(pets.Bo, ['hair-trimming'])];
    const response = await bookFor(rows, { startAt: startOf('10:00') }).expect(201);
    const data = response.body.data;
    expect(data).toMatchObject({ code: 'GR-0001', status: 'BOOKED', depositRequired: false, shop: { address: ADDRESS, hotline: null },
      slot: { startAt: startOf('10:00'), localDate: TODAY, startLocalTime: '10:00' },
      pricing: { subtotalVnd: 110000 + 55000 + 200000, tierDiscountVnd: 0, totalVnd: 365000, currency: 'VND' } });
    expect(data.pets.map(item => [item.name, item.status, item.finalPriceVnd, item.durationMinutes]))
      .toEqual([['Milo', 'BOOKED', 165000, 75], ['Bơ', 'BOOKED', 200000, 90]]);
    expect(data.pets[0].services.map(item => [item.name, item.priceVnd, item.sizeLabel])).toEqual([['Tắm và vệ sinh thú cưng', 110000, 'chó 5–15 kg'], ['Cắt móng', 55000, 'chó 5–15 kg']]);
    const saved = await APPOINTMENTS().findById(data.id).lean();
    expect(saved).toMatchObject({ code: 'GR-0001', status: 'BOOKED', customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), version: 0 });
    expect(saved.pets.map(item => item.slotKeys)).toEqual([[keyOf('10:00'), keyOf('11:00')], [keyOf('10:00'), keyOf('11:00')]]);
    expect(saved.pets[0].answers).toEqual({ biteOrScratch: 'NO', skinCondition: 'NO' });
    expect(saved.slot.endAt).toEqual(at(TODAY, '11:30'));
    expect(saved.payment).toBeUndefined();
    expect(await held('10:00')).toBe(2);
    expect(await held('11:00')).toBe(2);
    expect(await held('12:00')).toBeUndefined();
    expect((await call('get', `/appointments/${data.id}`).expect(200)).body.data).toEqual(data);
  });

  test('a pet whose services run longer holds every slot it needs, a pet with a shorter plan holds fewer', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing', 'hair-trimming']), row(pets.Muop, ['nail-trimming'])];
    await bookFor(rows).expect(201);
    expect([await held('09:00'), await held('10:00'), await held('11:00'), await held('12:00')]).toEqual([2, 1, 1, undefined]);
  });

  test('numbers the appointments one by one and keeps the tier of the moment', async () => {
    await sitter(); await sitter();
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'GOLD', asOf: new Date(NOW) });
    const first = (await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(201)).body.data;
    expect(first.tier).toEqual({ code: 'GOLD', discountBps: 500, discountBlockedReason: null });
    expect(first.pricing).toMatchObject({ subtotalVnd: 110000, tierDiscountVnd: 5500, totalVnd: 104500 });
    const second = (await bookFor([row(pets.Bo, ['pet-bathing'])], { startAt: startOf('10:00') }).expect(201)).body.data;
    expect(second.code).toBe('GR-0002');
    expect((await APPOINTMENTS().findById(first.id).lean()).tier).toMatchObject({ code: 'GOLD', discountBps: 500 });
  });

  test('an overdue bill is stored as the reason for no discount', async () => {
    await sitter();
    await db.collection('customer_tiers').insertOne({ _id: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), tier: 'GOLD', asOf: new Date(NOW) });
    await db.collection('bookings').insertOne({ customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), paymentState: 'OVERDUE' });
    const data = (await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(201)).body.data;
    expect(data.tier).toEqual({ code: 'GOLD', discountBps: 0, discountBlockedReason: 'OVERDUE' });
    expect(data.pricing.tierDiscountVnd).toBe(0);
  });

  test('a price that changed since the customer saw it is refused with the new total', async () => {
    await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])];
    const response = await book(payload(rows, 99000)).expect(409);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_PRICE_CHANGED', message: 'Giá vừa thay đổi. Vui lòng xem lại giá cuối trước khi xác nhận.',
      expectedTotalVnd: 99000, totalVnd: 110000 });
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
    expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
  });

  test('a slot with no sitter on shift is refused as taken', async () => {
    await sitter();
    const response = await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('13:00') }).expect(409);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_SLOT_TAKEN', startAt: startOf('13:00') });
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
  });
});

describe('authoritative employee reservations', () => {
  test('generic legacy HOME availability does not imply a shop shift', async () => {
    await sitter({ windows: WINDOWS.map(({ workLocation: _location, ...window }) => window) });
    expect(await slotsOf(TODAY, { petId: String(pets.Milo._id), serviceIds: [sid('pet-bathing')] })).toEqual([]);
    const response = await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(409);
    expect(response.body.error.code).toBe('GROOMING_SLOT_TAKEN');
  });
  test('different pets may use distinct employees with different service capabilities', async () => {
    const bathing = await sitter({ codes: ['pet-bathing'] }), nails = await sitter({ codes: ['nail-trimming'] });
    const response = await bookFor([row(pets.Milo, ['pet-bathing']), row(pets.Bo, ['nail-trimming'])]).expect(201);
    const saved = await APPOINTMENTS().findById(response.body.data.id).lean();
    expect(saved.pets.map(pet => String(pet.reservedSitterId))).toEqual([String(bathing), String(nails)]);
  });
  test('capability species, weight and traits are authoritative for each pet', async () => {
    const employeeId = await sitter();
    await db.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { species: ['CAT'] } });
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(409);
    await db.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { species: ['DOG'], maxWeightKg: 5 } });
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(409);
    await db.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { maxWeightKg: 150 } });
    await db.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $unset: { maxWeightKg: '' } });
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(409);
    await db.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { maxWeightKg: 150 } });
    await repository.models.Pet.collection.updateOne({ _id: pets.Milo._id }, { $set: { traits: ['SYNTHETIC_SPECIAL_CARE'] } });
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(409);
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
  });
  test('booking and removing a SHOP window serialize through the same employee guard', async () => {
    const employeeId = await sitter(), employee = createEmployeeScheduleRepository({ connection, clock: () => NOW, coverageAreas: [] });
    const input = payload([row(pets.Milo, ['pet-bathing'])], await totalOf([row(pets.Milo, ['pet-bathing'])]));
    const [reservation, update] = await Promise.allSettled([
      book(input).then(response => { if (response.status !== 201) throw new Error(response.body.error.code); return response; }),
      employee.availability.updateMine({ actor: { userId: String(employeeId), roles: ['PET_SITTER'], state: 'ACTIVE' }, command: {
        expectedVersion: 1, idempotencyKey: 'synthetic-remove-shop-window', zone: 'Asia/Ho_Chi_Minh', effectiveFrom: TODAY,
        workingWindows: WINDOWS.map(({ workLocation: _location, ...window }) => window)
      } })
    ]);
    expect([reservation, update].filter(result => result.status === 'fulfilled')).toHaveLength(1);
    if (reservation.status === 'fulfilled') {
      expect(update.reason.code).toBe('CONFIRMED_VISIT_CONFLICT');
      expect((await scheduling.EmployeeAvailability.findById(String(employeeId)).lean()).version).toBe(1);
    } else expect(await APPOINTMENTS().countDocuments()).toBe(0);
  });
  test('concurrent bookings of the same pet cannot reserve two different employees', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])];
    const responses = await Promise.all([bookFor(rows), bookFor(rows)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409).body.error.code).toBe('GROOMING_PET_ALREADY_BOOKED');
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
  });
});

describe('slot holding', () => {
  test('two customers booking the last place at the same moment: one 201 and one MSG64, one place held', async () => {
    await sitter();
    const lu = await petOf('CUSTOMER2', 'Lu');
    const [a, b] = await Promise.all([
      bookFor([row(pets.Milo, ['pet-bathing'])]), bookFor([row(lu, ['pet-bathing'])], { role: 'CUSTOMER2' })
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find(response => response.status === 409).body.error).toMatchObject({ code: 'GROOMING_SLOT_TAKEN' });
    expect(await held('09:00')).toBe(1);
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
    expect(await APPOINTMENTS().countDocuments({ 'requestReceipt.key': { $exists: true } })).toBe(1);
  });

  test('four customers racing for two places on a slot with no record yet: exactly two succeed', async () => {
    await sitter(); await sitter();
    const roles = ['CUSTOMER', 'CUSTOMER2', 'CUSTOMER3', 'CUSTOMER4'];
    const owned = [pets.Milo, ...await Promise.all(roles.slice(1).map(role => petOf(role, `Pet ${role}`)))];
    const responses = await Promise.all(roles.map((role, index) => bookFor([row(owned[index], ['pet-bathing'])], { role })));
    expect(responses.map(response => response.status).sort()).toEqual([201, 201, 409, 409]);
    expect(responses.filter(response => response.status === 409).every(response => response.body.error.code === 'GROOMING_SLOT_TAKEN')).toBe(true);
    expect(await held('09:00')).toBe(2);
    const codes = (await APPOINTMENTS().find().lean()).map(doc => doc.code).sort();
    expect(codes).toHaveLength(2);
    expect(new Set(codes).size).toBe(2);
  });

  test('an appointment with more pets than the capacity on a slot with no record is refused and leaves no record', async () => {
    await sitter();
    const response = await bookFor([row(pets.Milo, ['pet-bathing']), row(pets.Bo, ['pet-bathing'])]).expect(409);
    expect(response.body.error.code).toBe('GROOMING_SLOT_TAKEN');
    expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
    // Sequence gaps are allowed; a failed reservation still creates no appointment.
    expect(await APPOINTMENTS().countDocuments()).toBe(0);
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(201);
  });

  test('more pets than the capacity only in a later hour of a long plan is refused', async () => {
    await sitter(); await sitter();
    await bookFor([row(pets.Milo, ['pet-bathing', 'hair-trimming']), row(pets.Bo, ['nail-trimming'])]).expect(201);
    const other = await petOf('CUSTOMER2', 'Other pet');
    await bookFor([row(other, ['pet-bathing'])], { startAt: startOf('10:00'), role: 'CUSTOMER2' }).expect(201);
    const response = await bookFor([row(pets.Muop, ['pet-bathing', 'nail-trimming'])], { startAt: startOf('10:00') }).expect(409);
    expect(response.body.error.code).toBe('GROOMING_SLOT_TAKEN');
  });

  test('a slot that is full in a later hour leaves no place held in the earlier hours of the same appointment', async () => {
    await sitter();
    await bookFor([row(pets.Bo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201);
    const response = await bookFor([row(pets.Milo, ['pet-bathing', 'hair-trimming'])]).expect(409);
    expect(response.body.error.code).toBe('GROOMING_SLOT_TAKEN');
    expect(await held('09:00')).toBeUndefined();
    expect(await held('11:00')).toBe(1);
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
    expect(await APPOINTMENTS().countDocuments({ 'requestReceipt.key': { $exists: true } })).toBe(1);
  });

  test('a slot kept full by another appointment is shown as FULL and cannot be booked', async () => {
    await sitter();
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(201);
    const slots = await slotsOf(TODAY, { petId: String(pets.Bo._id), serviceIds: [sid('pet-bathing')] });
    expect(times(slots).slice(0, 3)).toEqual(['09:00:F', '10:00:A', '11:00:A']);
    await bookFor([row(pets.Bo, ['pet-bathing'])]).expect(409);
    await bookFor([row(pets.Bo, ['pet-bathing'])], { startAt: startOf('10:00') }).expect(201);
  });
});

describe('Idempotency-Key', () => {
  test('the same key and content answers with the appointment already saved and holds nothing more', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])], body = payload(rows, await totalOf(rows));
    const first = await book(body, 'synthetic-key-replay').expect(201);
    const again = await book(body, 'synthetic-key-replay').expect(201);
    expect(again.body.data).toEqual(first.body.data);
    expect(await held('09:00')).toBe(1);
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
    expect((await groomingModels(connection).GroomingCounter.findById('appointment-code').lean()).value).toBe(1);
  });

  test('the same key with other content is a conflict, and the same content in another order is not', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing', 'nail-trimming']), row(pets.Bo, ['pet-bathing'])];
    const body = payload(rows, await totalOf(rows));
    const first = await book(body, 'synthetic-key-content').expect(201);
    const reordered = { ...body, pets: [rows[1], { ...rows[0], serviceIds: [...rows[0].serviceIds].reverse() }] };
    expect((await book(reordered, 'synthetic-key-content').expect(201)).body.data.id).toBe(first.body.data.id);
    const other = [row(pets.Milo, ['pet-bathing'])];
    const response = await book(payload(other, await totalOf(other)), 'synthetic-key-content').expect(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
  });

  test('two identical requests at the same moment save one appointment', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])], body = payload(rows, await totalOf(rows));
    const [a, b] = await Promise.all([book(body, 'synthetic-key-twice'), book(body, 'synthetic-key-twice')]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
    expect(await held('09:00')).toBe(1);
  });

  test('a key belongs to its customer: another customer using the same key books separately', async () => {
    await sitter(); await sitter();
    const lu = await petOf('CUSTOMER2', 'Lu');
    const mine = await bookFor([row(pets.Milo, ['pet-bathing'])], { key: 'synthetic-key-shared' }).expect(201);
    const theirs = await bookFor([row(lu, ['pet-bathing'])], { key: 'synthetic-key-shared', role: 'CUSTOMER2' }).expect(201);
    expect(theirs.body.data.id).not.toBe(mine.body.data.id);
  });
});

describe('a pet cannot have two overlapping appointments (Q6)', () => {
  test.each([['BOOKED', true], ['CHECKED_IN', true], ['NO_SHOW', false], ['HANDED_BACK_PAID', false], ['CLOSED_NO_CHARGE', false], ['CANCELLED', false]])(
    'an existing %s appointment of the pet blocks: %s', async (status, blocks) => {
      await sitter(); await sitter();
      await seed({ code: 'GR-0100', status, times: ['09:00'] });
      const response = await bookFor([row(pets.Milo, ['pet-bathing'])]);
      if (blocks) {
        expect(response.status).toBe(409);
        expect(response.body.error).toMatchObject({ code: 'GROOMING_PET_ALREADY_BOOKED', petId: String(pets.Milo._id), petName: 'Milo',
          message: 'Milo đã có lịch tại cửa hàng vào giờ này. Vui lòng chọn giờ khác.' });
        expect(await APPOINTMENTS().countDocuments()).toBe(1);
        expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
      } else {
        expect(response.status).toBe(201);
      }
    });

  test.each([['CANCELLED_NO_CHARGE', false], ['BOOKED', true], ['CHECKED_IN', true], ['IN_PROGRESS', true], ['READY', true], ['STOPPED', true]])(
    'a pet that is %s inside a Booked appointment blocks: %s', async (petStatus, blocks) => {
      await sitter(); await sitter();
      await seed({ code: 'GR-0101', petStatus, times: ['09:00'] });
      expect((await bookFor([row(pets.Milo, ['pet-bathing'])])).status).toBe(blocks ? 409 : 201);
    });

  test('only overlapping hours block: the hours before and after are free, a long plan blocks every hour it covers', async () => {
    await sitter(); await sitter();
    await seed({ code: 'GR-0102', times: ['10:00', '11:00'] });
    await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: START }).expect(201);
    await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('10:00') }).expect(409);
    await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(409);
    await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('14:00') }).expect(201);
  });

  test('a plan that starts earlier but runs into an existing appointment overlaps too', async () => {
    await sitter(); await sitter();
    await seed({ code: 'GR-0105', times: ['10:00'] });
    const response = await bookFor([row(pets.Milo, ['pet-bathing', 'hair-trimming'])], { startAt: START });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('GROOMING_PET_ALREADY_BOOKED');
  });

  test('another pet, and the same pet on another day, do not block', async () => {
    await sitter(); await sitter();
    await seed({ code: 'GR-0103', petDoc: pets.Bo, times: ['09:00'] });
    await bookFor([row(pets.Milo, ['pet-bathing'])]).expect(201);
    await bookFor([row(pets.Bo, ['pet-bathing'])], { startAt: startOf('09:00', addDays(TODAY, 1)) }).expect(201);
    await bookFor([row(pets.Bo, ['pet-bathing'])]).expect(409);
  });

  test('one busy pet of several refuses the whole appointment and names that pet', async () => {
    await sitter(); await sitter();
    await seed({ code: 'GR-0104', petDoc: pets.Bo, times: ['09:00'] });
    const response = await bookFor([row(pets.Milo, ['pet-bathing']), row(pets.Bo, ['pet-bathing'])]);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_PET_ALREADY_BOOKED', petName: 'Bơ' });
    expect(await NO_SLOT_STORE().countDocuments({})).toBe(0);
  });

  test('the same pet booked twice at the same moment with two keys gets one appointment', async () => {
    await sitter(); await sitter();
    const rows = [row(pets.Milo, ['pet-bathing'])], body = payload(rows, await totalOf(rows));
    const responses = await Promise.all([book(body, 'synthetic-key-one'), book(body, 'synthetic-key-two')]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409).body.error.code).toBe('GROOMING_PET_ALREADY_BOOKED');
    expect(await APPOINTMENTS().countDocuments()).toBe(1);
    expect(await held('09:00')).toBe(1);
  });
});

describe('reading appointments', () => {
  const mine = more => ({ customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), ...more });

  test('lists only the own appointments, latest slot first, with paging and a status filter', async () => {
    await seed({ code: 'GR-0201', times: ['10:00'], more: mine() });
    await seed({ code: 'GR-0202', times: ['11:00'], petDoc: pets.Bo, status: 'NO_SHOW', more: mine() });
    await seed({ code: 'GR-0203', times: ['14:00'], petDoc: pets.Muop, more: mine() });
    await seed({ code: 'GR-0299', times: ['15:00'], petDoc: pets.Muop });
    const all = (await call('get', '/appointments').expect(200)).body.data;
    expect(all).toMatchObject({ page: 1, limit: 20, total: 3 });
    expect(all.items.map(item => item.code)).toEqual(['GR-0203', 'GR-0202', 'GR-0201']);
    const second = (await call('get', '/appointments?page=2&limit=2').expect(200)).body.data;
    expect([second.total, second.items.map(item => item.code)]).toEqual([3, ['GR-0201']]);
    expect((await call('get', '/appointments?status=NO_SHOW').expect(200)).body.data.items.map(item => item.code)).toEqual(['GR-0202']);
    expect((await call('get', '/appointments', 'CUSTOMER2').expect(200)).body.data).toMatchObject({ total: 0, items: [] });
  });

  test('reads one own appointment and answers 404 for another customer appointment, an unknown id and a malformed id', async () => {
    const own = await seed({ code: 'GR-0201', more: mine() });
    const other = await seed({ code: 'GR-0202', petDoc: pets.Bo });
    expect((await call('get', `/appointments/${own._id}`).expect(200)).body.data).toMatchObject({ id: String(own._id), code: 'GR-0201', status: 'BOOKED' });
    for (const id of [other._id, oid(), 'not-an-id', '123']) expect((await call('get', `/appointments/${id}`)).status).toBe(404);
    expect((await call('get', `/appointments/${own._id}`, 'CUSTOMER2')).status).toBe(404);
    expect((await call('get', `/appointments/${other._id}`)).body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  test('refuses an unknown query field, a bad page and an unknown status', async () => {
    for (const query of ['foo=1', 'page=0', 'limit=51', 'status=PAID', 'status=', 'upcoming=yes']) expect((await call('get', `/appointments?${query}`)).status).toBe(422);
  });

  test('lists upcoming BOOKED appointments earliest first with serverNow when upcoming=true', async () => {
    await seed({ code: 'GR-0210', times: ['14:00'], more: mine() });
    await seed({ code: 'GR-0211', times: ['10:00'], petDoc: pets.Bo, more: mine() });
    await seed({ code: 'GR-0212', times: ['11:00'], petDoc: pets.Muop, status: 'CANCELLED', more: mine() });
    await seed({ code: 'GR-0213', times: ['15:00'], petDoc: pets.Muop, status: 'CHECKED_IN', more: mine() });
    await seed({ code: 'GR-0214', times: ['07:00'], petDoc: pets.Bo, more: mine() });
    const upcoming = (await call('get', '/appointments?upcoming=true').expect(200)).body.data;
    expect(upcoming.serverNow).toBe(new Date(NOW).toISOString());
    expect(upcoming.items.map(item => item.code)).toEqual(['GR-0211', 'GR-0210']);
  });

  test('does not show internal check-in, work, staff or payment fields to the customer', async () => {
    const saved = await seed({ code: 'GR-0201', more: mine({ checkIn: { at: new Date(NOW), byStaffId: oid() }, payment: { tipVnd: 5000, method: 'CASH' }, version: 3 }) });
    await APPOINTMENTS().updateOne({ _id: saved._id }, { $set: { 'pets.0.checkInCondition': 'Gãi nhiều', 'pets.0.assignedSitterId': oid(), 'pets.0.confirmedDifficulty': 'HARD' } });
    const text = JSON.stringify((await call('get', `/appointments/${saved._id}`).expect(200)).body.data);
    for (const hidden of ['checkIn', 'Gãi nhiều', 'assignedSitterId', 'confirmedDifficulty', 'payment', 'tipVnd', 'byStaffId', 'version', 'slotKeys', 'customerId']) {
      expect(text).not.toContain(hidden);
    }
  });
});

describe('customer cancellation (ST-GRM-07, GBR-40)', () => {
  const HOTLINE = '024-7300-8899';
  const mine = more => ({ customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId), ...more });
  const cancel = (id, role = 'CUSTOMER', csrf = true, body = {}) => call('post', `/appointments/${id}/cancel`, role, csrf).send(body);

  test('ST-GRM-07: cancels an appointment 3 hours away at no charge, frees the slot for others, and lets the same pet rebook the same hour', async () => {
    await startApp({ hotline: HOTLINE });
    await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    const otherPet = await petOf('CUSTOMER2', 'Lu');
    const slotsFor = async (role, ...petRows) => (await call('post', '/slots', role).send(slotBody(TODAY, ...petRows)).expect(200)).body.data.slots;
    expect((await slotsFor('CUSTOMER2', { petId: String(otherPet._id), serviceIds: [sid('pet-bathing')] }))
      .find(slot => slot.time === '11:00')?.state).toBe('FULL');

    const cancelled = (await cancel(booked.id).expect(200)).body.data;
    expect(cancelled).toMatchObject({
      id: booked.id, code: booked.code, status: 'CANCELLED', depositRequired: false,
      cancellation: { at: new Date(NOW).toISOString(), byRole: 'CUSTOMER' }
    });
    expect(cancelled.pets.every(pet => pet.status === 'CANCELLED_NO_CHARGE')).toBe(true);
    expect(JSON.stringify(cancelled)).not.toContain('byUserId');

    const saved = await APPOINTMENTS().findById(booked.id).select('+requestReceipt').lean();
    expect(saved).toMatchObject({
      status: 'CANCELLED', version: 1, closedAt: new Date(NOW),
      cancellation: { at: new Date(NOW), byRole: 'CUSTOMER', byUserId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId) }
    });
    expect(saved.payment).toBeUndefined();
    expect(saved.pets.every(pet => pet.status === 'CANCELLED_NO_CHARGE')).toBe(true);
    expect(saved.requestReceipt.result.status).toBe('BOOKED');
    expect(await held('11:00')).toBeUndefined();

    // Slot opens again for another customer and the same pet can rebook the same hour.
    expect((await slotsFor('CUSTOMER2', { petId: String(otherPet._id), serviceIds: [sid('pet-bathing')] }))
      .find(slot => slot.time === '11:00')?.state).toBe('AVAILABLE');
    const rebooked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    expect(rebooked.id).not.toBe(booked.id);
    expect(await held('11:00')).toBe(1);
  });

  test('ST-GRM-07: allows cancellation at the exact 2-hour boundary and frees multi-pet slots', async () => {
    await startApp({ hotline: HOTLINE });
    await sitter(); await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing']), row(pets.Bo, ['pet-bathing'])], { startAt: startOf('10:00') }).expect(201)).body.data;
    expect(await held('10:00')).toBe(2);

    const response = await cancel(booked.id).expect(200);
    expect(response.body.data.status).toBe('CANCELLED');
    expect(response.body.data.pets.map(pet => pet.status)).toEqual(['CANCELLED_NO_CHARGE', 'CANCELLED_NO_CHARGE']);
    expect(await held('10:00')).toBeUndefined();

    const otherPet = await petOf('CUSTOMER2', 'Lu');
    await bookFor([row(otherPet, ['pet-bathing'])], { startAt: startOf('10:00'), role: 'CUSTOMER2' }).expect(201);
  });

  test('ST-GRM-07: refuses cancellation less than 2 hours before start (1 hour and 1ms past boundary) with GROOMING_CANCEL_TOO_LATE and hotline (MSG159)', async () => {
    await startApp({ hotline: HOTLINE });
    await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('09:00') }).expect(201)).body.data;
    // 1 hour before 09:00 (NOW = 08:00).
    const oneHour = await cancel(booked.id).expect(409);
    expect(oneHour.body.error).toMatchObject({
      code: 'GROOMING_CANCEL_TOO_LATE',
      hotline: HOTLINE,
      startAt: startOf('09:00')
    });
    expect(oneHour.body.error.message).toContain(HOTLINE);
    expect((await APPOINTMENTS().findById(booked.id).lean()).status).toBe('BOOKED');
    expect(await held('09:00')).toBe(1);

    // 1ms inside the 2-hour cutoff for a 10:00 appointment.
    const bookedTen = (await bookFor([row(pets.Bo, ['pet-bathing'])], { startAt: startOf('10:00') }).expect(201)).body.data;
    currentNow = at(TODAY, '08:00').getTime() + 1;
    const justLate = await cancel(bookedTen.id).expect(409);
    expect(justLate.body.error.code).toBe('GROOMING_CANCEL_TOO_LATE');
    expect((await APPOINTMENTS().findById(bookedTen.id).lean()).status).toBe('BOOKED');
  });

  test('refuses cancellation without hotline configured cleanly (no null text)', async () => {
    await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('09:00') }).expect(201)).body.data;
    const response = await cancel(booked.id).expect(409);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_CANCEL_TOO_LATE', hotline: null });
    expect(response.body.error.message).not.toContain('null');
  });

  test('enforces ownership, authentication, role, CSRF and strict body validation', async () => {
    await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    await cancel(booked.id, null).expect(401);
    await cancel(booked.id, 'CUSTOMER', false).expect(403);
    for (const role of ['STAFF', 'PET_SITTER', 'ADMIN']) await cancel(booked.id, role).expect(403);
    await cancel(booked.id, 'CUSTOMER2').expect(404);
    await cancel(String(oid())).expect(404);
    await cancel('not-an-id').expect(404);
    await cancel(booked.id, 'CUSTOMER', true, { unexpected: true }).expect(422);
    expect((await APPOINTMENTS().findById(booked.id).lean()).status).toBe('BOOKED');
  });

  test('refuses second cancellation, checked-in and closed appointments without modifying state', async () => {
    await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    await cancel(booked.id).expect(200);
    const afterFirst = await APPOINTMENTS().findById(booked.id).lean();
    const second = await cancel(booked.id).expect(409);
    expect(second.body.error.code).toBe('GROOMING_APPOINTMENT_NOT_CANCELLABLE');
    expect((await APPOINTMENTS().findById(booked.id).lean()).version).toBe(afterFirst.version);

    for (const status of ['CHECKED_IN', 'HANDED_BACK_PAID', 'NO_SHOW', 'CLOSED_NO_CHARGE']) {
      const seeded = await seed({ code: `GR-09${status.slice(0, 2)}`, status, times: ['11:00'], more: mine({ code: `GR-900${['CHECKED_IN', 'HANDED_BACK_PAID', 'NO_SHOW', 'CLOSED_NO_CHARGE'].indexOf(status)}` }) });
      const res = await cancel(String(seeded._id)).expect(409);
      expect(res.body.error.code).toBe('GROOMING_APPOINTMENT_NOT_CANCELLABLE');
      expect((await APPOINTMENTS().findById(seeded._id).lean()).status).toBe(status);
    }
  });

  test('still allows customer cancellation even if the reserved employee was suspended afterwards', async () => {
    const employeeId = await sitter();
    const booked = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    await db.collection('sitterstatuses').updateOne({ userId: employeeId }, { $set: { status: 'SUSPENDED' } });
    const response = await cancel(booked.id).expect(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });

  test('serializes concurrent double-cancel and concurrent cancel + booking on the same slot without corrupting holds', async () => {
    await sitter();
    const first = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    const [c1, c2] = await Promise.all([cancel(first.id), cancel(first.id)]);
    expect([c1.status, c2.status].sort()).toEqual([200, 409]);
    expect((await APPOINTMENTS().findById(first.id).lean()).version).toBe(1);

    // Book again, then race Customer 1 cancelling with Customer 2 booking the exact same single-sitter slot.
    const second = (await bookFor([row(pets.Milo, ['pet-bathing'])], { startAt: startOf('11:00') }).expect(201)).body.data;
    const lu = await petOf('CUSTOMER2', 'Lu');
    const c2Rows = [row(lu, ['pet-bathing'])];
    const c2Body = payload(c2Rows, await totalOf(c2Rows, 'CUSTOMER2'), startOf('11:00'));
    const [cancelRes, bookRes] = await Promise.all([
      cancel(second.id),
      book(c2Body, 'synthetic-race-cancel-book', 'CUSTOMER2')
    ]);
    expect(cancelRes.status).toBe(200);
    expect([201, 409]).toContain(bookRes.status);
    if (bookRes.status === 201) {
      expect(await held('11:00')).toBe(1);
    } else {
      expect(bookRes.body.error.code).toBe('GROOMING_SLOT_TAKEN');
      expect(await held('11:00')).toBeUndefined();
      // Immediately afterwards, Customer 2 can book the freed slot cleanly.
      await book(c2Body, 'synthetic-after-cancel-book', 'CUSTOMER2').expect(201);
      expect(await held('11:00')).toBe(1);
    }
  });
});
