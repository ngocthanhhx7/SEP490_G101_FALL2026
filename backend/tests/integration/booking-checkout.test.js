import { beforeAll, afterAll, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { createBookingCheckoutService } from '../../src/services/booking-proposals/booking-checkout.service.js';
import { bookingCheckoutRuntimeModule } from '../../src/routes/booking-checkout.routes.js';
import { createPricingRepository } from '../../src/services/pricing/pricing.repository.js';
import { createPricingService } from '../../src/services/pricing/pricing.service.js';
import { provisionDemoCatalog } from '../../src/services/demo-catalog-provisioning.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createMongoPaymentWebhookRepository } from '../../src/services/providers/payos/mongo-payment-webhook.repository.js';
import { createPayosPaymentWebhookService } from '../../src/services/providers/payos/payment-webhook.service.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { createCheckoutAvailabilityService } from '../../src/services/booking-proposals/checkout-availability.service.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { DEMO_WORK_AREAS } from '../../src/constants/demo-work-areas.js';

const oid = () => new mongoose.Types.ObjectId();
const owner = { userId: String(oid()), roles: ['CUSTOMER'], state: 'ACTIVE' }, other = { ...owner, userId: String(oid()) };
let replica, connection, pricing, checkout, services, pet, address, app, scheduling, availability;
let at = new Date('2026-11-02T03:00:00Z');
const provider = { createPaymentLink: jest.fn(async input => ({ orderCode: input.orderCode, amount: input.amount, currency: 'VND',
  paymentLinkId: 'synthetic-provider-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-provider-link' })) };
const item = (code, visitCount = 1) => ({ serviceId: String(services.find(s => s.code === code)._id), petIds: [String(pet._id)], durationMinutes: 60, visitCount });
const quote = async (code = 'home-care', visits = 2) => pricing.basket(owner.userId, { items: [item(code, visits)] });
const input = (q, location = 'HOME') => ({ quoteId: q.quoteId, acceptServicePolicies: true,
  visits: q.items.flatMap((row, itemIndex) => Array.from({ length: row.visitCount }, (_, index) => ({ itemIndex,
    startAt: new Date(at.getTime() + (24 + itemIndex * 24 + index * 2) * 3600000).toISOString(), location,
    ...(location !== 'FACILITY' ? { addressId: String(address._id) } : {}) }))) });

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_booking_checkout' }).asPromise();
  await provisionDemoCatalog({ connection }); await provisionFinanceSources(connection);
  const repository = createPricingRepository(connection, () => at.getTime());
  pricing = createPricingService({ repository, clock: () => at.getTime() });
  scheduling = createEmployeeScheduleRepository({ connection, clock: () => at.getTime(), coverageAreas: DEMO_WORK_AREAS });
  await provisionEmployeeScheduling(connection);
  availability = createCheckoutAvailabilityService({ connection, repository: scheduling, clock: () => at.getTime(), facilityAddress: 'Synthetic facility address' });
  checkout = createBookingCheckoutService({ connection, clock: () => at.getTime(), selectionGuard: availability.guard, provider, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  services = await connection.models.Service.find().lean();
  await repository.models.PetBreed.create({ code: 'synthetic-checkout-dog', name: 'Synthetic dog', species: 'DOG', active: true, source: 'Synthetic fixture' });
  pet = await repository.models.Pet.create({ ownerId: owner.userId, name: 'Synthetic dog', species: 'DOG', breedCode: 'synthetic-checkout-dog', weightKg: 4, traits: [], careNeedsConfirmed: true });
  address = await repository.models.CustomerAddress.create({ ownerId: owner.userId, label: 'Synthetic home', location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: at, areaCode: 'DISTRICT_HAI_BA_TRUNG', version: 0 });
  const session = { authenticate: async req => {
    const name = req.get('x-test-actor');
    const actor = ['ADMIN', 'STAFF', 'PET_SITTER'].includes(name) ? { ...owner, roles: ['CUSTOMER', name] } : ({ owner, other })[name];
    return actor ? { ...actor, expiresAt: at.getTime() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const module = bookingCheckoutRuntimeModule({ config: { auth: { enabled: true } }, connection, clock: () => at.getTime(), provider, sessionService: session,
    env: { BOOKING_CHECKOUT_ENABLED: 'true', BOOKING_WEB_ORIGIN: 'http://127.0.0.1:5188', BOOKING_FACILITY_ADDRESS: 'Synthetic facility address' } });
  app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

async function employeeForCheckout(sitterId, serviceId) {
  const staffId = oid(), id = String(sitterId);
  await connection.collection('aisitterprofiles').updateOne({ userId: sitterId }, { $set: { userId: sitterId, active: true,
    serviceIds: [new mongoose.Types.ObjectId(serviceId)], species: ['DOG'], allowedTraits: [], maxWeightKg: 25, maxPets: 3, dayOffDates: [] } }, { upsert: true });
  await scheduling.payroll.EmploymentContract.create({ employeeId: sitterId, version: 1, employmentType: 'PART_TIME', salaryBasis: 'GROSS',
    monthlyBaseVnd: 3000000, payCycle: 'MONTHLY', weeklyMinutes: 1200, signedAt: new Date('2026-10-01'), effectiveAt: new Date('2026-10-01'),
    contractReference: 'synthetic-contract-'+id, workplaceRegion: 1, workplaceReference: 'Synthetic workplace', verifiedBy: staffId, recordedAt: at });
  const windows = Array.from({ length: 7 }, (_, index) => ({ weekday: index+1, startLocalTime: '08:00', endLocalTime: '18:00' }));
  await scheduling.models.EmployeeAvailability.create({ _id: id, areas: ['DISTRICT_HAI_BA_TRUNG'], state: 'ACTIVE', dayOffDates: [], workingWindows: windows, version: 1 });
  await scheduling.models.EmployeeAvailabilityRevision.create({ sitterId: id, effectiveFrom: '2026-10-01', version: 1, workingWindows: windows });
}

test.each(['ADMIN', 'STAFF', 'PET_SITTER'])('checkout service rejects retained Customer membership for %s before reading a quote', async role => {
  await expect(checkout.confirm({ ...owner, roles: ['CUSTOMER', role] }, {}, 'synthetic-denied-checkout'))
    .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  for (const path of ['/options', '/bookings/aaaaaaaaaaaaaaaaaaaaaaaa']) {
    const response = await request(app).get('/api/v1/checkout' + path).set('x-test-actor', role).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  }
  const response = await request(app).post('/api/v1/checkout/bookings').set('x-test-actor', role)
    .set('Origin', 'http://127.0.0.1:5188').set('X-CSRF-Token', 'synthetic-csrf').send({}).expect(403);
  expect(response.body.error.code).toBe('FORBIDDEN');
});

test('confirms one immutable booking for concurrent identical retries and preserves exact post-combo commission', async () => {
  const q = await pricing.basket(owner.userId, { items: [item('pet-bathing', 3), item('home-care', 3)] });
  const body = input(q); body.visits.slice(0, 3).forEach(row => { row.location = 'FACILITY'; delete row.addressId; });
  const results = await Promise.all([checkout.confirm(owner, body, 'checkout-concurrent-001'), checkout.confirm(owner, body, 'checkout-concurrent-001')]);
  expect(results[0]).toEqual(results[1]); expect(results[0]).toMatchObject({ totalVnd: 620400, state: 'AWAITING_PAYMENT', paymentMode: 'PREPAY' });
  const booking = await connection.collection('bookings').findOne({ _id: new mongoose.Types.ObjectId(results[0].id) });
  expect(booking.paymentDeadlineAt.getTime() - booking.createdAt.getTime()).toBe(15 * 60000);
  expect(await connection.collection('bookings').countDocuments({ quoteId: booking.quoteId })).toBe(1);
  const notifications = await connection.models.Notification.find({ eventId: `booking:${booking._id}` }).lean();
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({ recipientId: owner.userId, role: 'CUSTOMER', eventType: 'BOOKING_CREATED', deepLink: '/account/bookings' });
  const visits = await connection.collection('visits').find({ bookingId: booking._id }).sort({ sequence: 1 }).toArray();
  expect(visits.map(row => row.snapshots.employeeServiceNetVnd)).toEqual([94000, 94000, 94000, 112800, 112800, 112800]);
  expect(visits.every(row => row.sitterId === null && row.state === 'SCHEDULED')).toBe(true);
  expect(visits[3].snapshots.point).toEqual({ type: 'Point', coordinates: [105.85, 21.02] });
  expect(visits[0].snapshots.point).toBeUndefined();
  expect(booking.paymentSnapshot).toEqual({ amountVnd: 620400, currency: 'VND' });
  await expect(checkout.confirm(owner, body, 'checkout-another-key')).rejects.toMatchObject({ code: 'QUOTE_ALREADY_USED' });
  await expect(checkout.read(other, results[0].id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});

test('binds advisory selection to owned current match and immutable care snapshot without exposing care to checkout views', async () => {
  const sitterId = oid();
  await connection.collection('users').insertOne({ _id: sitterId, state: 'ACTIVE', roles: ['PET_SITTER'] });
  await connection.collection('sitterpublicprofiles').insertOne({ userId: sitterId, state: 'APPROVED' });
  await connection.collection('sitterstatuses').insertOne({ userId: sitterId, status: 'ACTIVE' });
  await employeeForCheckout(sitterId, item('home-care').serviceId);
  await connection.models.Pet.updateOne({ _id: pet._id }, { $set: { ageMonths: 12, careProfile: { allergies: { status: 'UNKNOWN' } } } });
  await connection.models.CustomerAddress.updateOne({ _id: address._id }, { $set: { privateAccessNotes: 'Synthetic secret entry' } });
  const currentPet = await connection.models.Pet.findById(pet._id).lean(), q = await quote('home-care', 1), body = input(q);
  const [match] = await connection.models.DecisionSnapshot.create([{ ownerId: owner.userId, kind: 'MATCH', requestHash: 'synthetic-match',
    expiresAt: new Date(at.getTime() + 300000), snapshot: { input: { serviceId: item('home-care').serviceId, petIds: [String(pet._id)], addressId: String(address._id),
      startAt: body.visits[0].startAt, endAt: new Date(Date.parse(body.visits[0].startAt) + 3600000).toISOString() },
    result: { candidates: [{ sitterId: String(sitterId) }] }, petVersions: [{ id: pet._id, version: currentPet.version }], addressVersion: address.version } }]);
  body.visits[0].requestedSitterId = String(sitterId); body.visits[0].matchId = String(match._id);
  await connection.models.DecisionSnapshot.updateOne({ _id: match._id }, { $set: { ownerId: other.userId } });
  await expect(checkout.confirm(owner, body, 'match-foreign')).rejects.toMatchObject({ code: 'MATCH_EXPIRED' });
  await connection.models.DecisionSnapshot.updateOne({ _id: match._id }, { $set: { ownerId: owner.userId, expiresAt: new Date(at.getTime() - 1) } });
  await expect(checkout.confirm(owner, body, 'match-expired')).rejects.toMatchObject({ code: 'MATCH_EXPIRED' });
  await connection.models.DecisionSnapshot.updateOne({ _id: match._id }, { $set: { expiresAt: new Date(at.getTime() + 300000), 'snapshot.addressVersion': 999 } });
  await expect(checkout.confirm(owner, body, 'match-address-changed')).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
  await connection.models.DecisionSnapshot.updateOne({ _id: match._id }, { $set: { 'snapshot.addressVersion': address.version } });
  const changed = globalThis.structuredClone(body); changed.visits[0].startAt = new Date(Date.parse(body.visits[0].startAt) + 60000).toISOString();
  await expect(checkout.confirm(owner, changed, 'match-time-changed')).rejects.toMatchObject({ code: 'MATCH_CHANGED' });
  const result = await checkout.confirm(owner, body, 'match-valid-selection');
  const visit = await connection.collection('visits').findOne({ bookingId: new mongoose.Types.ObjectId(result.id) });
  expect(visit).toMatchObject({ requestedSitterId: sitterId, recommendationRef: { matchId: String(match._id), advisory: true },
    snapshots: { care: { schemaVersion: 1, privateAccessNotes: 'Synthetic secret entry', pets: [{ ageMonths: 12, careProfile: { allergies: { status: 'UNKNOWN' } } }] } } });
  expect(JSON.stringify(result)).not.toContain('Synthetic secret entry');
  await connection.models.Pet.updateOne({ _id: pet._id }, { $set: { careProfile: { allergies: { status: 'KNOWN', value: 'Changed later' } } } });
  expect(visit.snapshots.care.pets[0].careProfile.allergies.status).toBe('UNKNOWN');
  expect(await checkout.confirm(owner, body, 'match-valid-selection')).toEqual(result);
  const another = await quote('home-care', 1);
  await expect(checkout.confirm(owner, { ...body, quoteId: another.quoteId }, 'match-another-quote')).rejects.toMatchObject({ code: 'MATCH_ALREADY_USED' });
});

test('directed availability uses authoritative eligibility and checkout rejects an employee who became unavailable', async () => {
  const sitterId = oid();
  await connection.collection('users').insertOne({ _id: sitterId, displayName: 'Synthetic available sitter', state: 'ACTIVE', roles: ['PET_SITTER'] });
  await connection.collection('sitterpublicprofiles').insertOne({ userId: sitterId, state: 'APPROVED' });
  await connection.collection('sitterstatuses').insertOne({ userId: sitterId, status: 'ACTIVE' });
  await employeeForCheckout(sitterId, item('home-care').serviceId);
  const q = await quote('home-care', 1), body = input(q), visit = body.visits[0];
  const result = await availability.search(owner, { quoteId: q.quoteId, visit });
  expect(result.sitters).toContainEqual({ id: String(sitterId), displayName: 'Synthetic available sitter' });
  await expect(availability.search(other, { quoteId: q.quoteId, visit })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const before = await connection.collection('bookings').countDocuments();
  await connection.collection('visits').insertOne({ _id: oid(), sitterId, state: 'ASSIGNED', startAt: new Date(visit.startAt),
    endAt: new Date(Date.parse(visit.startAt)+3600000), location: 'HOME', addressId: address._id, snapshots: { point: address.point } });
  const unavailable = await availability.search(owner, { quoteId: q.quoteId, visit });
  expect(unavailable.sitters.map(row => row.id)).not.toContain(String(sitterId));
  await expect(checkout.confirm(owner, { ...body, visits: [{ ...visit, bookingMode: 'DIRECT', requestedSitterId: String(sitterId) }] }, 'directed-became-unavailable')).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  expect(await connection.collection('bookings').countDocuments()).toBe(before);
  expect((await checkout.confirm(owner, { ...body, visits: [{ ...visit, bookingMode: 'SYSTEM' }] }, 'system-without-selected-sitter')).state).toBe('DISPATCH_PENDING');
});

test('system checkout preserves advisory candidate order without directing an employee', async () => {
  const q = await quote('home-care', 1), body = input(q), candidates = [String(oid()), String(oid())];
  const currentPet = await connection.models.Pet.findById(pet._id).lean();
  const [match] = await connection.models.DecisionSnapshot.create([{ ownerId: owner.userId, kind: 'MATCH', requestHash: 'synthetic-system-match',
    expiresAt: new Date(at.getTime() + 300000), snapshot: { input: { serviceId: item('home-care').serviceId, petIds: [String(pet._id)], addressId: String(address._id),
      startAt: body.visits[0].startAt, endAt: new Date(Date.parse(body.visits[0].startAt) + 3600000).toISOString() },
    result: { candidates: candidates.map(sitterId => ({ sitterId })) }, petVersions: [{ id: pet._id, version: currentPet.version }], addressVersion: address.version } }]);
  body.visits[0] = { ...body.visits[0], bookingMode: 'SYSTEM', matchId: String(match._id) };
  const result = await checkout.confirm(owner, body, 'system-with-match');
  const visit = await connection.collection('visits').findOne({ bookingId: new mongoose.Types.ObjectId(result.id) });
  expect(visit).toMatchObject({ bookingMode: 'SYSTEM', requestedSitterId: null, sitterId: null,
    recommendationRef: { matchId: String(match._id), candidateIds: candidates, advisory: true } });
});

test('availability endpoint requires session and CSRF and never caches private results', async () => {
  const q = await quote('home-care', 1), body = { quoteId: q.quoteId, visit: input(q).visits[0] };
  const anonymous = await request(app).post('/api/v1/checkout/availability').send(body).expect(401);
  expect(anonymous.headers['cache-control']).toContain('no-store');
  await request(app).post('/api/v1/checkout/availability').set('x-test-actor', 'owner').send(body).expect(403);
  const disabled = await request(app).post('/api/v1/checkout/availability').set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-test-actor', 'owner').set('x-csrf-token', 'synthetic-csrf').send(body).expect(503);
  expect(disabled.body.error.code).toBe('SCHEDULING_UNAVAILABLE');
  expect(disabled.headers['cache-control']).toContain('no-store');
});

test('rejects changed price/policy/pets, expired quote, missing consent, overlap and foreign address without writing orders', async () => {
  const q = await quote(), body = input(q), before = await connection.collection('bookings').countDocuments();
  const notificationsBefore = await connection.models.Notification.countDocuments();
  await expect(checkout.confirm(owner, { ...body, acceptServicePolicies: false }, 'checkout-no-consent')).rejects.toMatchObject({ code: 'SERVICE_POLICY_CONSENT_REQUIRED' });
  await expect(checkout.confirm(other, body, 'checkout-foreign-quote')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(checkout.confirm(owner, { ...body, visits: body.visits.map(row => ({ ...row, addressId: String(oid()) })) }, 'checkout-foreign-address')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(checkout.confirm(owner, { ...body, visits: body.visits.map(row => ({ ...row, startAt: body.visits[0].startAt })) }, 'checkout-overlap')).rejects.toMatchObject({ code: 'VISIT_SCHEDULE_OVERLAP' });
  await connection.models.Pet.updateOne({ _id: pet._id }, { $inc: { version: 1 } });
  await expect(checkout.confirm(owner, body, 'checkout-pet-change')).rejects.toMatchObject({ code: 'QUOTE_CHANGED' });
  const fresh = await quote();
  await connection.models.DecisionSnapshot.updateOne({ _id: fresh.quoteId }, { $set: { expiresAt: new Date(at.getTime() - 1) } });
  await expect(checkout.confirm(owner, input(fresh), 'checkout-expired-quote')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const oldPolicy = await quote();
  const current = await connection.models.ServicePolicyVersion.findOne({ serviceId: item('home-care').serviceId }).lean();
  const fields = { ...current }; delete fields._id;
  await connection.models.ServicePolicyVersion.create({ ...fields, version: current.version + 1, effectiveAt: at, title: 'Synthetic new conditions' });
  await expect(checkout.confirm(owner, input(oldPolicy), 'checkout-changed-policy')).rejects.toMatchObject({ code: 'QUOTE_CHANGED' });
  expect(await connection.collection('bookings').countDocuments()).toBe(before);
  expect(await connection.models.Notification.countDocuments()).toBe(notificationsBefore);
});

test('single visit postpay can await dispatch without a payment intent; guarded HTTP endpoints enforce session and CSRF', async () => {
  const q = await quote('home-care', 1), body = input(q);
  const result = await checkout.confirm(owner, body, 'checkout-postpay-001');
  expect(result).toMatchObject({ state: 'DISPATCH_PENDING', paymentMode: 'POSTPAY', paymentState: 'UNPAID' });
  expect(await connection.collection('paymentintents').countDocuments({ bookingId: new mongoose.Types.ObjectId(result.id) })).toBe(0);
  await request(app).get(`/api/v1/checkout/bookings/${result.id}`).expect(401);
  await request(app).get(`/api/v1/checkout/bookings/${result.id}`).set('x-test-actor', 'other').expect(404);
  await request(app).post('/api/v1/checkout/bookings').set('x-test-actor', 'owner').send(body).expect(403);
  await request(app).get(`/api/v1/checkout/bookings/${result.id}`).set('x-test-actor', 'owner').expect(200).expect('Cache-Control', 'private, no-store');
});

test('provider link is created once from server amount and replayed without authorizing payment from browser redirects', async () => {
  const q = await quote(), booking = await checkout.confirm(owner, input(q), 'checkout-provider-001'); provider.createPaymentLink.mockClear();
  const first = await checkout.paymentLink(owner, booking.id, 'payment-link-stable');
  expect(await checkout.paymentLink(owner, booking.id, 'payment-link-stable')).toEqual(first);
  expect(provider.createPaymentLink).toHaveBeenCalledTimes(1);
  expect(provider.createPaymentLink.mock.calls[0][0]).toMatchObject({ amount: q.totalVnd, description: 'PAWWORLD', returnUrl: `http://127.0.0.1:5188/services?booking=${booking.id}` });
  expect((await checkout.read(owner, booking.id)).paymentState).toBe('UNPAID');
  const finance = createBookingFinanceSourceService({ connection });
  const repository = createMongoPaymentWebhookRepository({ connection, finance });
  const webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: value => value }, repository, clock: () => at });
  const intent = await connection.collection('paymentintents').findOne({ bookingId: new mongoose.Types.ObjectId(booking.id) });
  const receipt = { orderCode: Number(intent.providerReference), reference: 'synthetic-checkout-bank', amount: intent.amountVnd, currency: 'VND', code: '00', paymentLinkId: 'synthetic-provider-link' };
  expect(await webhook.handleWebhook(receipt)).toMatchObject({ status: 'PAYMENT_VERIFIED' });
  expect((await checkout.read(owner, booking.id)).state).toBe('DISPATCH_PENDING');
});

test('expired and uncertain provider requests never create another link or revive an unpaid order', async () => {
  const q = await quote(), booking = await checkout.confirm(owner, input(q), 'checkout-uncertain-001');
  provider.createPaymentLink.mockRejectedValueOnce(new Error('Synthetic lost acknowledgement'));
  await expect(checkout.paymentLink(owner, booking.id, 'link-uncertain-001')).rejects.toThrow('Synthetic lost acknowledgement');
  await expect(checkout.paymentLink(owner, booking.id, 'link-uncertain-002')).rejects.toMatchObject({ code: 'PAYMENT_LINK_RECONCILIATION_REQUIRED' });
  const intent = await connection.collection('paymentintents').findOne({ bookingId: new mongoose.Types.ObjectId(booking.id) });
  at = new Date(intent.expiresAt);
  const finance = createBookingFinanceSourceService({ connection }), repository = createMongoPaymentWebhookRepository({ connection, finance });
  const webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: value => value }, repository, clock: () => at });
  expect(await webhook.handleWebhook({ orderCode: Number(intent.providerReference), reference: 'synthetic-late-bank', amount: intent.amountVnd, currency: 'VND', code: '00' }))
    .toMatchObject({ status: 'RECONCILIATION_REQUIRED', reason: 'INTENT_EXPIRED' });
  expect((await checkout.read(owner, booking.id)).state).toBe('PAYMENT_EXPIRED');
  await expect(checkout.paymentLink(owner, booking.id, 'link-expired-001')).rejects.toMatchObject({ code: 'INVALID_STATE' });
});
