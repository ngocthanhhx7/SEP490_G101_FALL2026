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
import { createGroomingDiscountHold } from '../../src/services/grooming/grooming-discount-hold.service.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { groomingModels } from '../../src/models/grooming-appointment.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { productSalesModels } from '../../src/models/product.model.js';
import { serviceModel } from '../../src/models/service.model.js';
import { groomingLocalDate, groomingSlotKey } from '../../src/utils/grooming-slot-time.js';
import { createCounterCheckout } from '../../src/services/counter-booking/counter-checkout.service.js';
import { createBookingCheckoutService } from '../../src/services/booking-proposals/booking-checkout.service.js';
import { createPricingService } from '../../src/services/pricing/pricing.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { notificationModels } from '../../src/models/notification.model.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { hasUnpaidGrooming } from '../../src/services/grooming/grooming-unpaid.service.js';

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
const actors = Object.fromEntries(['CUSTOMER', 'CUSTOMER2', 'STAFF', 'PET_SITTER', 'ADMIN'].map(role =>
  [role, { userId: String(oid()), roles: [role === 'CUSTOMER2' ? 'CUSTOMER' : role], state: 'ACTIVE' }]));
let replica, connection, server, base, db, services, pets, repository, payroll, scheduling, product, counterGrooming;
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
async function reserve(sitterId, time) {
  const start = at(addDays(TODAY, 1), time);
  await db.collection('groomingappointments').insertOne({ code: `SYNTHETIC-${oid()}`, requestReceipt: { key: String(oid()) }, status: 'BOOKED', slot: { startAt: start, endAt: new Date(+start + HOUR) },
    pets: [{ reservedSitterId: sitterId, petId: oid(), status: 'BOOKED', durationMinutes: 60 }] });
}

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
  await provisionFinanceSources(connection);
  for (const model of Object.values(notificationModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  await db.collection('customer_tier_policies').updateOne({ _id: 'current' }, { $set: {
    state: 'APPROVED', approvedAt: new Date(0), approvedBy: 'synthetic-reviewer', approvalReference: 'synthetic-fixture-only' } });
  const rows = await serviceModel(connection).find({}).select('code').lean();
  services = Object.fromEntries(rows.map(row => [row.code, row._id]));
  await repository.models.PetBreed.create([{ code: 'dog-mixed', name: 'Synthetic dog', species: 'DOG', active: true, source: 'synthetic fixture' },
    { code: 'cat-mixed', name: 'Synthetic cat', species: 'CAT', active: true, source: 'synthetic fixture' }]);
  const session = { authenticate: async req => actors[req.get('x-test-role')] ? { ...actors[req.get('x-test-role')], expiresAt: NOW + HOUR } : null,
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const app = express(); app.use(express.json(), requestId);
  counterGrooming = groomingRuntimeModule({ connection, sessionService: session, clock: () => NOW,
    env: { GROOMING_BOOKING_ENABLED: 'true', BOOKING_FACILITY_ADDRESS: ADDRESS }, config: { auth: { enabled: true } } });
  registerModules(app, [counterGrooming]);
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

test('counter mixed cash checkout commits one booking and one spa appointment, and replays without duplicate receipts', async () => {
  await sitter();
  const counter = createCounterCheckout({ connection, clock: () => NOW,
    pricing: createPricingService({ repository, clock: () => NOW }),
    checkout: createBookingCheckoutService({ connection, clock: () => NOW, facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming });
  const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
  const input = { customerId: actors.CUSTOMER.userId, date, slot: '09:00', paymentMethod: 'COUNTER_CASH',
    lines: [
      { serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] },
      { serviceId: sid('nail-trimming'), location: 'FACILITY', petIds: [petId] },
      { serviceId: sid('basic-health-check'), location: 'FACILITY', petIds: [petId], visitCount: 1, starts: [at(date, '14:00').toISOString()] }
    ], pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'YES', skinCondition: 'NO' }] };
  const quote = await counter.preview(actors.ADMIN, input);
  expect(quote.totalVnd).toBeGreaterThan(0);
  expect(await db.collection('bookings').countDocuments()).toBe(0);
  expect(await db.collection('groomingappointments').countDocuments()).toBe(0);
  const result = await counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'mixed-cash-test');
  expect(result).toMatchObject({ paid: true, status: 'PAID', totalVnd: quote.totalVnd });
  expect(result.bookingAmountVnd + result.groomingAmountVnd).toBe(quote.totalVnd);
  expect(await db.collection('bookings').countDocuments()).toBe(1);
  expect(await db.collection('groomingappointments').countDocuments()).toBe(1);
  expect(await db.collection('payments').countDocuments({ counterReceiptId: result.receiptId })).toBe(1);
  const savedBooking = await db.collection('bookings').findOne({ counterCheckoutId: result.receiptId });
  const savedSpa = await db.collection('groomingappointments').findOne({ counterCheckoutId: result.receiptId });
  const receipt = await db.collection('payments').findOne({ counterReceiptId: result.receiptId });
  expect(savedBooking).toMatchObject({ createdChannel: 'COUNTER', state: 'DISPATCH_PENDING', paymentState: 'PAID' });
  expect(savedSpa).toMatchObject({ createdChannel: 'COUNTER', counterPaymentState: 'PAID',
    payment: { method: 'CASH', amountVnd: result.groomingAmountVnd } });
  expect(receipt.receiptMoney.amountVnd).toBe(result.bookingAmountVnd);
  expect(receipt.counterTotalVnd).toBe(quote.totalVnd);
  await db.collection('groomingappointments').updateOne({ _id: savedSpa._id }, { $set: { handedBackAt: new Date(NOW) } });
  expect(await hasUnpaidGrooming(connection, actors.CUSTOMER.userId)).toBe(false);
  await db.collection('groomingappointments').updateOne({ _id: savedSpa._id }, { $set: {
    'pets.0.surchargeConsent': true, 'pets.0.surchargeVnd': 30000 } });
  expect(await hasUnpaidGrooming(connection, actors.CUSTOMER.userId)).toBe(true);
  await db.collection('groomingappointments').updateOne({ _id: savedSpa._id },
    { $set: { 'payment.amountVnd': result.groomingAmountVnd + 30000 } });
  expect(await hasUnpaidGrooming(connection, actors.CUSTOMER.userId)).toBe(false);
  expect(await counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'mixed-cash-test')).toEqual(result);
  await expect(counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'mixed-cash-other')).rejects.toMatchObject({ code: 'QUOTE_ALREADY_USED' });
});

test('counter VietQR reserves two linked orders for 15 minutes, then verified webhook pays both without creating duplicates', async () => {
  await sitter();
  const provider = { createPaymentLink: async input => ({ orderCode: input.orderCode, amount: input.amount,
    checkoutUrl: 'https://pay.payos.vn/web/synthetic-counter', paymentLinkId: 'synthetic' }), verifyWebhook: async body => body };
  const counter = createCounterCheckout({ connection, clock: () => NOW,
    pricing: createPricingService({ repository, clock: () => NOW }),
    checkout: createBookingCheckoutService({ connection, clock: () => NOW, facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming, provider, webOrigin: 'http://localhost:5173' });
  const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
  const input = { customerId: actors.CUSTOMER.userId, date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
    lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] },
      { serviceId: sid('basic-health-check'), location: 'FACILITY', petIds: [petId], visitCount: 1, starts: [at(date, '14:00').toISOString()] }],
    pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] };
  const quote = await counter.preview(actors.ADMIN, input);
  const pending = await counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'mixed-qr-test');
  expect(pending).toMatchObject({ status: 'PENDING', paid: false, checkoutUrl: 'https://pay.payos.vn/web/synthetic-counter' });
  expect(await db.collection('bookings').countDocuments()).toBe(1);
  expect(await db.collection('groomingappointments').countDocuments()).toBe(1);
  expect(await db.collection('bookings').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ state: 'AWAITING_PAYMENT', paymentState: 'UNPAID', createdChannel: 'COUNTER' });
  expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ status: 'BOOKED', counterPaymentState: 'AWAITING_PAYMENT', createdChannel: 'COUNTER' });
  expect(await db.collection('payments').countDocuments({ counterReceiptId: pending.receiptId })).toBe(0);
  const intent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
  const webhook = createPayosPaymentWebhookService({ provider, clock: () => new Date(NOW),
    repository: createMongoPaymentWebhookRepository({ connection, getCounterCheckout: () => counter }) });
  const payload = { orderCode: Number(intent.providerReference), reference: 'synthetic-counter-bank-reference', amount: quote.totalVnd,
    currency: 'VND', code: '00', paymentLinkId: 'synthetic', transactionDateTime: new Date(NOW).toISOString() };
  expect(await webhook.handleWebhook(payload)).toEqual({ status: 'PAYMENT_VERIFIED' });
  expect(await webhook.handleWebhook(payload)).toEqual({ status: 'DUPLICATE' });
  expect(await counter.status(actors.ADMIN, pending.receiptId)).toMatchObject({ status: 'PAID', totalVnd: quote.totalVnd });
  expect(await db.collection('bookings').countDocuments()).toBe(1);
  expect(await db.collection('groomingappointments').countDocuments()).toBe(1);
  expect(await db.collection('payments').countDocuments({ counterReceiptId: pending.receiptId })).toBe(1);
  expect(await db.collection('bookings').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ state: 'DISPATCH_PENDING', paymentState: 'PAID' });
  const booking = await db.collection('bookings').findOne({ counterCheckoutId: pending.receiptId });
  const receipt = await db.collection('payments').findOne({ counterReceiptId: pending.receiptId });
  expect(receipt.receiptMoney.amountVnd).toBe(booking.paymentSnapshot.amountVnd);
  expect(receipt.counterTotalVnd).toBe(quote.totalVnd);
  expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ counterPaymentState: 'PAID', payment: { method: 'VIETQR', amountVnd: pending.totalVnd -
      (await db.collection('bookings').findOne({ counterCheckoutId: pending.receiptId })).paymentSnapshot.amountVnd } });
});

test('counter VietQR expiry releases booking and spa reservations together, preserving the historical records', async () => {
  await sitter();
  let tick = NOW;
  const provider = { createPaymentLink: async body => ({ orderCode: body.orderCode, amount: body.amount,
    checkoutUrl: 'https://pay.payos.vn/web/synthetic-expiry', paymentLinkId: 'synthetic' }),
  getPaymentLink: async orderCode => ({ orderCode, amount: intent.amountVnd, amountPaid: 0, providerStatus: 'EXPIRED' }) };
  const counter = createCounterCheckout({ connection, clock: () => tick,
    pricing: createPricingService({ repository, clock: () => tick }),
    checkout: createBookingCheckoutService({ connection, clock: () => tick, facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming, provider, webOrigin: 'http://localhost:5173' });
  const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
  const preview = await counter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
    date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
    lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] },
      { serviceId: sid('basic-health-check'), location: 'FACILITY', petIds: [petId], visitCount: 1,
        starts: [at(date, '14:00').toISOString()] }], pickup: { enabled: false },
    answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
  const pending = await counter.checkout(actors.ADMIN, { previewId: preview.previewId }, 'mixed-expiry-test');
  const intent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
  tick += 16 * 60000;
  expect(await counter.expireBatch()).toMatchObject({ expired: 1 });
  expect(await db.collection('bookings').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ state: 'PAYMENT_EXPIRED' });
  expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ status: 'CANCELLED', counterPaymentState: 'CANCELLED',
      cancellation: { byRole: 'STAFF', reason: 'Payment expired' } });
  expect((await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId })).noShow).toBeUndefined();
  expect(await db.collection('visits').countDocuments({ bookingId: new mongoose.Types.ObjectId(pending.bookingId),
    state: { $ne: 'CANCELLED' } })).toBe(0);
  expect(await counter.status(actors.ADMIN, pending.receiptId)).toMatchObject({ status: 'EXPIRED' });
  expect(await db.collection('payments').countDocuments({ counterReceiptId: pending.receiptId })).toBe(0);
  expect(intent.amountVnd).toBe(preview.totalVnd);
});

test('counter VietQR cancellation confirms payOS is unpaid before freeing a spa-only held slot', async () => {
  await sitter();
  let requestAmount = null;
  const provider = { createPaymentLink: async payload => {
    requestAmount = payload.amount;
    return { orderCode: payload.orderCode, amount: payload.amount,
      checkoutUrl: 'https://pay.payos.vn/web/synthetic-cancel', paymentLinkId: 'synthetic' };
  }, getPaymentLink: async orderCode => ({ orderCode, amount: requestAmount, amountPaid: 0, providerStatus: 'PENDING' }),
  cancelPaymentLink: async orderCode => ({ orderCode, amount: requestAmount, amountPaid: 0, providerStatus: 'CANCELLED' }) };
  const counter = createCounterCheckout({ connection, clock: () => NOW,
    pricing: createPricingService({ repository, clock: () => NOW }),
    checkout: createBookingCheckoutService({ connection, clock: () => NOW, facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming, provider, webOrigin: 'http://localhost:5173' });
  const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
  const quote = await counter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
    date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
    lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] }],
    pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
  const pending = await counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'cancel-spa-only');
  expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ status: 'BOOKED', counterPaymentState: 'AWAITING_PAYMENT' });
  expect(await counter.cancel(actors.ADMIN, pending.receiptId)).toMatchObject({ status: 'CANCELLED' });
  expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
    .toMatchObject({ status: 'CANCELLED', counterPaymentState: 'CANCELLED' });
  expect((await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId })).cancellation).toBeUndefined();
  expect(await db.collection('bookings').countDocuments({ counterCheckoutId: pending.receiptId })).toBe(0);
  expect(await db.collection('payments').countDocuments({ counterReceiptId: pending.receiptId })).toBe(0);
});

test('counter mixed checkout rolls back both orders if grooming slot becomes unavailable after preview', async () => {
  await sitter();
  const counter = createCounterCheckout({ connection, clock: () => NOW,
    pricing: createPricingService({ repository, clock: () => NOW }),
    checkout: createBookingCheckoutService({ connection, clock: () => NOW, facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming });
  const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
  const quote = await counter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
    date, slot: '09:00', paymentMethod: 'COUNTER_CASH',
    lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] },
      { serviceId: sid('basic-health-check'), location: 'FACILITY', petIds: [petId],
        visitCount: 1, starts: [at(date, '14:00').toISOString()] }],
    pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
  const start = at(date, '09:00');
  await db.collection('groomingappointments').insertOne({ code: 'SYNTHETIC-SLOT-TAKEN',
    status: 'BOOKED', slot: { startAt: start, endAt: new Date(+start + HOUR) },
    pets: [{ petId: pets.Bo._id, slotKeys: [`${date}T09:00+07:00`], status: 'BOOKED' }] });
  const receiptsBefore = await db.collection('payments').countDocuments({ counterReceiptId: { $exists: true } });
  await expect(counter.checkout(actors.ADMIN, { previewId: quote.previewId }, 'rollback-on-spa-conflict'))
    .rejects.toMatchObject({ code: 'GROOMING_PET_ALREADY_BOOKED' });
  expect(await db.collection('bookings').countDocuments()).toBe(0);
  expect(await db.collection('payments').countDocuments({ counterReceiptId: { $exists: true } })).toBe(receiptsBefore);
  expect(await db.collection('groomingappointments').countDocuments()).toBe(1);
});

describe('options and access', () => {
  test('IT-FE22-UC58-01 gets the selected pet from Pet Profile and accepts a valid shop grooming service', async () => {
    const options = (await call('get', '/options').expect(200)).body.data;
    const bathing = options.services.find(row => row.code === 'pet-bathing');
    expect(bathing).toMatchObject({ bookable: true, durationMinutes: 60 });

    const quote = (await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing'])] }).expect(200)).body.data;
    expect(quote.pets).toEqual([expect.objectContaining({ petId: String(pets.Milo._id), name: 'Milo', priceVnd: 110000 })]);
  });

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
  test('IT-FE22-UC58-02 finds slots only when a skilled full-time Pet Sitter is on a shop shift', async () => {
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

  test('a same-day home visit requires travel verification rather than assuming zero travel to the shop', async () => {
    const id = await sitter();
    await db.collection('visits').insertOne({ sitterId: id, state: 'ASSIGNED', startAt: at(addDays(TODAY, 1), '10:30'), endAt: at(addDays(TODAY, 1), '11:30') });
    expect(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']))).toEqual([]);
    await db.collection('visits').updateOne({ sitterId: id }, { $set: { state: 'COMPLETED' } });
    expect(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']))).toEqual([]);
    expect(await slotsOf(addDays(TODAY, 2), pet('Bo', ['pet-bathing']))).toHaveLength(7);
  });

  test('a slot whose places are all held is listed as full and the others stay open', async () => {
    const id = await sitter();
    await reserve(id, '09:00'); await reserve(id, '15:00');
    expect(times(await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing'])))).toEqual(['08:00:A', '09:00:F', '10:00:A', '11:00:A', '14:00:A', '15:00:F', '16:00:A']);
  });

  test('ST-GRM-05 marks a slot as PET_ALREADY_BOOKED with the pet name when the selected pet already has an active appointment', async () => {
    const id = await sitter();
    const start = at(addDays(TODAY, 1), '09:00');
    await db.collection('groomingappointments').insertOne({
      code: `SYNTHETIC-${oid()}`, requestReceipt: { key: String(oid()) }, status: 'BOOKED',
      slot: { startAt: start, endAt: new Date(+start + HOUR) },
      pets: [{ reservedSitterId: id, petId: pets.Milo._id, name: 'Milo', status: 'BOOKED', durationMinutes: 60, slotKeys: [groomingSlotKey(start)] }]
    });
    await reserve(id, '15:00');
    const slots = await slotsOf(addDays(TODAY, 1), pet('Milo', ['pet-bathing']));
    expect(slots.find(slot => slot.time === '09:00')).toMatchObject({ time: '09:00', state: 'PET_ALREADY_BOOKED', conflictPetName: 'Milo' });
    expect(slots.find(slot => slot.time === '15:00')).toEqual(expect.objectContaining({ time: '15:00', state: 'FULL' }));
    expect(slots.find(slot => slot.time === '15:00').conflictPetName).toBeUndefined();
  });

  test('lists slots at the pet history limit and requires review when the limit is exceeded', async () => {
    await sitter();
    const date = addDays(TODAY, 1);
    const start = at(date, '09:00');
    const appointments = db.collection('groomingappointments');
    const appointment = () => ({
      code: `SYNTHETIC-${oid()}`, requestReceipt: { key: String(oid()) }, status: 'BOOKED',
      slot: { startAt: start, endAt: new Date(+start + HOUR) },
      pets: [{ petId: pets.Milo._id, status: 'BOOKED', slotKeys: [groomingSlotKey(start)] }]
    });
    const selected = pet('Milo', ['pet-bathing']);
    await appointments.insertMany(Array.from({ length: 200 }, appointment));
    expect(await slotsOf(date, selected)).toContainEqual(expect.objectContaining({
      time: '09:00', state: 'PET_ALREADY_BOOKED'
    }));

    await appointments.insertOne(appointment());
    const response = await call('post', '/slots').send(slotBody(date, selected)).expect(503);
    expect(response.body.error.code).toBe('GROOMING_ROSTER_REVIEW_REQUIRED');
  });

  test('capacity is the number of sitters: two sitters keep a slot open after one place is held', async () => {
    const first = await sitter(), second = await sitter();
    await reserve(first, '09:00');
    const slots = await slotsOf(addDays(TODAY, 1), pet('Bo', ['pet-bathing']));
    expect(times(slots)).toContain('09:00:A');
    await reserve(second, '09:00');
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

  test('IT-FE22-UC58-06 refers a dangerous pet to the shop (MSG63) and stores nothing', async () => {
    const response = await call('post', '/quotes').send({ pets: [pet('Milo', ['pet-bathing']), pet('Bo', ['pet-bathing'], { biteOrScratch: 'YES' })] }).expect(422);
    expect(response.body.error).toMatchObject({ code: 'GROOMING_PET_REFERRAL_REQUIRED', petId: String(pets.Bo._id), petName: 'Bơ', hotline: null });
    const { GroomingAppointment } = groomingModels(connection);
    expect(await GroomingAppointment.countDocuments()).toBe(0);
    expect(await db.collection('groomingslots').countDocuments({})).toBe(0);
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

describe('discount hold rule', () => {
  const customerId = () => new mongoose.Types.ObjectId(actors.CUSTOMER.userId);
  const refusals = count => product.ProductCustomerRefusal.collection.insertMany(Array.from({ length: count }, () => ({ customerId: customerId(), orderId: oid() })));
  const hold = refusalLimit => createGroomingDiscountHold({ connection, refusalLimit });

  test.each([undefined, ''])('an unset limit (%j) falls back to the default of two refusals', async value => {
    await refusals(2);
    expect(await hold(value).read(actors.CUSTOMER.userId)).toBeNull();
    await refusals(1);
    expect(await hold(value).read(actors.CUSTOMER.userId)).toBe('PREPAID_ONLY');
  });

  test.each([2, '-1', '1.5', 'abc', ' 3', '1e3', '9007199254740993', null])('a limit of %j is refused when the hold is created', value => {
    expect(() => hold(value)).toThrow(new TypeError('PRODUCT_REFUSAL_LIMIT must be a non-negative safe integer'));
  });

  test('the limit is inclusive: exactly the limit still gets the discount, one more does not', async () => {
    await refusals(3);
    expect(await hold('3').read(actors.CUSTOMER.userId)).toBeNull();
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBe('PREPAID_ONLY');
    expect(await hold('0').read(actors.CUSTOMER.userId)).toBe('PREPAID_ONLY');
  });

  test('a limit of zero blocks nothing until the first refusal', async () => {
    expect(await hold('0').read(actors.CUSTOMER.userId)).toBeNull();
    await refusals(1);
    expect(await hold('0').read(actors.CUSTOMER.userId)).toBe('PREPAID_ONLY');
  });

  test('the largest safe integer is accepted and counts without a cap', async () => {
    await refusals(5);
    expect(await hold(String(Number.MAX_SAFE_INTEGER)).read(actors.CUSTOMER.userId)).toBeNull();
  });

  test('refusals of another customer are not counted', async () => {
    await product.ProductCustomerRefusal.collection.insertMany([1, 2, 3].map(() => ({ customerId: oid(), orderId: oid() })));
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBeNull();
  });

  test('a bill is overdue by its payment state or by an overdue booking that is not paid', async () => {
    const id = customerId();
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBeNull();
    await db.collection('bookings').insertOne({ customerId: id, state: 'OVERDUE', paymentState: 'PAID' });
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBeNull();
    await db.collection('bookings').insertOne({ customerId: id, state: 'OVERDUE', paymentState: 'UNPAID' });
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBe('OVERDUE');
    await db.collection('bookings').deleteMany({});
    await db.collection('bookings').insertOne({ customerId: oid(), paymentState: 'OVERDUE' });
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBeNull();
  });

  test('too many refusals are reported before an overdue bill', async () => {
    await refusals(3);
    await db.collection('bookings').insertOne({ customerId: customerId(), paymentState: 'OVERDUE' });
    expect(await hold('2').read(actors.CUSTOMER.userId)).toBe('PREPAID_ONLY');
  });
});

describe('VietQR link recovery and expiry regression', () => {
  const makeCounter = (tick, prov) => createCounterCheckout({
    connection, clock: () => tick(),
    pricing: createPricingService({ repository, clock: () => tick() }),
    checkout: createBookingCheckoutService({ connection, clock: () => tick(), facilityAddress: ADDRESS, facilityCoordinates: [105.81, 21.02] }),
    grooming: counterGrooming, provider: prov, webOrigin: 'http://localhost:5173'
  });
  // Minimal stub that lets checkout succeed but whose qrView call will not cache a URL,
  // so we can inject crash state before calling status() with the real recovery provider.
  const checkoutStub = {
    createPaymentLink: async input => ({ orderCode: input.orderCode, amount: input.amount,
      checkoutUrl: 'https://pay.payos.vn/web/stub-initial', paymentLinkId: 'stub-initial' })
  };

  test('JOB-CT-01: process crashes before payOS responds — qrView retries creation after recovery delay', async () => {
    // Checkout succeeds normally (stub provider), then we simulate a crash by wiping
    // checkoutUrl/paymentLinkId and setting linkState: CREATING with an old enough timestamp.
    await sitter();
    let tick = NOW;
    const stubCounter = makeCounter(() => tick, checkoutStub);
    const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
    const preview = await stubCounter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
      date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
      lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] }],
      pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
    const pending = await stubCounter.checkout(actors.ADMIN, { previewId: preview.previewId }, 'crash-recovery-test');
    expect(pending.status).toBe('PENDING');

    // Simulate crash: wipe saved link, set CREATING with old timestamp (> RECOVERY_DELAY_MS=60s)
    const crashedAt = new Date(tick - 70000);
    await db.collection('paymentintents').updateOne(
      { _id: new mongoose.Types.ObjectId(pending.intentId) },
      { $set: { linkState: 'CREATING', linkRequestedAt: crashedAt },
        $unset: { checkoutUrl: '', paymentLinkId: '' } }
    );

    // Recovery provider: getPaymentLink is called FIRST → PAYOS_LINK_NOT_FOUND, then createPaymentLink succeeds
    const calls = [];
    const recoveryProvider = {
      createPaymentLink: async input => {
        calls.push('create');
        return { orderCode: input.orderCode, amount: input.amount,
          checkoutUrl: 'https://pay.payos.vn/web/recovered-link', paymentLinkId: 'recovered' };
      },
      getPaymentLink: async () => {
        calls.push('lookup');
        throw Object.assign(new Error('not found'), { code: 'PAYOS_LINK_NOT_FOUND' });
      }
    };
    const counter = makeCounter(() => tick, recoveryProvider);
    const status = await counter.status(actors.ADMIN, pending.receiptId);
    expect(status.checkoutUrl).toBe('https://pay.payos.vn/web/recovered-link');
    expect(calls).toEqual(['lookup', 'create']);
    const intent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    expect(intent.linkState).toBe('READY');
  });

  test('JOB-CT-02: link created at payOS but response lost — status restores old link via lookup without calling create again', async () => {
    // 1. Timeout/lost response leaves intent in RECONCILIATION_REQUIRED (link exists remotely at payOS).
    // 2. Subsequent status() call (even after recovery delay) looks up payOS first, restores old link,
    //    and does NOT send another createPaymentLink call (which would be rejected for duplicate orderCode).
    await sitter();
    let tick = NOW;
    let createCalls = 0, lookupCalls = 0;
    const lostResponseProvider = {
      createPaymentLink: async () => {
        createCalls++;
        throw Object.assign(new Error('timeout after payOS created link'), { code: 'PAYOS_TIMEOUT', details: { uncertain: true } });
      }
    };
    const stubCounter = makeCounter(() => tick, lostResponseProvider);
    const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
    const preview = await stubCounter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
      date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
      lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] }],
      pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
    const pending = await stubCounter.checkout(actors.ADMIN, { previewId: preview.previewId }, 'response-lost-test');
    expect(pending.checkoutUrl).toBeUndefined();
    expect(createCalls).toBe(1);
    const during = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    expect(during.linkState).toBe('RECONCILIATION_REQUIRED');

    // Advance past recovery delay and also test stale CREATING crash state -> lookup must run first either way
    tick += 70000;
    const existingUrl = 'https://pay.payos.vn/web/existing-order-link';
    const counter = makeCounter(() => tick, {
      getPaymentLink: async orderCode => {
        lookupCalls++;
        expect(orderCode).toBe(Number(during.providerReference));
        return { orderCode, amount: pending.totalVnd, amountPaid: 0, providerStatus: 'PENDING',
          checkoutUrl: existingUrl, paymentLinkId: 'existing-link-id' };
      },
      createPaymentLink: async () => {
        createCalls++;
        throw Object.assign(new Error('Đơn hàng đã tồn tại'), { code: 'PAYOS_REQUEST_REJECTED', details: { uncertain: false } });
      }
    });
    const status = await counter.status(actors.ADMIN, pending.receiptId);
    expect(status.checkoutUrl).toBe(existingUrl);
    expect(lookupCalls).toBe(1);
    expect(createCalls).toBe(1); // No extra create call sent on recovery!
    const after = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    expect(after).toMatchObject({ linkState: 'READY', checkoutUrl: existingUrl, paymentLinkId: 'existing-link-id' });

    // Same guarantee when process crashed mid-flight leaving stale linkState: 'CREATING' > 60s old
    await db.collection('paymentintents').updateOne(
      { _id: after._id },
      { $set: { linkState: 'CREATING', linkRequestedAt: new Date(tick - 70000) },
        $unset: { checkoutUrl: '', paymentLinkId: '' } }
    );
    const crashedStatus = await counter.status(actors.ADMIN, pending.receiptId);
    expect(crashedStatus.checkoutUrl).toBe(existingUrl);
    expect(lookupCalls).toBe(2);
    expect(createCalls).toBe(1);

    // PAYOS_REQUEST_REJECTED from createPaymentLink must classify as RECONCILIATION_REQUIRED, not FAILED.
    // payOS responded with a business-level rejection (e.g. duplicate orderCode) so the POST reached payOS
    // and a link may already exist. The next status() must do lookup-first and restore the link without
    // sending another POST.
    await db.collection('paymentintents').updateOne(
      { _id: after._id },
      { $unset: { linkState: '', linkRequestedAt: '', checkoutUrl: '', paymentLinkId: '' } }
    );
    let rejectedCreateCalls = 0, rejectedLookupCalls = 0;
    const rejectedUrl = 'https://pay.payos.vn/web/rejected-duplicate-link';
    const rejectedProvider = {
      createPaymentLink: async () => {
        rejectedCreateCalls++;
        throw Object.assign(new Error('Mã đơn hàng đã tồn tại'), { code: 'PAYOS_REQUEST_REJECTED', details: { uncertain: false } });
      },
      getPaymentLink: async orderCode => {
        rejectedLookupCalls++;
        return { orderCode, amount: pending.totalVnd, amountPaid: 0, providerStatus: 'PENDING',
          checkoutUrl: rejectedUrl, paymentLinkId: 'rejected-link-id' };
      },
    };
    // First status(): createPaymentLink called; payOS rejects with PAYOS_REQUEST_REJECTED.
    // Intent must land on RECONCILIATION_REQUIRED (lookup can still recover the link).
    const rejectedCounter = makeCounter(() => tick, rejectedProvider);
    await rejectedCounter.status(actors.ADMIN, pending.receiptId);
    expect(rejectedCreateCalls).toBe(1);
    const rejectedIntent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    expect(rejectedIntent.linkState).toBe('RECONCILIATION_REQUIRED'); // must NOT be 'FAILED'

    // Second status(): lookup runs first, link found at payOS, restored — no additional POST.
    const rejectedStatus2 = await rejectedCounter.status(actors.ADMIN, pending.receiptId);
    expect(rejectedStatus2.checkoutUrl).toBe(rejectedUrl);
    expect(rejectedLookupCalls).toBe(1);
    expect(rejectedCreateCalls).toBe(1); // no extra create after rejection
    const recoveredIntent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    expect(recoveredIntent).toMatchObject({ linkState: 'READY', checkoutUrl: rejectedUrl, paymentLinkId: 'rejected-link-id' });
  });

  test('JOB-CT-03: expiry with no link ever requested — expireBatch releases booking and spa without calling payOS', async () => {
    // Checkout with stub, wipe link state so intent looks like "never submitted", then expire.
    await db.collection('paymentintents').deleteMany({}); // isolate from earlier tests' intents
    await sitter();
    let tick = NOW;
    let getPaymentLinkCalls = 0;
    const stubCounter = makeCounter(() => tick, checkoutStub);
    const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
    const preview = await stubCounter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
      date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
      lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] }],
      pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
    const pending = await stubCounter.checkout(actors.ADMIN, { previewId: preview.previewId }, 'no-link-expiry-test');
    // Wipe link fields to simulate "never submitted"
    await db.collection('paymentintents').updateOne(
      { _id: new mongoose.Types.ObjectId(pending.intentId) },
      { $unset: { linkState: '', linkRequestedAt: '', checkoutUrl: '', paymentLinkId: '' } }
    );
    // Advance clock past the 15-min expiry
    tick += 16 * 60000;
    const counter = makeCounter(() => tick, {
      getPaymentLink: async () => { getPaymentLinkCalls++; return null; }
    });
    // expireBatch must expire without asking payOS (no linkRequestedAt)
    const result = await counter.expireBatch();
    expect(result).toMatchObject({ expired: 1 });
    expect(getPaymentLinkCalls).toBe(0);
    expect(await db.collection('groomingappointments').findOne({ counterCheckoutId: pending.receiptId }))
      .toMatchObject({ status: 'CANCELLED', counterPaymentState: 'CANCELLED' });
  });

  test('JOB-CT-04: expireBatch paginates past 50 unreconciled intents — deferred ones do not block later intents', async () => {
    await sitter();
    let tick = NOW;
    const expiredAt = new Date(tick - 60000); // already overdue

    // Insert 51 synthetic counter intents: first 50 have linkState CREATING (unverifiable),
    // last 1 has no linkState (never submitted — safe to expire directly).
    const intentsCol = db.collection('paymentintents');
    const deferredIds = [];
    for (let i = 0; i < 50; i++) {
      const _id = new mongoose.Types.ObjectId();
      deferredIds.push(_id);
      const receiptId = 'synthetic-deferred-receipt-' + i;
      await db.collection('financesourcecommands').insertOne({
        _id: receiptId, fingerprint: 'x', result: { status: 'PENDING', totalVnd: 100000, receivedBy: actors.ADMIN.userId },
        createdAt: new Date(tick - 120000)
      });
      await intentsCol.insertOne({ _id, kind: 'COUNTER_BOOKING', provider: 'PAYOS',
        providerReference: String(1000000000 + i), state: 'PENDING', version: 0,
        amountVnd: 100000, currency: 'VND', expiresAt: expiredAt,
        customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId),
        counterReceiptId: receiptId, counterStaffId: actors.ADMIN.userId,
        // linkState CREATING with very recent timestamp — canRecoverUnpublishedAttempt returns false
        linkState: 'CREATING', linkRequestedAt: new Date(tick - 5000),
        counterPreview: { input: {}, totals: { totalVnd: 100000 } },
        createdAt: new Date(tick - 120000) });
    }

    // Last intent: never submitted (no linkState, no linkRequestedAt)
    const lastId = new mongoose.Types.ObjectId();
    const lastReceiptId = 'synthetic-last-receipt';
    await db.collection('financesourcecommands').insertOne({
      _id: lastReceiptId, fingerprint: 'y', result: { status: 'PENDING', totalVnd: 50000, receivedBy: actors.ADMIN.userId },
      createdAt: new Date(tick - 120000)
    });
    await intentsCol.insertOne({ _id: lastId, kind: 'COUNTER_BOOKING', provider: 'PAYOS',
      providerReference: String(2000000000), state: 'PENDING', version: 0,
      amountVnd: 50000, currency: 'VND', expiresAt: expiredAt,
      customerId: new mongoose.Types.ObjectId(actors.CUSTOMER.userId),
      counterReceiptId: lastReceiptId, counterStaffId: actors.ADMIN.userId,
      counterPreview: { input: {}, totals: { totalVnd: 50000 } },
      createdAt: new Date(tick - 110000) });

    // Provider cannot verify any of the deferred ones (throws network error)
    const unverifiableProvider = {
      getPaymentLink: async () => { throw new Error('network error'); }
    };
    const counter = makeCounter(() => tick, unverifiableProvider);

    // First expireBatch: fetches first 50 (by _id), all deferred — cursor advances
    const r1 = await counter.expireBatch();
    expect(r1.expired).toBe(0);
    expect(r1.deferred).toBe(50);

    // Second expireBatch: cursor points after the 50th, so fetches the last one (no linkState → safe to expire)
    const r2 = await counter.expireBatch();
    expect(r2.expired).toBe(1);

    expect(await intentsCol.findOne({ _id: lastId })).toMatchObject({ state: 'EXPIRED' });
    // The 50 deferred ones are still PENDING
    expect(await intentsCol.countDocuments({ _id: { $in: deferredIds }, state: 'PENDING' })).toBe(50);
  });

  test('JOB-CT-05: spa notification timing — only "awaiting payment" before webhook, "paid" after', async () => {
    await db.collection('notifications').deleteMany({});
    await sitter();
    let tick = NOW;
    const provider = {
      createPaymentLink: async input => ({ orderCode: input.orderCode, amount: input.amount,
        checkoutUrl: 'https://pay.payos.vn/web/spa-notif', paymentLinkId: 'spa-notif' }),
      verifyWebhook: async body => body
    };
    const counter = makeCounter(() => tick, provider);
    const { Notification } = notificationModels(connection);
    const date = addDays(TODAY, 1), petId = String(pets.Bo._id);
    const preview = await counter.preview(actors.ADMIN, { customerId: actors.CUSTOMER.userId,
      date, slot: '09:00', paymentMethod: 'COUNTER_VIETQR',
      lines: [{ serviceId: sid('pet-bathing'), location: 'FACILITY', petIds: [petId] }],
      pickup: { enabled: false }, answers: [{ petId, biteOrScratch: 'NO', skinCondition: 'NO' }] });
    const pending = await counter.checkout(actors.ADMIN, { previewId: preview.previewId }, 'spa-notif-test');
    expect(pending.status).toBe('PENDING');

    // Before webhook: notification must say "chờ thanh toán", NOT the paid confirmation
    const notifBefore = await Notification.findOne({ recipientId: actors.CUSTOMER.userId, eventType: 'BOOKING_CREATED' }).lean();
    expect(notifBefore).not.toBeNull();
    expect(notifBefore.message).toMatch(/chờ thanh toán/);
    expect(notifBefore.message).not.toMatch(/và thanh toán\./);

    // Send payment webhook
    const intent = await db.collection('paymentintents').findOne({ _id: new mongoose.Types.ObjectId(pending.intentId) });
    const webhook = createPayosPaymentWebhookService({ provider, clock: () => new Date(tick),
      repository: createMongoPaymentWebhookRepository({ connection, getCounterCheckout: () => counter }) });
    const payload = { orderCode: Number(intent.providerReference), reference: 'spa-notif-bank-ref',
      amount: pending.totalVnd, currency: 'VND', code: '00', paymentLinkId: 'spa-notif',
      transactionDateTime: new Date(tick).toISOString() };
    expect(await webhook.handleWebhook(payload)).toEqual({ status: 'PAYMENT_VERIFIED' });

    // After webhook: notification message must be updated to "đã...thanh toán" (not "chờ thanh toán")
    const notifAfter = await Notification.findOne({ recipientId: actors.CUSTOMER.userId, eventType: 'BOOKING_CREATED' }).lean();
    expect(notifAfter.message).not.toMatch(/chờ thanh toán/);
    expect(notifAfter.message).toMatch(/và thanh toán\./);
  });
});

describe('storage', () => {
  test('populated legacy command storage stops provisioning for review and is preserved', async () => {
    const legacy = db.collection('groomingcommands');
    await legacy.insertOne({ _id: 'synthetic-legacy-receipt', result: { id: 'original' } });
    try {
      await expect(provisionGroomingStorage(connection)).rejects.toMatchObject({ code: 'GROOMING_MIGRATION_REQUIRED' });
      expect(await legacy.findOne({ _id: 'synthetic-legacy-receipt' })).toMatchObject({ result: { id: 'original' } });
    } finally { await legacy.drop(); } // Isolated synthetic test database only.
  });
  test('provisioning creates only two justified collections and preserves unique appointment/receipt keys', async () => {
    await provisionGroomingStorage(connection);
    const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    for (const name of ['groomingappointments', 'groomingcounters']) expect(names).toContain(name);
    for (const name of ['groomingslots', 'groomingcommands']) expect(names).not.toContain(name);
    const indexes = await groomingModels(connection).GroomingAppointment.collection.listIndexes().toArray();
    expect(indexes.some(row => row.unique && JSON.stringify(row.key) === JSON.stringify({ code: 1 }))).toBe(true);
    expect(indexes.map(row => JSON.stringify(row.key))).toEqual(expect.arrayContaining([
      JSON.stringify({ customerId: 1, 'slot.startAt': -1 }), JSON.stringify({ 'slot.localDate': 1, status: 1, 'slot.startAt': 1 }),
      JSON.stringify({ 'pets.petId': 1, 'slot.startAt': 1 })]));
  });

  const appointment = (more = {}, petMore = {}) => ({
    code: 'GR-0001', customerId: oid(), slot: { startAt: at(TODAY, '10:00'), endAt: at(TODAY, '11:00'), localDate: TODAY, startLocalTime: '10:00' },
    requestReceipt: { key: String(oid()), fingerprint: 'synthetic', result: {} },
    pets: [{ petId: oid(), reservedSitterId: oid(), petSnapshot: { name: 'Milo', species: 'DOG', breedCode: 'dog-mixed', weightKg: 12, petVersion: 0 },
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
