import { beforeAll, beforeEach, afterAll, test, expect, jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { createBookingCheckoutService } from '../../src/services/booking-proposals/booking-checkout.service.js';
import { createBookingPaymentExpiryService } from '../../src/services/booking-proposals/booking-payment-expiry.service.js';
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
import { applyLeashHandlingDecision } from '../../src/services/pricing/leash-handling-policy.service.js';
import { createEmployeeDispatchService } from '../../src/services/employee-scheduling/employee-dispatch.service.js';
import { createBookingCarePlanService } from '../../src/services/booking-proposals/booking-care-plan.service.js';

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
  await provisionDemoCatalog({ connection, clock: () => at.getTime() - 1000 }); await provisionFinanceSources(connection);
  const repository = createPricingRepository(connection, () => at.getTime());
  pricing = createPricingService({ repository, clock: () => at.getTime() });
  scheduling = createEmployeeScheduleRepository({ connection, clock: () => at.getTime(), coverageAreas: DEMO_WORK_AREAS });
  await provisionEmployeeScheduling(connection);
  availability = createCheckoutAvailabilityService({ connection, repository: scheduling, clock: () => at.getTime(), facilityAddress: 'Synthetic facility address' });
  checkout = createBookingCheckoutService({ connection, clock: () => at.getTime(), selectionGuard: availability.guard, provider, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
  for (const actor of [owner, other]) await connection.db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(actor.userId) }, { $set: { roles: ['CUSTOMER'], state: 'ACTIVE' } }, { upsert: true });
  services = await connection.models.Service.find().lean();
  await repository.models.PetBreed.create({ code: 'synthetic-checkout-dog', name: 'Synthetic dog', species: 'DOG', active: true, source: 'Synthetic fixture' });
  pet = await repository.models.Pet.create({ ownerId: owner.userId, name: 'Synthetic dog', species: 'DOG', breedCode: 'synthetic-checkout-dog', weightKg: 4, traits: [], careNeedsConfirmed: true });
  address = await repository.models.CustomerAddress.create({ ownerId: owner.userId, label: 'Synthetic home', location: 'Synthetic private address',
    point: { type: 'Point', coordinates: [105.85, 21.02] }, pointConfirmedAt: at, areaCode: 'DISTRICT_HAI_BA_TRUNG', version: 0 });
  const session = { authenticate: async req => {
    const name = req.get('x-test-actor');
    const mixedRole = name?.startsWith('mixed-') ? name.slice(6) : null;
    const actor = mixedRole ? { ...owner, roles: ['CUSTOMER', mixedRole] }
      : ['ADMIN', 'STAFF', 'PET_SITTER'].includes(name) ? { ...owner, roles: [name] } : ({ owner, other })[name];
    return actor ? { ...actor, expiresAt: at.getTime() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const module = bookingCheckoutRuntimeModule({ config: { auth: { enabled: true } }, connection, clock: () => at.getTime(), provider, sessionService: session,
    env: { BOOKING_CHECKOUT_ENABLED: 'true', BOOKING_WEB_ORIGIN: 'http://127.0.0.1:5188', BOOKING_FACILITY_ADDRESS: 'Synthetic facility address' } });
  app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
// Scenarios share catalog fixtures, but must not inherit reservations at the same time.
beforeEach(async () => {
  await connection.collection('visits').deleteMany({});
  await connection.collection('bookings').deleteMany({});
});

test('home-care availability and checkout share the inclusive 120-minute boundary', async () => {
  const q = await quote('home-care', 1);
  const body = input(q);
  const visitAt = minutes => ({ ...body.visits[0], startAt: new Date(at.getTime() + minutes * 60000).toISOString() });
  const short = { ...body, visits: [visitAt(119)] };
  await expect(availability.search(owner, { quoteId: q.quoteId, visit: short.visits[0] }))
    .rejects.toMatchObject({ code: 'HOME_BOOKING_NOTICE_REQUIRED', status: 422 });
  await expect(checkout.confirm(owner, short, 'home-notice-boundary'))
    .rejects.toMatchObject({ code: 'HOME_BOOKING_NOTICE_REQUIRED', status: 422 });
  expect(await connection.collection('visits').countDocuments()).toBe(0);
  const exact = { ...body, visits: [visitAt(120)] };
  await expect(availability.search(owner, { quoteId: q.quoteId, visit: exact.visits[0] })).resolves.toHaveProperty('sitters');
  const saved = await checkout.confirm(owner, exact, 'home-notice-boundary');
  expect(saved.visits[0].startAt).toEqual(new Date(exact.visits[0].startAt));
  expect(await checkout.confirm(owner, exact, 'home-notice-boundary')).toMatchObject({ id: saved.id });
  expect(await connection.collection('visits').countDocuments()).toBe(1);
});

test('different quotes for the same pet cannot reserve overlapping times, including concurrent checkout', async () => {
  const q1 = await quote('home-care', 1), q2 = await quote('home-care', 1);
  const results = await Promise.allSettled([
    checkout.confirm(owner, input(q1), 'cross-booking-race-one'),
    checkout.confirm(owner, input(q2), 'cross-booking-race-two')
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'VISIT_SCHEDULE_OVERLAP', status: 409 });
  expect(await connection.collection('bookings').countDocuments({})).toBe(1);
  expect(await connection.collection('visits').countDocuments({})).toBe(1);
  const next = await quote('dog-walking', 1);
  const response = await request(app).post('/api/v1/checkout/bookings')
    .set('Host', 'localhost').set('Origin', 'http://localhost').set('x-test-actor', 'owner')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'cross-service-conflict')
    .send(input(next, 'OUTDOOR')).expect(409);
  expect(response.body.error.code).toBe('VISIT_SCHEDULE_OVERLAP');
  expect(JSON.stringify(response.body)).not.toContain('Synthetic private address');
});

test('adjacent visits, different pets and cancelled reservations do not falsely conflict', async () => {
  const q1 = await quote('home-care', 1), body1 = input(q1);
  const first = await checkout.confirm(owner, body1, 'adjacent-booking-first');
  const q2 = await quote('home-care', 1), body2 = input(q2);
  body2.visits[0].startAt = new Date(Date.parse(body1.visits[0].startAt) + 3600000).toISOString();
  await checkout.confirm(owner, body2, 'adjacent-booking-second');
  const otherPet = await connection.models.Pet.create({ ownerId: owner.userId, name: 'Synthetic second pet', species: 'DOG',
    breedCode: pet.breedCode, weightKg: 4, traits: [], careNeedsConfirmed: true });
  const q3 = await pricing.basket(owner.userId, { items: [{ ...item('home-care'), petIds: [String(otherPet._id)] }] });
  await checkout.confirm(owner, input(q3), 'different-pet-same-time');
  await connection.collection('visits').updateMany({ bookingId: new mongoose.Types.ObjectId(first.id) }, { $set: { state: 'CANCELLED' } });
  const q4 = await quote('home-care', 1);
  await checkout.confirm(owner, input(q4), 'cancelled-slot-is-free');
  expect(await connection.collection('bookings').countDocuments({})).toBe(4);
});

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
  await request(app).get('/api/v1/checkout/options').set('x-test-actor', 'mixed-' + role).expect(401);
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

test('ST-BKG-01 applies the approved booking-day tier discount and allocates every paid visit exactly', async () => {
  const db = connection.db;
  const tiers = db.collection('customer_tiers'), policies = db.collection('customer_tier_policies');
  await tiers.updateOne({ _id: new mongoose.Types.ObjectId(owner.userId) }, { $set: { tier: 'SILVER' } }, { upsert: true });
  await policies.updateOne({ _id: 'current' }, { $set: {
    version: 1, state: 'APPROVED', approvedAt: new Date(at.getTime() - 1000),
    approvedBy: 'synthetic-reviewer', approvalReference: 'synthetic-tier-policy',
    discountsBps: { MEMBER: 0, SILVER: 300, GOLD: 500 }
  } }, { upsert: true });
  try {
    const q = await quote('home-care', 3);
    expect(q.tier).toMatchObject({ code: 'SILVER', discountBps: 300, policyVersion: 1 });
    expect(q.orderFeeVnd).toBe(0);
    expect(q.tierDiscountVnd).toBe(Math.floor(q.subtotalVnd * 300 / 10000));
    expect(q.totalVnd).toBe(q.subtotalVnd - q.tierDiscountVnd);
    const booking = await checkout.confirm(owner, input(q), 'tier-booking-silver-001');
    const saved = await connection.collection('bookings').findOne({ _id: new mongoose.Types.ObjectId(booking.id) });
    const visits = saved.checkoutSnapshot.customerVisits;
    expect(visits.reduce((sum, visit) => sum + visit.snapshots.tierDiscountVnd, 0)).toBe(q.tierDiscountVnd);
    expect(visits.reduce((sum, visit) => sum + visit.snapshots.employeeServiceNetVnd, 0)).toBe(q.totalVnd);
    expect(saved.paymentSnapshot.amountVnd).toBe(q.totalVnd);
    const detail = await checkout.read(owner, booking.id);
    expect(detail.details.price).toMatchObject({
      tierCode: 'SILVER', tierDiscountVnd: q.tierDiscountVnd, totalVnd: q.totalVnd
    });
    await tiers.updateOne({ _id: new mongoose.Types.ObjectId(owner.userId) }, { $set: { tier: 'GOLD' } });
    expect((await checkout.read(owner, booking.id)).details.price.tierCode).toBe('SILVER');
  } finally {
    await tiers.deleteOne({ _id: new mongoose.Types.ObjectId(owner.userId) });
    await policies.deleteOne({ _id: 'current' });
  }
});

test('binds advisory selection to owned current match and immutable care snapshot without exposing care to checkout views', async () => {
  const sitterId = oid();
  await connection.collection('users').insertOne({ _id: sitterId, state: 'ACTIVE', roles: ['PET_SITTER'] });
  await connection.collection('sitterpublicprofiles').insertOne({ userId: sitterId, state: 'APPROVED' });
  await connection.collection('sitterstatuses').insertOne({ userId: sitterId, status: 'ACTIVE' });
  await employeeForCheckout(sitterId, item('home-care').serviceId);
  await connection.collection('visits').insertOne({
    _id: oid(), customerId: new mongoose.Types.ObjectId(owner.userId), sitterId, petIds: [pet._id], state: 'COMPLETED',
    startAt: new Date(at.getTime() - 86400000), endAt: new Date(at.getTime() - 82800000),
    snapshots: { pets: [{ id: String(pet._id), name: pet.name }] }
  });
  await connection.models.Pet.updateOne({ _id: pet._id }, { $set: { ageMonths: 12, careProfile: { allergies: { status: 'UNKNOWN' } } } });
  await connection.models.CustomerAddress.updateOne({ _id: address._id }, { $set: { privateAccessNotes: 'Synthetic secret entry' } });
  const currentPet = await connection.models.Pet.findById(pet._id).lean(), q = await quote('home-care', 1), body = input(q);
  const [match] = await connection.models.DecisionSnapshot.create([{ ownerId: owner.userId, kind: 'MATCH', requestHash: 'synthetic-match',
    expiresAt: new Date(at.getTime() + 300000), snapshot: { input: { serviceId: item('home-care').serviceId, petIds: [String(pet._id)], addressId: String(address._id),
      startAt: body.visits[0].startAt, endAt: new Date(Date.parse(body.visits[0].startAt) + 3600000).toISOString() },
    result: { featureVersion: 'PWC_MATCH_FEATURES_V1', capturedAt: at.toISOString(), candidates: [{ sitterId: String(sitterId), breakdown: ['fit', 'travel', 'quality', 'reliability', 'workload'].map(key => ({ key, normalized: 0.7 })) }] }, petVersions: [{ id: pet._id, version: currentPet.version }], addressVersion: address.version } }]);
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
  expect(visit.recommendationRef.featureSnapshot.candidates[0].features).toMatchObject({ fit: 0.7, travel: 0.7 });
  expect(await checkout.confirm(owner, body, 'match-valid-selection')).toEqual(result);
  const another = await quote('home-care', 1);
  await expect(checkout.confirm(owner, { ...body, quoteId: another.quoteId }, 'match-another-quote')).rejects.toMatchObject({ code: 'MATCH_ALREADY_USED' });
});

test('ST-BKG-21 / GBR-12: preferred sitter lists only sitters who cared for chosen pets, blocks strangers, and allows booking busy preferred sitter', async () => {
  const previousSitterId = oid(), strangerSitterId = oid();
  await connection.collection('users').insertMany([
    { _id: previousSitterId, displayName: 'Synthetic previous sitter', state: 'ACTIVE', roles: ['PET_SITTER'] },
    { _id: strangerSitterId, displayName: 'Synthetic stranger sitter', state: 'ACTIVE', roles: ['PET_SITTER'] }
  ]);
  await connection.collection('sitterpublicprofiles').insertMany([
    { userId: previousSitterId, state: 'APPROVED' },
    { userId: strangerSitterId, state: 'APPROVED' }
  ]);
  await connection.collection('sitterstatuses').insertMany([
    { userId: previousSitterId, status: 'ACTIVE' },
    { userId: strangerSitterId, status: 'ACTIVE' }
  ]);
  await employeeForCheckout(previousSitterId, item('home-care').serviceId);
  await employeeForCheckout(strangerSitterId, item('home-care').serviceId);
  await connection.collection('visits').insertOne({
    _id: oid(), customerId: new mongoose.Types.ObjectId(owner.userId), sitterId: previousSitterId, petIds: [pet._id], state: 'COMPLETED',
    startAt: new Date(at.getTime() - 172800000), endAt: new Date(at.getTime() - 169200000),
    snapshots: { pets: [{ id: String(pet._id), name: pet.name }] }
  });

  const q = await quote('home-care', 1), body = input(q), visit = body.visits[0];
  const result = await availability.search(owner, { quoteId: q.quoteId, visit });
  expect(result.sitters).toContainEqual(expect.objectContaining({ id: String(previousSitterId), displayName: 'Synthetic previous sitter', eligible: true }));
  expect(result.sitters.map(row => row.id)).not.toContain(String(strangerSitterId));
  await expect(availability.search(other, { quoteId: q.quoteId, visit })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

  // Stranger sitter is rejected at checkout even if called directly via API (GBR-12).
  await expect(
    checkout.confirm(owner, { ...body, visits: [{ ...visit, bookingMode: 'DIRECT', requestedSitterId: String(strangerSitterId) }] }, 'directed-stranger-blocked')
  ).rejects.toMatchObject({ code: 'PREFERRED_SITTER_HISTORY_REQUIRED', status: 409 });

  // Previous sitter becomes busy: availability flags ineligible for MSG162, yet "Book anyway" succeeds with requestedSitterId preserved.
  await connection.collection('visits').insertOne({ _id: oid(), sitterId: previousSitterId, state: 'ASSIGNED', startAt: new Date(visit.startAt),
    endAt: new Date(Date.parse(visit.startAt) + 3600000), location: 'HOME', addressId: address._id, snapshots: { point: address.point } });
  const unavailable = await availability.search(owner, { quoteId: q.quoteId, visit });
  expect(unavailable.sitters).toContainEqual(expect.objectContaining({ id: String(previousSitterId), eligible: false, unavailableReason: 'SLOT_UNAVAILABLE' }));
  await connection.collection('aisitterprofiles').updateOne({ userId: previousSitterId }, { $set: { active: false } });
  await expect(checkout.confirm(owner, { ...body, visits: [{ ...visit, bookingMode: 'DIRECT', requestedSitterId: String(previousSitterId) }] }, 'directed-capability-lost'))
    .rejects.toMatchObject({ code: 'SERVICE_CAPABILITY_REQUIRED', status: 409 });
  await connection.collection('aisitterprofiles').updateOne({ userId: previousSitterId }, { $set: { active: true } });
  const directedVisit = { ...visit, bookingMode: 'DIRECT', requestedSitterId: String(previousSitterId) };
  await expect(checkout.confirm(owner, { ...body, visits: [directedVisit] }, 'directed-no-consent'))
    .rejects.toMatchObject({ code: 'SITTER_AVAILABILITY_CONSENT_REQUIRED', status: 409,
      details: { lineFields: { 0: { acceptUnavailableSitter: 'SLOT_UNAVAILABLE' } } } });
  const booked = await checkout.confirm(owner, { ...body, visits: [{ ...directedVisit, acceptUnavailableSitter: true }] }, 'directed-book-anyway');
  expect(booked.state).toBe('AWAITING_PAYMENT');
  expect(booked.visits[0].requestedSitterId).toBe(String(previousSitterId));
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

test('single visit also requires prepaid payOS before dispatch; guarded HTTP endpoints enforce session and CSRF', async () => {
  const q = await quote('home-care', 1), body = input(q);
  const path = '/api/v1/checkout/bookings';
  const confirm = payload => request(app).post(path).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-test-actor', 'owner').set('x-csrf-token', 'synthetic-csrf')
    .set('Idempotency-Key', 'checkout-postpay-001').send(payload);
  const result = (await confirm(body).expect(201)).body.data;
  expect(result).toMatchObject({ state: 'AWAITING_PAYMENT', paymentMode: 'PREPAY', paymentState: 'UNPAID', totalVnd: q.totalVnd });
  expect((await confirm(body).expect(201)).body.data).toEqual(result);
  const later = new Date(Date.parse(body.visits[0].startAt) + 3600000).toISOString();
  const conflict = await confirm({ ...body, visits: [{ ...body.visits[0], startAt: later }] }).expect(409);
  expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  const detail = `${path}/${result.id}`;
  await request(app).get(detail).expect(401);
  await request(app).get(detail).set('x-test-actor', 'other').expect(404)
    .expect(({ body: denied }) => expect(denied.error.code).toBe('RESOURCE_NOT_FOUND'));
  await request(app).post(path).set('x-test-actor', 'owner').send(body).expect(403);
  const read = await request(app).get(detail).set('x-test-actor', 'owner').expect(200).expect('Cache-Control', 'private, no-store');
  expect(read.body.data).toMatchObject(result);
  expect(read.body.data.details.price).toMatchObject({ visitCount: 1, totalVnd: q.totalVnd });
  const bookingId = new mongoose.Types.ObjectId(result.id);
  expect(await connection.collection('bookings').countDocuments()).toBe(1);
  expect(await connection.collection('paymentintents').countDocuments({ bookingId })).toBe(1);
  const savedVisits = await connection.collection('visits').find({ bookingId }).toArray();
  expect(savedVisits).toHaveLength(1);
  expect(savedVisits[0].startAt.toISOString()).toBe(body.visits[0].startAt);
});

test('provider link is created once from server amount and replayed without authorizing payment from browser redirects', async () => {
  const q = await quote(), booking = await checkout.confirm(owner, input(q), 'checkout-provider-001'); provider.createPaymentLink.mockClear();
  const first = await checkout.paymentLink(owner, booking.id, 'payment-link-stable');
  expect(await checkout.paymentLink(owner, booking.id, 'payment-link-stable')).toEqual(first);
  expect(provider.createPaymentLink).toHaveBeenCalledTimes(1);
  expect(provider.createPaymentLink.mock.calls[0][0]).toMatchObject({ amount: q.totalVnd, description: 'PAWWORLD',
    returnUrl: `http://127.0.0.1:5188/services?booking=${booking.id}&payment=returned`,
    cancelUrl: `http://127.0.0.1:5188/services?booking=${booking.id}&payment=cancelled` });
  expect((await checkout.read(owner, booking.id)).paymentState).toBe('UNPAID');
  const finance = createBookingFinanceSourceService({ connection });
  const repository = createMongoPaymentWebhookRepository({ connection, finance });
  const webhook = createPayosPaymentWebhookService({ provider: { verifyWebhook: value => value }, repository, clock: () => at });
  const intent = await connection.collection('paymentintents').findOne({ bookingId: new mongoose.Types.ObjectId(booking.id) });
  const receipt = { orderCode: Number(intent.providerReference), reference: 'synthetic-checkout-bank', amount: intent.amountVnd, currency: 'VND', code: '00', paymentLinkId: 'synthetic-provider-link' };
  expect(await webhook.handleWebhook(receipt)).toMatchObject({ status: 'PAYMENT_VERIFIED' });
  expect((await checkout.read(owner, booking.id)).state).toBe('DISPATCH_PENDING');
});

test('approved zero-fee handling policy repairs quoting and automatically plans dispatch without assigning work', async () => {
  const targetService = services.find(service => service.code === 'dog-walking');
  const policyModel = connection.models.PricingPolicy;
  const original = await policyModel.findOne({ serviceId: targetService._id }).sort({ version: -1 }).lean();
  await policyModel.updateOne({ _id: original._id }, { $pull: { rules: { code: 'leash-handling' } } });
  const ownPet = await connection.models.Pet.create({ ownerId: owner.userId, name: 'Synthetic handling dog', species: 'DOG',
    breedCode: pet.breedCode, weightKg: 15, traits: ['leash-handling'], careNeedsConfirmed: true });
  const selections = { items: [{ serviceId: String(targetService._id), petIds: [String(ownPet._id)], durationMinutes: 30, visitCount: 1 }] };
  await expect(pricing.basket(owner.userId, selections)).rejects.toMatchObject({ code: 'PRICING_REVIEW_REQUIRED' });
  const policyClock = () => at.getTime() - 1000;
  expect(await applyLeashHandlingDecision({ connection, clock: policyClock })).toMatchObject({ state: 'DRY_RUN', changed: 1 });
  expect((await policyModel.findById(original._id).lean()).rules.some(rule => rule.code === 'leash-handling')).toBe(false);
  expect(await applyLeashHandlingDecision({ connection, apply: true, clock: policyClock })).toMatchObject({ state: 'APPLIED', changed: 1 });
  expect(await applyLeashHandlingDecision({ connection, apply: true, clock: policyClock })).toMatchObject({ changed: 0 });
  const q = await pricing.basket(owner.userId, selections), request = input(q, 'OUTDOOR');
  const booked = await checkout.confirm(owner, request, 'handled-dog-booking');
  expect(await checkout.confirm(owner, request, 'handled-dog-booking')).toEqual(booked);
  const staff = { userId: String(oid()), roles: ['STAFF'], state: 'ACTIVE' };
  const plans = createBookingCarePlanService({ connection, clock: () => at.getTime() });
  expect((await plans.list(staff)).items.some(row => row.id === booked.id)).toBe(false);
  const dispatch = createEmployeeDispatchService({ repository: scheduling, clock: () => at.getTime() });
  const saved = await connection.collection('bookings').findOne({ _id: new mongoose.Types.ObjectId(booked.id) });
  expect(saved).toMatchObject({ carePlanState: 'APPROVED', carePlanSnapshot: { source: 'SYSTEM_CHECKOUT', approvedBy: 'SYSTEM_DISPATCH' } });
  expect((await dispatch.queue(staff)).items.some(row => row.bookingId === booked.id)).toBe(false);
  expect(await connection.collection('visits').countDocuments({ bookingId: new mongoose.Types.ObjectId(booked.id), sitterId: { $ne: null } })).toBe(0);
  await connection.models.Pet.updateOne({ _id: ownPet._id }, { $set: { traits: ['unapproved-care-need'] } });
  await expect(pricing.basket(owner.userId, selections)).rejects.toMatchObject({ code: 'PRICING_REVIEW_REQUIRED' });
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
  // The wall clock alone cannot expire a booking; JOB-03 requires confirmed
  // unpaid payOS state before persisting PAYMENT_EXPIRED.
  expect((await checkout.read(owner, booking.id)).state).toBe('AWAITING_PAYMENT');
  await expect(checkout.paymentLink(owner, booking.id, 'link-expired-001')).rejects.toMatchObject({ code: 'INVALID_STATE' });
});

test('GBR-18 replaces a cancelled unpaid payOS link while booking is within its 15-minute window', async () => {
  const q = await quote(), booking = await checkout.confirm(owner, input(q), 'checkout-cancelled-link');
  const initial = await checkout.paymentLink(owner, booking.id, 'link-cancelled-first');
  expect(initial.checkoutUrl).toContain('pay.payos.vn');
  const original = await connection.collection('paymentintents').findOne({ bookingId: new mongoose.Types.ObjectId(booking.id) });
  const recoverable = createBookingCheckoutService({ connection, clock: () => at.getTime(), provider: {
    createPaymentLink: provider.createPaymentLink,
    getPaymentLink: async orderCode => ({ orderCode, amount: original.amountVnd, amountPaid: 0,
      amountRemaining: original.amountVnd, providerStatus: 'CANCELLED' })
  }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  const fresh = await recoverable.paymentLink(owner, booking.id, 'link-cancelled-next');
  expect(fresh.checkoutUrl).toContain('pay.payos.vn');
  expect(await connection.collection('paymentintents').countDocuments({ bookingId: original.bookingId })).toBe(2);
  expect((await connection.collection('paymentintents').findOne({ _id: original._id })).state).toBe('CANCELLED');
  const next = await connection.collection('paymentintents').findOne({ bookingId: original.bookingId, state: 'PENDING' });
  expect(next.providerReference).not.toBe(original.providerReference);
  expect(next.expiresAt).toEqual(original.expiresAt);
});

test('ST-BKG-17 retries link creation with the original order code after payOS confirms 404', async () => {
  const q = await quote('home-care', 1), booking = await checkout.confirm(owner, input(q), 'recover-creation-error');
  const failed = createBookingCheckoutService({ connection, clock: () => at.getTime(),
    provider: { createPaymentLink: async () => { throw { code: 'PAYOS_TIMEOUT', details: { uncertain: true } }; } },
    webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  await expect(failed.paymentLink(owner, booking.id, 'link-failed-creation'))
    .rejects.toMatchObject({ code: 'PAYOS_TIMEOUT' });
  const id = new mongoose.Types.ObjectId(booking.id);
  const original = await connection.collection('paymentintents').findOne({ bookingId: id, state: 'PENDING' });
  expect(original.linkState).toBe('RECONCILIATION_REQUIRED');
  const recovered = createBookingCheckoutService({ connection, clock: () => at.getTime(),
    provider: {
      getPaymentLink: async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; },
      createPaymentLink: provider.createPaymentLink
    }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  const next = await recovered.paymentLink(owner, booking.id, 'link-retry-after-404');
  expect(next.checkoutUrl).toContain('https://pay.payos.vn/web/');
  const after = await connection.collection('paymentintents').findOne({ _id: original._id });
  expect(after.providerReference).toBe(original.providerReference);
  expect(after.linkState).toBe('READY');
  expect(after.linkRequestedAt).toBeInstanceOf(Date);
  expect(await connection.collection('paymentintents').countDocuments({ bookingId: id })).toBe(1);
});

test('ST-BKG-17 / JOB-03 keeps in-flight create markers through retry 404 and deadline expiry', async () => {
  const q = await quote('home-care', 1), booking = await checkout.confirm(owner, input(q), 'link-inflight-404-race');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  let releaseCreate, signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const pendingCreate = new Promise(resolve => { releaseCreate = resolve; });
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const create = jest.fn(async input => {
    signalStarted();
    await pendingCreate;
    return { orderCode: input.orderCode, amount: input.amount, currency: 'VND',
      paymentLinkId: 'synthetic-delayed-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-delayed-link' };
  });
  const service = createBookingCheckoutService({ connection, clock: () => at.getTime(), provider: {
    getPaymentLink: lookup, createPaymentLink: create
  }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  const first = service.paymentLink(owner, booking.id, 'link-first-still-inflight');
  await started;
  const intent = await connection.collection('paymentintents').findOne({ bookingId });
  expect(intent).toMatchObject({ linkState: 'CREATING', state: 'PENDING' });
  expect(intent.linkRequestedAt).toBeInstanceOf(Date);
  try {
    await expect(service.paymentLink(owner, booking.id, 'link-retry-while-inflight'))
      .rejects.toMatchObject({ code: 'COMMAND_PENDING', status: 409 });
    expect(lookup).not.toHaveBeenCalled();
    const during = await connection.collection('paymentintents').findOne({ _id: intent._id });
    expect(during.linkState).toBe('CREATING');
    expect(during.linkRequestedAt).toEqual(intent.linkRequestedAt);
    const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
      clock: () => intent.expiresAt.getTime() + 1000 }).runBatch();
    expect(result).toMatchObject({ expired: 0, deferred: 1 });
    expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
    expect((await connection.collection('paymentintents').findOne({ _id: intent._id })).state).toBe('PENDING');
  } finally {
    releaseCreate();
  }
  const firstResult = await first;
  expect(firstResult.checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-delayed-link');
  expect(create).toHaveBeenCalledTimes(1);
  const completed = await connection.collection('paymentintents').findOne({ _id: intent._id });
  expect(completed.linkState).toBe('READY');
  expect(completed.linkRequestedAt).toEqual(intent.linkRequestedAt);
  expect(completed.checkoutUrl).toBe(firstResult.checkoutUrl);
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
});

test('ST-BKG-17 retries a completed failed request only once and retains its prior payOS submission marker', async () => {
  const q = await quote('home-care', 1), booking = await checkout.confirm(owner, input(q), 'link-404-cas-retry');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const failed = createBookingCheckoutService({ connection, clock: () => at.getTime(), provider: {
    createPaymentLink: async () => { throw { code: 'PAYOS_TIMEOUT', details: { uncertain: true } }; }
  }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  await expect(failed.paymentLink(owner, booking.id, 'initial-failed-creation')).rejects.toMatchObject({ code: 'PAYOS_TIMEOUT' });
  const original = await connection.collection('paymentintents').findOne({ bookingId });
  expect(original.linkState).toBe('RECONCILIATION_REQUIRED');
  expect(original.linkRequestedAt).toBeInstanceOf(Date);
  let release, signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const blockedCreate = new Promise(resolve => { release = resolve; });
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const create = jest.fn(async input => {
    signalStarted();
    await blockedCreate;
    return { orderCode: input.orderCode, amount: input.amount, currency: 'VND',
      paymentLinkId: 'synthetic-retried-link', checkoutUrl: 'https://pay.payos.vn/web/synthetic-retried-link' };
  });
  const recovered = createBookingCheckoutService({ connection, clock: () => at.getTime(), provider: {
    getPaymentLink: lookup, createPaymentLink: create
  }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  const firstRetry = recovered.paymentLink(owner, booking.id, 'first-retry-after-404');
  await started;
  try {
    await expect(recovered.paymentLink(owner, booking.id, 'second-retry-after-404'))
      .rejects.toMatchObject({ code: 'COMMAND_PENDING', status: 409 });
    expect(lookup).toHaveBeenCalledTimes(1);
    const during = await connection.collection('paymentintents').findOne({ _id: original._id });
    expect(during.linkState).toBe('CREATING');
    expect(during.linkRequestedAt).toBeInstanceOf(Date);
    const expiry = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
      clock: () => original.expiresAt.getTime() + 1000 }).runBatch();
    expect(expiry).toMatchObject({ expired: 0, deferred: 1 });
    expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
  } finally {
    release();
  }
  expect((await firstRetry).checkoutUrl).toBe('https://pay.payos.vn/web/synthetic-retried-link');
  expect(create).toHaveBeenCalledTimes(1);
  const saved = await connection.collection('paymentintents').findOne({ _id: original._id });
  expect(saved.linkState).toBe('READY');
  expect(saved.linkRequestedAt).toBeInstanceOf(Date);
  expect(saved.providerReference).toBe(original.providerReference);
  expect(await connection.collection('paymentintents').countDocuments({ bookingId })).toBe(1);
});

test('ST-BKG-14 blocks a new home booking for a handed-back grooming amount still unpaid', async () => {
  const ownerId = new mongoose.Types.ObjectId(owner.userId);
  await connection.db.collection('groomingappointments').insertOne({
    _id: oid(), customerId: ownerId, handedBackAt: new Date(at.getTime() - 24 * 3600000),
    pricing: { totalVnd: 150000 }, payment: { amountVnd: 50000 }
  });
  const q = await quote();
  await expect(checkout.confirm(owner, input(q), 'grooming-debt-block-001'))
    .rejects.toMatchObject({ code: 'GROOMING_PAYMENT_OUTSTANDING' });
  await connection.db.collection('groomingappointments').deleteMany({ customerId: ownerId });
});

test('ST-BKG-12 accepts 30 occupied Vietnam calendar days and rejects 31 with MSG20', async () => {
  const q = await quote('home-care', 2);
  const allowed = input(q);
  allowed.visits[0].startAt = '2026-12-01T09:00:00+07:00';
  allowed.visits[1].startAt = '2026-12-30T09:00:00+07:00';
  const created = await checkout.confirm(owner, allowed, 'booking-span-30-days');
  expect(created.id).toBeTruthy();
  const nextQuote = await quote('home-care', 2);
  const rejected = input(nextQuote);
  rejected.visits[0].startAt = '2026-12-01T09:00:00+07:00';
  rejected.visits[1].startAt = '2026-12-31T09:00:00+07:00';
  await expect(checkout.confirm(owner, rejected, 'booking-span-31-days'))
    .rejects.toMatchObject({ code: 'MSG20' });
});

test('JOB-03 expires an unpaid booking only after payOS verifies its terminal unpaid state', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-with-proof');
  const intent = await connection.collection('paymentintents').findOne({ bookingId: new mongoose.Types.ObjectId(booking.id) });
  await connection.collection('paymentintents').updateOne({ _id: intent._id }, { $set: {
    linkState: 'READY', linkRequestedAt: at, paymentLinkId: 'synthetic-link',
    checkoutUrl: 'https://pay.payos.vn/web/synthetic-link'
  } });
  const started = await createBookingPaymentExpiryService({ connection,
    provider: { getPaymentLink: async orderCode => ({ orderCode, amount: intent.amountVnd,
      amountPaid: 0, providerStatus: 'PENDING' }) },
    clock: () => intent.expiresAt.getTime() + 1000 }).runBatch();
  expect(started).toMatchObject({ expired: 0, deferred: expect.any(Number) });
  expect((await checkout.read(owner, booking.id)).state).toBe('AWAITING_PAYMENT');
  const result = await createBookingPaymentExpiryService({ connection,
    provider: { getPaymentLink: async orderCode => ({ orderCode, amount: intent.amountVnd,
      amountPaid: 0, providerStatus: 'EXPIRED' }) },
    clock: () => intent.expiresAt.getTime() + 1000 }).runBatch();
  expect(result.expired).toBe(1);
  expect((await checkout.read(owner, booking.id)).state).toBe('PAYMENT_EXPIRED');
});

test('JOB-03 expires checkout abandoned before requesting a payOS link without lookup', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-never-opened-link');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const intent = await connection.collection('paymentintents').findOne({ bookingId });
  expect(intent).toMatchObject({ state: 'PENDING', version: 0 });
  expect(intent).not.toHaveProperty('linkRequestedAt');
  expect(intent).not.toHaveProperty('checkoutUrl');
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const worker = createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => intent.expiresAt.getTime() + 1000 });
  expect(await worker.runBatch()).toMatchObject({ expired: 1, deferred: 0 });
  expect(lookup).not.toHaveBeenCalled();
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('PAYMENT_EXPIRED');
  expect((await connection.collection('paymentintents').findOne({ _id: intent._id })).state).toBe('EXPIRED');
  expect(await connection.collection('visits').countDocuments({ bookingId, state: 'CANCELLED' })).toBe(1);
  expect(await connection.collection('financesourceevents').countDocuments({ _id: `booking-payment-expired:${bookingId}` })).toBe(1);
  expect(await worker.runBatch()).toMatchObject({ expired: 0 });
});

test('JOB-03 defers an attempted payOS link on lookup 404 instead of assuming no payment', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-uncertain-link');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const intent = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('paymentintents').updateOne({ _id: intent._id },
    { $set: { linkState: 'CREATING', linkRequestedAt: at } });
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => intent.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 0, deferred: 1 });
  expect(lookup).toHaveBeenCalledWith(Number(intent.providerReference));
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
  expect((await connection.collection('paymentintents').findOne({ _id: intent._id })).state).toBe('PENDING');
});

test('JOB-03 never expires an unsubmitted intent if a verified payment receipt already exists', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-local-with-receipt');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const intent = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('payments').insertOne({ bookingId, state: 'VERIFIED',
    amountVnd: intent.amountVnd, currency: 'VND' });
  const lookup = jest.fn();
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => intent.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 0, deferred: 1 });
  expect(lookup).not.toHaveBeenCalled();
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
  expect((await connection.collection('paymentintents').findOne({ _id: intent._id })).state).toBe('PENDING');
});

test('JOB-03 expires a replaced payOS link when the new intent was never submitted', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-replaced-unsubmitted');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  await checkout.paymentLink(owner, booking.id, 'replace-expiry-first-link');
  const original = await connection.collection('paymentintents').findOne({ bookingId });
  const replace = createBookingCheckoutService({ connection, clock: () => at.getTime(), provider: {
    createPaymentLink: provider.createPaymentLink,
    getPaymentLink: async orderCode => ({ orderCode, amount: original.amountVnd, amountPaid: 0,
      amountRemaining: original.amountVnd, providerStatus: 'CANCELLED' })
  }, webOrigin: 'http://127.0.0.1:5188', facilityAddress: 'Synthetic facility address' });
  await replace.paymentLink(owner, booking.id, 'replace-expiry-second-link');
  const previous = await connection.collection('paymentintents').findOne({ _id: original._id });
  const newest = await connection.collection('paymentintents').findOne({ bookingId, state: 'PENDING' });
  // The second link was created above; model a customer leaving immediately
  // after replacement's intent was persisted but before its provider request.
  await connection.collection('paymentintents').updateOne({ _id: newest._id },
    { $unset: { linkState: '', linkRequestedAt: '', checkoutUrl: '', paymentLinkId: '' } });
  expect(previous).toMatchObject({ state: 'CANCELLED', providerTerminalStatus: 'CANCELLED' });
  expect(newest.providerReference).not.toBe(original.providerReference);
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const worker = createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => original.expiresAt.getTime() + 1000 });
  expect(await worker.runBatch()).toMatchObject({ expired: 1, deferred: 0 });
  expect(lookup).not.toHaveBeenCalled();
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('PAYMENT_EXPIRED');
  expect((await connection.collection('paymentintents').findOne({ _id: previous._id })).state).toBe('CANCELLED');
  expect((await connection.collection('paymentintents').findOne({ _id: newest._id })).state).toBe('EXPIRED');
  expect(await connection.collection('visits').countDocuments({ bookingId, state: 'CANCELLED' })).toBe(1);
  expect(await connection.collection('financesourceevents').countDocuments({ _id: `booking-payment-expired:${bookingId}` })).toBe(1);
  expect(await worker.runBatch()).toMatchObject({ expired: 0 });
});

test('JOB-03 defers a replaced link when older terminal evidence is missing and payOS returns 404', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-missing-old-evidence');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const old = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('paymentintents').updateOne({ _id: old._id },
    { $set: { state: 'CANCELLED', linkState: 'READY', linkRequestedAt: at } });
  await connection.collection('paymentintents').insertOne({ _id: oid(), bookingId, provider: 'PAYOS',
    providerReference: '1777777777777', amountVnd: old.amountVnd, currency: 'VND', state: 'PENDING',
    version: 0, expiresAt: old.expiresAt, createdAt: at });
  const lookup = jest.fn(async () => { throw { code: 'PAYOS_REQUEST_FAILED', details: { providerHttpStatus: 404 } }; });
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => old.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 0, deferred: 1 });
  expect(lookup).toHaveBeenCalledWith(Number(old.providerReference));
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
});

test('JOB-03 checks an older replaced attempt without cached proof, but skips the unsubmitted new intent', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-older-attempt-lookup');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const old = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('paymentintents').updateOne({ _id: old._id },
    { $set: { state: 'CANCELLED', linkState: 'READY', linkRequestedAt: at } });
  await connection.collection('paymentintents').insertOne({ _id: oid(), bookingId, provider: 'PAYOS',
    providerReference: '1999999999999', amountVnd: old.amountVnd, currency: 'VND', state: 'PENDING',
    version: 0, expiresAt: old.expiresAt, createdAt: at });
  const lookup = jest.fn(async orderCode => ({ orderCode, amount: old.amountVnd, amountPaid: 0,
    providerStatus: 'CANCELLED' }));
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => old.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 1, deferred: 0 });
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(lookup).toHaveBeenCalledWith(Number(old.providerReference));
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('PAYMENT_EXPIRED');
});

test('JOB-03 rechecks a replacement intent claimed during provider reconciliation inside the transaction', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-replacement-race');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const old = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('paymentintents').updateOne({ _id: old._id },
    { $set: { state: 'CANCELLED', linkState: 'READY', linkRequestedAt: at } });
  const newestId = oid();
  await connection.collection('paymentintents').insertOne({ _id: newestId, bookingId, provider: 'PAYOS',
    providerReference: '1888888888888', amountVnd: old.amountVnd, currency: 'VND', state: 'PENDING',
    version: 0, expiresAt: old.expiresAt, createdAt: at });
  const lookup = jest.fn(async orderCode => {
    await connection.collection('paymentintents').updateOne({ _id: newestId },
      { $set: { linkState: 'CREATING', linkRequestedAt: at } });
    return { orderCode, amount: old.amountVnd, amountPaid: 0, providerStatus: 'CANCELLED' };
  });
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => old.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 0, deferred: 1 });
  expect(lookup).toHaveBeenCalledWith(Number(old.providerReference));
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
  expect((await connection.collection('paymentintents').findOne({ _id: newestId })).state).toBe('PENDING');
});

test('JOB-03 never expires replaced intents with a payment awaiting reconciliation', async () => {
  const q = await quote('home-care', 1);
  const booking = await checkout.confirm(owner, input(q), 'booking-expiry-replacement-receipt-review');
  const bookingId = new mongoose.Types.ObjectId(booking.id);
  const old = await connection.collection('paymentintents').findOne({ bookingId });
  await connection.collection('paymentintents').updateOne({ _id: old._id },
    { $set: { state: 'CANCELLED', providerTerminalStatus: 'CANCELLED' } });
  await connection.collection('paymentintents').insertOne({ _id: oid(), bookingId, provider: 'PAYOS',
    providerReference: '1666666666666', amountVnd: old.amountVnd, currency: 'VND', state: 'PENDING',
    version: 0, expiresAt: old.expiresAt, createdAt: at });
  await connection.collection('payments').insertOne({ bookingId, state: 'RECONCILIATION_REQUIRED',
    provider: 'PAYOS', providerEventId: 'synthetic-replacement-review-event',
    amountVnd: old.amountVnd, currency: 'VND' });
  const lookup = jest.fn();
  const result = await createBookingPaymentExpiryService({ connection, provider: { getPaymentLink: lookup },
    clock: () => old.expiresAt.getTime() + 1000 }).runBatch();
  expect(result).toMatchObject({ expired: 0, deferred: 1 });
  expect(lookup).not.toHaveBeenCalled();
  expect((await connection.collection('bookings').findOne({ _id: bookingId })).state).toBe('AWAITING_PAYMENT');
});


test('ST-BKG-21 / GBR-12: checkout options disable AI recommendations and list only sitters who previously cared for the customer', async () => {
  expect((await checkout.options(owner)).recommendationAllowed).toBe(false);
  const priorSitter = oid();
  await connection.collection('users').insertOne({ _id: priorSitter, displayName: 'Prior Care Sitter', state: 'ACTIVE', roles: ['PET_SITTER'] });
  await connection.collection('sitterstatuses').insertOne({ userId: priorSitter, status: 'ACTIVE' });
  expect((await checkout.options(owner)).sitters.map(s => s.id)).not.toContain(String(priorSitter));
  await connection.collection('visits').insertOne({ customerId: new mongoose.Types.ObjectId(owner.userId), sitterId: priorSitter, state: 'COMPLETED' });
  const after = await checkout.options(owner);
  expect(after.recommendationAllowed).toBe(false);
  expect(after.sitters).toContainEqual({ id: String(priorSitter), displayName: 'Prior Care Sitter' });
});

test('owned detail exposes saved pet names and assigned sitter name without contacts or private care notes', async () => {
  const q = await quote('home-care', 1), saved = await checkout.confirm(owner, input(q), 'detail-readable-owned-order');
  const sitterId = oid();
  await connection.collection('users').insertOne({ _id: sitterId, displayName: 'Synthetic assigned sitter', roles: ['PET_SITTER'], state: 'ACTIVE', privateContact: 'Do not expose' });
  await connection.collection('visits').updateMany({ bookingId: new mongoose.Types.ObjectId(saved.id) }, { $set: { state: 'ASSIGNED', sitterId } });
  const detail = await checkout.read(owner, saved.id);
  expect(detail.visits[0].petNames).toEqual(['Synthetic dog']);
  expect(detail.careShifts[0].sitterName).toBe('Synthetic assigned sitter');
  expect(JSON.stringify(detail)).not.toContain('Do not expose');
  expect(JSON.stringify(detail)).not.toContain('privateAccessNotes');
  await expect(checkout.read(other, saved.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});


test('checkout captures published workflow and later publication cannot rewrite booked care shifts', async () => {
  const { createServiceWorkflowService } = await import('../../src/services/care/service-workflow.service.js');
  const { serviceWorkflowVersionModel } = await import('../../src/models/service-workflow-version.model.js');
  const { serviceWorkflowDrafts } = await import('../../src/constants/service-workflow-drafts.js');
  const model = serviceWorkflowVersionModel(connection); await model.createCollection(); await model.createIndexes();
  const administrator = { userId: String(oid()), state: 'ACTIVE', roles: ['ADMIN'] };
  await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(administrator.userId), state: 'ACTIVE', roles: ['ADMIN'] });
  const service = services.find(row => row.code === 'home-care'), templates = createServiceWorkflowService({ connection, clock: () => +at });
  const definition = serviceWorkflowDrafts.find(row => row.code === 'home-care').definition;
  try {
    await templates.mutate(administrator, String(service._id), 'DRAFT', { expectedVersion: 0, definition }, 'checkout-workflow-v1-draft');
    await templates.mutate(administrator, String(service._id), 'PUBLISH', { expectedVersion: 1 }, 'checkout-workflow-v1-publish');
    const first = await checkout.confirm(owner, input(await quote('home-care', 1)), 'workflow-checkout-first');
    const booked = await connection.collection('visits').findOne({ bookingId: new mongoose.Types.ObjectId(first.id) });
    expect(booked.snapshots.workflow.definition.title).toBe(definition.title);
    await templates.mutate(administrator, String(service._id), 'DRAFT', { expectedVersion: 2, definition: { ...definition, title: 'Care V2' } }, 'checkout-workflow-v2-draft');
    await templates.mutate(administrator, String(service._id), 'PUBLISH', { expectedVersion: 3 }, 'checkout-workflow-v2-publish');
    const q2 = await quote('home-care', 1), body2 = input(q2); body2.visits[0].startAt = new Date(Date.parse(body2.visits[0].startAt) + 3 * 3600000).toISOString();
    const second = await checkout.confirm(owner, body2, 'workflow-checkout-second');
    expect((await connection.collection('visits').findOne({ bookingId: new mongoose.Types.ObjectId(second.id) })).snapshots.workflow.definition.title).toBe('Care V2');
    expect((await connection.collection('visits').findOne({ _id: booked._id })).snapshots.workflow).toEqual(booked.snapshots.workflow);
    const detail = await checkout.read(owner, first.id);
    expect(detail.details.visits[0].workflow.mode).toBe('VERSIONED');
  } finally {
    await connection.collection('services').updateOne({ _id: service._id }, { $unset: { workflowDraft: '', workflowPublished: '', workflowRevision: '' } });
  }
});
