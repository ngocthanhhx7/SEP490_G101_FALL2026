import { beforeAll, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { employeeSchedulingRuntimeModule } from '../../src/routes/employee-scheduling.routes.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { CHECKOUT_POLICY_VERSION } from '../../src/services/booking-proposals/checkout-snapshot.service.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createAiRepository } from '../../src/services/sitter-matching/matching.repository.js';
import { createVisitTravelService } from '../../src/services/employee-scheduling/visit-travel.service.js';
import { edgeKey } from '../../src/services/sitter-matching/routing.service.js';
import { createMongoCustomerReviewRepository } from '../../src/services/reviews/mongo-customer-review.repository.js';
import { createReviewService } from '../../src/services/reviews/review.service.js';
import { createReviewRouter } from '../../src/routes/review.routes.js';

const oid = () => new mongoose.Types.ObjectId(), clock = () => Date.parse('2026-10-30T03:00:00Z');
const actor = role => ({ userId: String(oid()), state: 'ACTIVE', roles: [role], authEpoch: 0 });
const staff = actor('STAFF'), customer = actor('CUSTOMER');
const windows = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, startLocalTime: '08:00', endLocalTime: '18:00' }));
let replica, connection, module, app, payroll, reviewApp, reviewNow = clock();
const serviceId = oid();
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_employee_scheduling' }).asPromise();
  await provisionFinanceSources(connection); await provisionEmployeeScheduling(connection); payroll = payrollModels(connection);
  for (const model of Object.values(payroll)) { await model.createCollection(); await model.createIndexes(); }
  for (const value of [staff, customer]) await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(value.userId), ...value });
  const sessionService = { authenticate: async req => {
    const user = req.get('x-test-actor'); if (!user) return null;
    const record = await connection.collection('users').findOne({ _id: new mongoose.Types.ObjectId(user) });
    return record ? { ...record, userId: user, expiresAt: clock() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  module = employeeSchedulingRuntimeModule({ connection, config: { auth: { enabled: true } }, clock, sessionService, env: { EMPLOYEE_SCHEDULING_ENABLED: 'true', VISIT_TRAVEL_ENABLED: 'true' } });
  app = express(); app.use(express.json(), requestId); app.use(module.mount, module.router); app.use(errorHandler(() => {}));
  const reviewClock = () => reviewNow;
  const reviews = createReviewService({ repository: createMongoCustomerReviewRepository({ connection }), clock: reviewClock });
  reviewApp = express(); reviewApp.use(express.json(), requestId);
  reviewApp.use('/reviews', createReviewRouter({ service: reviews, clock: reviewClock, sessionService: {
    ...sessionService, authenticate: async req => { const value = await sessionService.authenticate(req); return value && { ...value, expiresAt: reviewNow + 60000 }; }
  } })); reviewApp.use(errorHandler(() => {}));
  for (const model of Object.values(connection.models)) { await model.createCollection(); await model.createIndexes(); }
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

async function employee({ configure = true, contract = true } = {}) {
  const value = actor('PET_SITTER'), userId = new mongoose.Types.ObjectId(value.userId);
  await connection.collection('users').insertOne({ _id: userId, ...value });
  await connection.collection('sitterstatuses').insertOne({ userId, status: 'ACTIVE' });
  await connection.collection('sitterapplications').insertOne({ provisionedUserId: userId, state: 'APPROVED' });
  await connection.collection('aisitterprofiles').insertOne({ userId, active: true, serviceIds: [serviceId],
    species: ['DOG', 'CAT'], allowedTraits: [], maxWeightKg: 25, maxPets: 3, dayOffDates: [] });
  if (contract) await payroll.EmploymentContract.create({ employeeId: userId, version: 1, employmentType: 'PART_TIME', salaryBasis: 'GROSS',
    monthlyBaseVnd: 3000000, payCycle: 'MONTHLY', weeklyMinutes: 1200, signedAt: new Date('2026-10-01'), effectiveAt: new Date('2026-10-01'),
    contractReference: `synthetic-contract-${userId}`, workplaceRegion: 1, workplaceReference: 'Synthetic Hanoi workplace', verifiedBy: staff.userId, recordedAt: new Date(clock()) });
  if (configure) {
    await module.repository.areas.replaceMine({ actor: value, areas: ['DISTRICT_HAI_BA_TRUNG'], expectedVersion: 0, idempotencyKey: 'setup-areas' });
    await module.repository.availability.updateMine({ actor: value, command: { zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-10-30',
      workingWindows: windows, expectedVersion: 1, idempotencyKey: 'setup-windows' } });
  }
  return value;
}
async function visit({ start = '2026-11-02T02:00:00Z', minutes = 60, prepay = false, requestedSitterId, areaCode = 'DISTRICT_HAI_BA_TRUNG', boarding = false, net = 100000 } = {}) {
  const bookingId = oid(), visitId = oid(), row = { _id: visitId, bookingId, customerId: new mongoose.Types.ObjectId(customer.userId),
    serviceId, petIds: [oid()], sitterId: null, requestedSitterId: requestedSitterId ? new mongoose.Types.ObjectId(requestedSitterId) : null,
    state: 'SCHEDULED', version: 0, sequence: 0, areaCode, location: 'FACILITY', startAt: new Date(start), endAt: new Date(Date.parse(start) + minutes * 60000),
    snapshots: { serviceName: 'Synthetic service', serviceAddress: 'Synthetic private facility', employeeServiceNetVnd: net, boarding, pets: [{ id: String(oid()), name: 'Synthetic dog', species: 'DOG', weightKg: 4, traits: [] }] } };
  await connection.collection('bookings').insertOne({ _id: bookingId, customerId: row.customerId, version: 0, financeGuardVersion: 0,
    originalVisitCount: 1, careVisitCount: 1, visitIds: [visitId], carePlanState: 'APPROVED', state: prepay ? 'AWAITING_PAYMENT' : 'DISPATCH_PENDING',
    paymentMode: prepay ? 'PREPAY' : 'POSTPAY', paymentState: 'UNPAID', paymentSnapshot: { amountVnd: net, currency: 'VND' },
    checkoutSnapshot: { policyVersion: CHECKOUT_POLICY_VERSION, customerVisits: [row] } });
  await connection.collection('visits').insertOne(row); return row;
}

test('travel access is scoped, location is ordered, stop invalidates in-flight updates, and arrival never completes care', async () => {
  const sitter = await employee(), other = await employee(), row = await visit({ start: '2026-10-30T03:30:00Z' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { sitterId: new mongoose.Types.ObjectId(sitter.userId), state: 'ASSIGNED', 'snapshots.point': { type: 'Point', coordinates: [105.86, 21.02] } } });
  let now = clock(), calls = 0;
  const travel = createVisitTravelService({ repository: module.repository, clock: () => now, routingProvider: {
    edgeKey, matrix: async points => { calls++; return { map: new Map([[edgeKey(...points), 7]]), source: 'SYNTHETIC_ROUTE', recordedAt: new Date(now) }; }
  } });
  const visitId = String(row._id), get = value => request(app).get(`/api/v1/employee-scheduling/visits/${visitId}/travel`).set('x-test-actor', value.userId);
  await get(other).expect(404); await get(customer).expect(200);
  const staffList = await request(app).get('/api/v1/employee-scheduling/travel-visits').set('x-test-actor', staff.userId).expect(200);
  expect(staffList.body.data.items.some(item => item.id === visitId)).toBe(true);
  expect(JSON.stringify(staffList.body)).not.toContain('Synthetic private facility');
  await request(app).get('/api/v1/employee-scheduling/travel-visits').set('x-test-actor', customer.userId).expect(403);
  const customerCommand = request(app).post(`/api/v1/employee-scheduling/visits/${visitId}/travel`).set('Host', 'localhost').set('Origin', 'http://localhost').set('x-test-actor', customer.userId).set('x-csrf-token', 'synthetic-csrf');
  await customerCommand.send({ action: 'START', expectedVersion: 0 }).expect(403);
  const initial = await travel.command(sitter, visitId, { action: 'START', expectedVersion: 0 });
  const sample = { sessionId: initial.sessionId, coordinates: [105.85, 21.01], accuracyMeters: 12, observedAt: new Date(now).toISOString() };
  await expect(travel.locate(other, visitId, sample)).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED' });
  await travel.locate(sitter, visitId, sample);
  expect(await travel.get(customer, visitId)).toMatchObject({ fresh: true, location: { coordinates: sample.coordinates } });
  expect((await travel.get(customer, visitId)).sessionId).toBeUndefined();
  await expect(travel.locate(sitter, visitId, sample)).rejects.toMatchObject({ code: 'LOCATION_OUT_OF_ORDER' });
  expect(await travel.eta(customer, visitId, {})).toMatchObject({ minutes: 7, advisory: true, source: 'SYNTHETIC_ROUTE' }); expect(calls).toBe(1);
  now += 91000;
  expect(await travel.get(customer, visitId)).toMatchObject({ fresh: false, location: null });
  await expect(travel.eta(customer, visitId, {})).rejects.toMatchObject({ code: 'LOCATION_STALE' }); expect(calls).toBe(1);
  await expect(travel.locate(sitter, visitId, sample)).rejects.toMatchObject({ code: 'LOCATION_STALE' });
  await travel.command(sitter, visitId, { action: 'STOP', expectedVersion: 1 });
  await expect(travel.locate(sitter, visitId, { ...sample, observedAt: new Date(now).toISOString() })).rejects.toMatchObject({ code: 'LOCATION_SHARING_STOPPED' });
  await travel.command(sitter, visitId, { action: 'START', expectedVersion: 2 });
  await travel.command(sitter, visitId, { action: 'ARRIVED', expectedVersion: 3 });
  expect(await travel.get(customer, visitId)).toMatchObject({ state: 'ARRIVED', sharing: false, location: null });
  const visitAfter = await connection.collection('visits').findOne({ _id: row._id });
  expect(visitAfter.state).toBe('ASSIGNED'); expect(visitAfter.version).toBe(0); expect(visitAfter.evidenceRefs).toBeUndefined();
  expect((await connection.collection('bookings').findOne({ _id: row.bookingId })).paymentState).toBe('UNPAID');
  const indexes = await module.repository.models.EmployeeVisitTravel.collection.listIndexes().toArray();
  expect(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBe(true);
});

test('care snapshot is assigned-only, excludes access notes, requires acknowledgement and revokes reassigned access', async () => {
  const sitter = await employee(), other = await employee(), row = await visit({ start: '2026-10-30T03:30:00Z' });
  const visitId = String(row._id), root = `/api/v1/employee-scheduling/visits/${visitId}`;
  const care = { schemaVersion: 1, capturedAt: new Date(clock()), privateAccessNotes: 'Synthetic private entry',
    pets: [{ id: String(oid()), name: 'Synthetic dog', weightKg: 4, careProfile: { allergies: { status: 'UNKNOWN' } } }] };
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { state: 'ASSIGNED', sitterId: new mongoose.Types.ObjectId(sitter.userId), 'snapshots.care': care } });
  const get = (actor, path = '/care') => request(app).get(root + path).set('x-test-actor', actor.userId);
  await get(other).expect(404); await get(customer).expect(403); await get(staff).expect(403);
  const result = await get(sitter).expect(200);
  expect(result.body.data).toMatchObject({ source: 'OWNER_DECLARED_AT_CHECKOUT', acknowledged: false, pets: care.pets });
  expect(JSON.stringify(result.body)).not.toContain('Synthetic private entry');
  await get(sitter, '/access-notes').expect(403);
  const acknowledge = () => request(app).post(root + '/care/acknowledgements').set('x-test-actor', sitter.userId).set('Host', 'localhost')
    .set('Origin', 'http://localhost').set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'snapshot-ack-001').send({ version: result.body.data.version });
  await acknowledge().expect(200); await acknowledge().expect(200);
  expect((await get(sitter, '/access-notes').expect(200)).body.data.privateAccessNotes).toBe('Synthetic private entry');
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { sitterId: new mongoose.Types.ObjectId(other.userId) } });
  await get(sitter).expect(404); await get(sitter, '/access-notes').expect(404);
  await get(other, '/access-notes').expect(403);
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { handoverRequired: true, handoverAccepted: false } });
  await get(other).expect(403);
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { handoverRequired: false, state: 'COMPLETED' } });
  await get(other).expect(404);
  const early = await visit({ start: '2026-11-03T03:30:00Z' });
  await connection.collection('visits').updateOne({ _id: early._id }, { $set: { sitterId: new mongoose.Types.ObjectId(sitter.userId), state: 'ASSIGNED', 'snapshots.care': care } });
  await request(app).get(`/api/v1/employee-scheduling/visits/${early._id}/access-notes`).set('x-test-actor', sitter.userId).expect(403);
  await connection.collection('visits').updateOne({ _id: early._id }, { $unset: { 'snapshots.care': 1 } });
  await request(app).get(`/api/v1/employee-scheduling/visits/${early._id}/care`).set('x-test-actor', sitter.userId).expect(503);
});

test('travel rejects poor accuracy/future times, hides completed/reassigned/cancelled work, and honors end cutoff', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-10-30T03:30:00Z' }), visitId = String(row._id);
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { sitterId: new mongoose.Types.ObjectId(sitter.userId), state: 'ASSIGNED' } });
  let now = clock(); const travel = createVisitTravelService({ repository: module.repository, clock: () => now });
  const started = await travel.command(sitter, visitId, { action: 'START', expectedVersion: 0 });
  const sample = { sessionId: started.sessionId, coordinates: [105.85, 21.01], accuracyMeters: 20, observedAt: new Date(now).toISOString() };
  await expect(travel.locate(sitter, visitId, { ...sample, accuracyMeters: 101 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  await expect(travel.locate(sitter, visitId, { ...sample, observedAt: new Date(now + 11000).toISOString() })).rejects.toMatchObject({ code: 'LOCATION_STALE' });
  await travel.locate(sitter, visitId, sample);
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'CANCELLED' } });
  expect(await travel.get(customer, visitId)).toMatchObject({ available: false, location: null });
  await expect(travel.command(sitter, visitId, { action: 'START', expectedVersion: 1 })).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED' });
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'ASSIGNED' } });
  now = row.endAt.getTime();
  expect(await travel.get(customer, visitId)).toMatchObject({ available: false, location: null });
  await expect(travel.command(sitter, visitId, { action: 'START', expectedVersion: 1 })).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { sitterId: oid() } });
  await expect(travel.get(sitter, visitId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  expect(await travel.get(customer, visitId)).toMatchObject({ location: null });
});

test('two screens persist shared versions, replay commands, keep future schedule from changing earlier dates, and require signed active contracts', async () => {
  const sitter = await employee();
  const current = await module.repository.areas.getMine({ actor: sitter }); expect(current.expectedVersion).toBe(2);
  expect(current.selectedCodes).toEqual(['DISTRICT_HAI_BA_TRUNG']);
  const command = { zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-11-05', workingWindows: [], expectedVersion: 2, idempotencyKey: 'future-schedule' };
  const saved = await module.repository.availability.updateMine({ actor: sitter, command });
  expect(await module.repository.availability.updateMine({ actor: sitter, command })).toEqual(saved);
  const calendar = await module.repository.availability.listMyCalendar({ actor: sitter, fromLocalDate: '2026-11-04', toLocalDate: '2026-11-06' });
  expect(calendar.map(row => row.available)).toEqual([true, false, false]);
  await expect(module.repository.areas.replaceMine({ actor: sitter, areas: [], expectedVersion: 2, idempotencyKey: 'stale-areas' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  const unsigned = await employee({ configure: false, contract: false });
  await expect(module.repository.areas.replaceMine({ actor: unsigned, areas: [], expectedVersion: 0, idempotencyKey: 'unsigned-areas' })).rejects.toMatchObject({ code: 'CONTRACT_REQUIRED' });
  await connection.collection('sitterstatuses').updateOne({ userId: new mongoose.Types.ObjectId(sitter.userId) }, { $set: { status: 'SUSPENDED' } });
  await expect(module.repository.areas.replaceMine({ actor: sitter, areas: [], expectedVersion: 3, idempotencyKey: 'suspended-areas' })).rejects.toMatchObject({ code: 'SITTER_NOT_ELIGIBLE' });
});

test('confirmed assignments block incompatible area/time removal and pending invitation is not an assignment', async () => {
  const sitter = await employee(), row = await visit();
  const offer = await module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'invite-persisted');
  expect((await connection.collection('visits').findOne({ _id: row._id })).sitterId).toBeNull();
  const read = await module.dispatch.offers.list(sitter);
  expect(read.items[0]).toMatchObject({ id: offer.offerId, canRespond: true });
  expect(JSON.stringify(read)).not.toContain('Synthetic private facility');
  await module.dispatch.offers.accept(sitter, offer.offerId, 0, 'accept-persisted');
  expect((await module.dispatch.offers.assignments(sitter)).items[0].serviceAddress).toBe('Synthetic private facility');
  expect(await module.dispatch.offers.accept(sitter, offer.offerId, 0, 'accept-persisted')).toMatchObject({ state: 'ASSIGNED' });
  await expect(module.repository.areas.replaceMine({ actor: sitter, areas: [], expectedVersion: 2, idempotencyKey: 'remove-confirmed-area' })).rejects.toMatchObject({ code: 'CONFIRMED_VISIT_CONFLICT' });
  await expect(module.repository.availability.updateMine({ actor: sitter, command: { zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-10-30',
    workingWindows: [], expectedVersion: 2, idempotencyKey: 'remove-confirmed-time' } })).rejects.toMatchObject({ code: 'CONFIRMED_VISIT_CONFLICT' });
  expect((await module.repository.areas.getMine({ actor: sitter })).expectedVersion).toBe(2);
});

test('prepay requires an exact verified receipt; directed invitation never substitutes another employee', async () => {
  const first = await employee(), other = await employee(), row = await visit({ prepay: true, requestedSitterId: first.userId });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: first.userId, expectedVersion: 0 }, 'prepay-unpaid')).rejects.toMatchObject({ code: 'VISIT_UNAVAILABLE' });
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'DISPATCH_PENDING', paymentState: 'PAID' } });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: first.userId, expectedVersion: 0 }, 'prepay-no-receipt')).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED' });
  await connection.collection('payments').insertOne({ bookingId: row.bookingId, provider: 'SYNTHETIC', providerEventId: String(oid()), state: 'VERIFIED', receiptMoney: { amountVnd: 100000, currency: 'VND' } });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: other.userId, expectedVersion: 0 }, 'directed-wrong')).rejects.toMatchObject({ code: 'DIRECTED_SITTER_MISMATCH' });
  const offer = await module.dispatch.invite(staff, String(row._id), { expectedVersion: 0 }, 'directed-auto'); expect(offer.sitterId).toBe(first.userId);
  await expect(module.dispatch.offers.accept(other, offer.offerId, 0, 'foreign-accept')).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await module.repository.availability.updateMine({ actor: first, command: { zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-10-30', workingWindows: [], expectedVersion: 2, idempotencyKey: 'change-before-accept' } });
  await expect(module.dispatch.offers.accept(first, offer.offerId, 0, 'recheck-on-accept')).rejects.toMatchObject({ code: 'OUTSIDE_WORKING_HOURS' });
});

test('concurrent acceptance of overlapping visits serializes through the employee guard', async () => {
  const sitter = await employee(), a = await visit({ start: '2026-11-03T02:00:00Z' }), b = await visit({ start: '2026-11-03T02:30:00Z' });
  const invites = await Promise.all([a, b].map((row, index) => module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, `concurrent-invite-${index}`)));
  const results = await Promise.allSettled(invites.map((offer, index) => module.dispatch.offers.accept(sitter, offer.offerId, 0, `concurrent-accept-${index}`)));
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(row => row.status === 'rejected').reason.code).toBe('SLOT_UNAVAILABLE');
  expect(await connection.collection('visits').countDocuments({ sitterId: new mongoose.Types.ObjectId(sitter.userId), state: 'ASSIGNED' })).toBe(1);
});

test('boarding finalization preserves customer price/count and apportions integer commission basis across unassigned shifts', async () => {
  const row = await visit({ start: '2026-11-05T01:00:00Z', minutes: 2880, boarding: true, net: 100001 });
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { carePlanState: 'NEEDS_REVIEW' } });
  const body = { expectedVersion: 0, shiftMinutes: 480 }, plan = await module.carePlans.preview(staff, String(row.bookingId), body);
  expect(plan.shifts).toHaveLength(6);
  expect(plan.shifts.reduce((sum, shift) => sum + shift.serviceNetVnd, 0)).toBe(100001);
  const result = await module.carePlans.finalize(staff, String(row.bookingId), body, 'boarding-finalize');
  expect(await module.carePlans.finalize(staff, String(row.bookingId), body, 'boarding-finalize')).toEqual(result);
  const booking = await connection.collection('bookings').findOne({ _id: row.bookingId });
  expect(booking).toMatchObject({ originalVisitCount: 1, careVisitCount: 6, state: 'DISPATCH_PENDING', paymentSnapshot: { amountVnd: 100001 } });
  expect(booking.checkoutSnapshot.customerVisits).toHaveLength(1);
  const shifts = await connection.collection('visits').find({ _id: { $in: booking.visitIds } }).toArray();
  expect(shifts.every(shift => shift.sitterId === null && shift.state === 'SCHEDULED' && shift.endAt - shift.startAt <= 480 * 60000)).toBe(true);
  await expect(module.carePlans.finalize(staff, String(row.bookingId), { ...body, assignments: [staff.userId] }, 'direct-assignment-blocked')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

test('HTTP routes enforce role, ownership, CSRF and private no-store responses', async () => {
  const sitter = await employee(), other = await employee();
  await request(app).get('/api/v1/employee-scheduling/work-areas').expect(401);
  await request(app).get('/api/v1/employee-scheduling/work-areas').set('x-test-actor', customer.userId).expect(403);
  await request(app).get('/api/v1/employee-scheduling/work-areas').set('x-test-actor', sitter.userId).expect(200).expect('Cache-Control', 'private, no-store');
  await request(app).put('/api/v1/employee-scheduling/work-areas').set('x-test-actor', sitter.userId).send({ areas: [], expectedVersion: 2 }).expect(403);
  const read = await request(app).get('/api/v1/employee-scheduling/work-areas').set('x-test-actor', other.userId).expect(200);
  expect(read.body.data.selectedCodes).toEqual(['DISTRICT_HAI_BA_TRUNG']);
  await request(app).post('/api/v1/employee-scheduling/visits/000000000000000000000000/invitations').set('x-test-actor', sitter.userId).set('x-csrf-token', 'synthetic-csrf').send({ expectedVersion: 0 }).expect(403);
});

test('agent resumes durable queue without duplicate invitations, skips payment/plan gates and sends expired directed offers to Staff review', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-11-10T02:00:00Z', requestedSitterId: sitter.userId });
  const unpaid = await visit({ start: '2026-11-11T02:00:00Z', prepay: true, requestedSitterId: sitter.userId });
  const unfinished = await visit({ start: '2026-11-12T02:00:00Z', requestedSitterId: sitter.userId });
  await connection.collection('bookings').updateOne({ _id: unfinished.bookingId }, { $set: { carePlanState: 'NEEDS_REVIEW' } });
  await Promise.all([module.dispatch.runBatch({ limit: 20 }), module.dispatch.runBatch({ limit: 20 })]);
  const offers = await module.repository.models.EmployeeVisitOffer.find({ visitId: row._id }).lean(); expect(offers).toHaveLength(1);
  expect(offers[0].sitterId).toBe(sitter.userId);
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: { $in: [unpaid._id, unfinished._id] } })).toBe(0);
  await module.repository.models.EmployeeVisitOffer.updateOne({ _id: offers[0]._id }, { $set: { deadline: new Date(clock() - 1) } });
  await module.dispatch.runBatch({ limit: 20 });
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id })).toBe(1);
  expect((await connection.collection('visits').findOne({ _id: row._id })).dispatchReview.code).toBe('STAFF_REVIEW_REQUIRED');
});

test('service capability, pet needs, approved leave, city coverage, travel evidence and contracted hours remain authoritative', async () => {
  const sitter = await employee(), employeeId = new mongoose.Types.ObjectId(sitter.userId), row = await visit({ start: '2026-11-16T02:00:00Z' });
  await connection.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { serviceIds: [] } });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'capability-missing')).rejects.toMatchObject({ code: 'SERVICE_CAPABILITY_REQUIRED' });
  await connection.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { serviceIds: [serviceId], maxWeightKg: 2 } });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'pet-capability')).rejects.toMatchObject({ code: 'PET_CAPABILITY_MISMATCH' });
  await connection.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { maxWeightKg: 25, dayOffDates: ['2026-11-16'] } });
  await expect(module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'approved-leave')).rejects.toMatchObject({ code: 'DAY_OFF' });
  await connection.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { dayOffDates: [] } });
  await module.repository.areas.replaceMine({ actor: sitter, areas: ['CITY_HANOI'], expectedVersion: 2, idempotencyKey: 'city-coverage' });
  const offer = await module.dispatch.invite(staff, String(row._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'city-invitation');
  await module.dispatch.offers.accept(sitter, offer.offerId, 0, 'city-acceptance');
  const following = await visit({ start: '2026-11-16T03:00:00Z' });
  await connection.collection('visits').updateOne({ _id: following._id }, { $set: { location: 'HOME', addressId: oid(), 'snapshots.serviceAddress': 'Synthetic other home' } });
  await expect(module.dispatch.invite(staff, String(following._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'travel-required')).rejects.toMatchObject({ code: 'TRAVEL_REVIEW_REQUIRED' });
  const long = await visit({ start: '2026-11-17T01:00:00Z', minutes: 481 });
  await expect(module.dispatch.invite(staff, String(long._id), { sitterId: sitter.userId, expectedVersion: 0 }, 'long-shift')).rejects.toMatchObject({ code: 'SHIFT_REVIEW_REQUIRED' });
});

test('paid boarding care shifts feed actual attendance and immutable employee credits without legacy partner price fields', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-11-19T02:00:00Z', minutes: 120, boarding: true, prepay: true, net: 100001 });
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { carePlanState: 'NEEDS_REVIEW', state: 'DISPATCH_PENDING', paymentState: 'PAID' } });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { 'snapshots.checklistItemIds': ['care'] } });
  row.snapshots.checklistItemIds = ['care'];
  row.snapshots.care = { schemaVersion: 1, capturedAt: new Date(clock()), privateAccessNotes: 'Synthetic boarding care secret', pets: [{ careProfile: { allergies: { status: 'UNKNOWN' } } }] };
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { 'checkoutSnapshot.customerVisits': [row] } });
  await connection.collection('payments').insertOne({ bookingId: row.bookingId, provider: 'SYNTHETIC', providerEventId: String(oid()), state: 'VERIFIED',
    receiptMoney: { amountVnd: 100001, currency: 'VND' }, verifiedAt: new Date(clock()) });
  const plan = await module.carePlans.finalize(staff, String(row.bookingId), { expectedVersion: 0, shiftMinutes: 60 }, 'care-to-payroll-plan');
  const first = await module.dispatch.invite(staff, plan.visits[0].id, { sitterId: sitter.userId, expectedVersion: 0 }, 'care-to-payroll-invite-0');
  const careShift = await connection.collection('visits').findOne({ _id: new mongoose.Types.ObjectId(plan.visits[0].id) });
  expect(careShift.snapshots.care).toEqual(row.snapshots.care);
  const offerSnapshot = await module.repository.models.EmployeeVisitOffer.findById(first.offerId).lean();
  expect(JSON.stringify(offerSnapshot)).not.toContain('Synthetic boarding care secret');
  expect(JSON.stringify(offerSnapshot)).not.toContain('careProfile');
  await module.dispatch.offers.accept(sitter, first.offerId, 0, 'care-to-payroll-accept-0');
  let at = new Date(row.startAt);
  const finance = createBookingFinanceSourceService({ connection, clock: () => at });
  for (const [index, shift] of plan.visits.entries()) {
    if (index) {
      const offered = await module.dispatch.invite(staff, shift.id, { sitterId: sitter.userId, expectedVersion: 0 }, 'care-to-payroll-invite-1');
      await module.dispatch.offers.accept(sitter, offered.offerId, 0, 'care-to-payroll-accept-1');
    }
    const media = [String(index + 5).repeat(64), String(index + 7).repeat(64)];
    for (const mediaId of media) await connection.collection('privateimages').insertOne({ _id: mediaId, ownerId: new mongoose.Types.ObjectId(sitter.userId),
      state: 'READY', byteLength: 100, contentDigest: 'a'.repeat(64) });
    at = new Date(shift.startAt);
    let current = await connection.collection('visits').findOne({ _id: new mongoose.Types.ObjectId(shift.id) });
    const input = { actor: sitter, visitId: shift.id, expectedVersion: current.version, idempotencyKey: `care-payroll-check-in-${index}`, mediaId: media[0] };
    const started = await finance.checkIn(input);
    await finance.updateChecklist({ ...input, expectedVersion: started.version, idempotencyKey: `care-payroll-checklist-${index}`, items: [{ itemId: 'care', status: 'DONE' }] });
    at = new Date(shift.endAt); current = await connection.collection('visits').findOne({ _id: new mongoose.Types.ObjectId(shift.id) });
    await finance.checkOut({ ...input, expectedVersion: current.version, idempotencyKey: `care-payroll-check-out-${index}`, mediaId: media[1] });
    if (!index) expect(await payroll.PayrollServiceCredit.countDocuments({ bookingId: row.bookingId })).toBe(0);
  }
  const credits = await payroll.PayrollServiceCredit.find({ bookingId: row.bookingId }).lean();
  expect(credits).toHaveLength(2); expect(credits.reduce((sum, credit) => sum + credit.serviceNetVnd, 0)).toBe(100001);
  expect(credits.map(credit => credit.careMinutes)).toEqual([60, 60]);
  const ratingUrl = `/reviews/visits/${plan.visits[0].id}/ratings`;
  expect((await connection.collection('bookings').findOne({ _id: row.bookingId })).state).toBe('COMPLETED');
  reviewNow = at.getTime() + 60000;
  const rate = actor => request(reviewApp).post(ratingUrl).set('x-test-actor', actor.userId).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'verified-rating-001');
  await rate(sitter).send({ rating: 4 }).expect(403);
  const body = { rating: 4, expectedVersion: credits[0].sourceVersion };
  const [a, b] = await Promise.all([rate(customer).send(body), rate(customer).send(body)]);
  expect(a.status).toBe(201); expect(b.status).toBe(201); expect(a.body.data).toEqual(b.body.data);
  expect(a.body.data.review.state).toBe('SUBMITTED');
  const outcome = await connection.models.SitterVisitOutcome.findOne({ visitId: plan.visits[0].id }).select('+provenance').lean();
  expect(outcome).toMatchObject({ rating: 4, resolution: 'COMPLETED', sourceRef: `customer-review:${a.body.data.review.id}:0`,
    provenance: { bookingId: String(row.bookingId), creditId: String(credits[0]._id), trainingEligible: false } });
  await rate(customer).send({ ...body, rating: 5 }).expect(409);
  expect(await connection.models.SitterVisitOutcome.countDocuments({ visitId: plan.visits[0].id })).toBe(1);
  const stranger = actor('CUSTOMER'); await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(stranger.userId), ...stranger });
  await rate(stranger).send(body).expect(404);
  const second = `/reviews/visits/${plan.visits[1].id}/ratings`;
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'IN_PROGRESS' } });
  await request(reviewApp).post(second).set('x-test-actor', customer.userId).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'unverified-rating-002').send({ rating: 5 }).expect(409);
  expect(await connection.models.SitterVisitOutcome.countDocuments({ visitId: plan.visits[1].id })).toBe(0);
});

test('Staff proposes a new directed time; only the owning customer may confirm before an atomic invitation is created', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-11-23T02:00:00Z', requestedSitterId: sitter.userId });
  const old = await connection.collection('bookings').findOne({ _id: row.bookingId });
  const body = { expectedVersion: 0, startAt: '2026-11-23T04:00:00Z' };
  const proposal = await module.proposals.propose(staff, String(row._id), body, 'staff-proposes-time');
  expect(proposal.state).toBe('PENDING_CUSTOMER_CONFIRMATION');
  expect((await connection.collection('visits').findOne({ _id: row._id })).startAt).toEqual(row.startAt);
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id })).toBe(0);
  const stranger = actor('CUSTOMER');
  await expect(module.proposals.getProposal({ actor: stranger, proposalId: proposal.id })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const input = { actor: customer, proposalId: proposal.id, expectedVersion: 0, selectedSlot: proposal.slots[0], idempotencyKey: 'customer-confirms-time' };
  const result = await module.proposals.confirmProposal(input);
  expect(result.offer).toMatchObject({ state: 'PENDING', sitterId: sitter.userId });
  expect(await module.proposals.confirmProposal(input)).toEqual(result);
  await expect(module.proposals.confirmProposal({ ...input, selectedSlot: { ...proposal.slots[0], startAt: '2026-11-23T03:30:00Z' } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  const changed = await connection.collection('visits').findOne({ _id: row._id });
  expect(changed.startAt).toEqual(new Date(body.startAt)); expect(changed.sitterId).toBeNull();
  expect((await connection.collection('bookings').findOne({ _id: row.bookingId })).checkoutSnapshot).toEqual(old.checkoutSnapshot);
  await module.dispatch.offers.accept(sitter, result.offer.id, 0, 'sitter-confirms-new-time');
  expect((await connection.collection('visits').findOne({ _id: row._id })).state).toBe('ASSIGNED');
  await request(app).post(`/api/v1/employee-scheduling/proposals/${proposal.id}/confirmation`).set('x-test-actor', customer.userId)
    .set('origin', 'http://127.0.0.1').set('host', '127.0.0.1')
    .set('x-csrf-token', 'synthetic-csrf').set('idempotency-key', 'injected-actor-rejected')
    .send({ expectedVersion: 0, selectedSlot: proposal.slots[0], actor: stranger }).expect(422);
});

test('AI candidates use employee registered areas and effective shifts instead of stale Staff matching windows', async () => {
  const sitter = await employee(), employeeId = new mongoose.Types.ObjectId(sitter.userId);
  await connection.collection('aisitterprofiles').updateOne({ userId: employeeId }, { $set: { areaCodes: ['STALE_AREA'], windows: [] } });
  const ai = createAiRepository(connection, clock, { employeeSchedulingEnabled: true });
  const slot = { start: Date.parse('2026-11-24T02:00:00Z'), end: Date.parse('2026-11-24T03:00:00Z'), localDate: '2026-11-24' };
  const context = { service: { _id: serviceId }, address: { areaCode: 'DISTRICT_HAI_BA_TRUNG' }, pets: [] };
  const initial = await ai.candidates(context, slot), candidate = initial.profiles.find(row => String(row.userId) === sitter.userId);
  expect(candidate.windows).toContainEqual({ weekday: 2, startMinute: 480, endMinute: 1080 });
  await module.repository.areas.replaceMine({ actor: sitter, areas: [], expectedVersion: 2, idempotencyKey: 'ai-area-removed' });
  const updated = await ai.candidates(context, slot);
  expect(updated.profiles.some(row => String(row.userId) === sitter.userId)).toBe(false);
});
