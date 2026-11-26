import { digest } from '../../src/validators/pet-care.validator.js';
import { createSitterCapabilityService } from '../../src/services/sitter-capability.service.js';
import { createOperationalRanker } from '../../src/services/sitter-matching/operational-ranker.service.js';
import { beforeAll, afterAll, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { employeeSchedulingRuntimeModule } from '../../src/routes/employee-scheduling.routes.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { recordEmployeeServiceCompletion } from '../../src/services/payroll/completion-payroll-source.service.js';
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
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { employeePayrollPolicyResolver } from '../../src/constants/employee-payroll-policy.js';
import { createEmployeeDispatchService } from '../../src/services/employee-scheduling/employee-dispatch.service.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';
import { financeSourceRuntime } from '../../src/routes/finance-source-runtime.js';
import sharp from 'sharp';
import { privateImageModule } from '../../src/routes/private-image.routes.js';
import { privateImageModels } from '../../src/models/private-image.model.js';
import { createPrivateImageService } from '../../src/services/private-image.service.js';
import { requireSession, requireCsrf } from '../../src/middlewares/session.js';
import { createBookingCheckoutService } from '../../src/services/booking-proposals/booking-checkout.service.js';
import { reasonsOfVisit } from '../../src/services/employee-scheduling/needs-action.service.js';

const oid = () => new mongoose.Types.ObjectId(), clock = () => Date.parse('2026-10-30T03:00:00Z');
const actor = role => ({ userId: String(oid()), state: 'ACTIVE', roles: [role], authEpoch: 0 });
const staff = actor('STAFF'), customer = actor('CUSTOMER');
const windows = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, startLocalTime: '08:00', endLocalTime: '18:00' }));
let replica, connection, module, app, payroll, reviewApp, payrollService, sessionService, reviewNow = clock();
const serviceId = oid();
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_employee_scheduling' }).asPromise();
  await provisionFinanceSources(connection); await provisionEmployeeScheduling(connection); payroll = payrollModels(connection);
  for (const model of Object.values(payroll)) { await model.createCollection(); await model.createIndexes(); }
  for (const value of [staff, customer]) await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(value.userId), ...value });
  sessionService = { authenticate: async req => {
    const user = req.get('x-test-actor'); if (!user) return null;
    const record = await connection.collection('users').findOne({ _id: new mongoose.Types.ObjectId(user) });
    return record ? { ...record, userId: user, expiresAt: clock() + 60000 } : null;
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  module = employeeSchedulingRuntimeModule({ connection, config: { auth: { enabled: true } }, clock, sessionService, env: { EMPLOYEE_SCHEDULING_ENABLED: 'true', VISIT_TRAVEL_ENABLED: 'true', EMPLOYEE_DISPATCH_AGENT_ENABLED: 'true' } });
  payrollService = createPayrollService({ connection, policy: employeePayrollPolicyResolver, clock });
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

test.each([undefined, 'false', 'true'])('dispatch reports travel capability for VISIT_TRAVEL_ENABLED=%s', async flag => {
  const runtime = employeeSchedulingRuntimeModule({
    connection, config: { auth: { enabled: true } }, clock, sessionService,
    env: { EMPLOYEE_SCHEDULING_ENABLED: 'true', VISIT_TRAVEL_ENABLED: flag }
  });
  const server = express();
  server.use(requestId);
  server.use(runtime.mount, runtime.router);
  server.use(errorHandler(() => {}));

  const result = await request(server).get(`${runtime.mount}/dispatch`).set('x-test-actor', staff.userId).expect(200);
  expect(result.body.data).toMatchObject({ visitTravelEnabled: flag === 'true', items: expect.any(Array) });
  await request(server).get(`${runtime.mount}/travel-visits`).set('x-test-actor', staff.userId)
    .expect(flag === 'true' ? 200 : 404);
});

test('reads only the exact invitation owned by the signed-in sitter', async () => {
  const assigned = await employee(), other = await employee();
  const visitId = oid(), declined = oid(), pending = oid();
  const offer = { visitId, sitterId: assigned.userId, deadline: new Date(clock() + 60000), version: 1,
    offeredAt: new Date(clock()), serviceName: 'Chăm sóc thử', areaCode: 'TEST-AREA',
    startAt: new Date(clock() + 3600000), endAt: new Date(clock() + 7200000) };
  await connection.collection('employeevisitoffers').insertMany([
    { ...offer, _id: declined, state: 'DECLINED' }, { ...offer, _id: pending, state: 'PENDING' }
  ]);
  const url = '/api/v1/employee-scheduling/offers/' + declined;
  const result = await request(app).get(url).set('x-test-actor', assigned.userId).expect(200);
  expect(result.body.data).toMatchObject({ id: String(declined), visitId: String(visitId), state: 'DECLINED', canRespond: false });
  await request(app).get(url).set('x-test-actor', other.userId).expect(404);
  await request(app).get('/api/v1/employee-scheduling/offers/' + visitId).set('x-test-actor', assigned.userId).expect(404);
  await request(app).get(url).set('x-test-actor', customer.userId).expect(403);
});

test('customer confirmation to sitter acceptance, private evidence, checklist and customer progress persists over HTTP', async () => {
  const otherCustomer = actor('CUSTOMER');
  const sitter = await employee(), row = await visit({ start: '2026-10-30T02:00:00Z', requestedSitterId: sitter.userId });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { 'snapshots.checklistItemIds': ['pet-condition'] } });
  const session = { authenticate: async req => {
    const record = [sitter, customer, staff, otherCustomer].find(value => value.userId === req.get('x-test-actor'));
    return record && { ...record, expiresAt: clock() + 60000 };
  }, verifyCsrf: async (_actor, token) => token === 'synthetic-csrf' };
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#38a178' } }).png().toBuffer();
  const stored = new Map();
  for (const model of Object.values(privateImageModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  const images = privateImageModule({ connection, secret: 'synthetic-private-media-secret-32-chars', maxImagesPerUser: 10,
    requireAuthenticated: requireSession(session, { clock }), csrf: requireCsrf(session),
    media: { upload: async value => stored.set(value.storageRef, value), read: async value => stored.get(value.storageRef) } });
  const finance = financeSourceRuntime({ connection, config: { auth: { enabled: true, tokenSecret: 'synthetic-cursor-secret-at-least-32-chars' } },
    env: { FINANCE_SOURCES_ENABLED: 'true' }, sessionService: session, clock });
  const server = express(); server.use(express.json(), requestId); server.use(images.mount, images.router);
  server.use('/api/v1', finance.router); server.use(module.mount, module.router); server.use(errorHandler(() => {}));
  const headers = (who, key) => ({ 'x-test-actor': who.userId, 'x-csrf-token': 'synthetic-csrf', 'Idempotency-Key': key, Host: 'localhost', Origin: 'http://localhost' });
  const root = '/api/v1/employee-scheduling';
  const proposed = await request(server).post(`${root}/visits/${row._id}/schedule-proposals`).set(headers(staff, 'synthetic-propose-care'))
    .send({ expectedVersion: 0, startAt: '2026-10-30T03:15:00Z' }).expect(200);
  const proposal = proposed.body.data;
  const confirmation = { expectedVersion: 0, selectedSlot: proposal.slots[0] };
  const confirmed = await request(server).post(`${root}/proposals/${proposal.id}/confirmation`).set(headers(customer, 'synthetic-confirm-care')).send(confirmation).expect(200);
  const replay = await request(server).post(`${root}/proposals/${proposal.id}/confirmation`).set(headers(customer, 'synthetic-confirm-care')).send(confirmation).expect(200);
  expect(replay.body.data).toEqual(confirmed.body.data);
  await request(server).post(`${root}/offers/${confirmed.body.data.offer.id}/acceptances`).set(headers(sitter, 'synthetic-accept-care')).send({ expectedVersion: 0 }).expect(200);
  const pendingOffers = (await request(server).get(root+'/offers?state=PENDING').set(headers(sitter,'synthetic-pending')).expect(200)).body.data;
  const historyOffers = (await request(server).get(root+'/offers?state=HISTORY').set(headers(sitter,'synthetic-history')).expect(200)).body.data;
  expect(pendingOffers.items.every(offer=>offer.state==='PENDING')).toBe(true);
  expect(historyOffers.items.some(offer=>offer.state==='ACCEPTED')).toBe(true);
  expect(historyOffers.items.every(offer=>offer.state!=='PENDING')).toBe(true);
  const endpoint = `/api/v1/visits/${row._id}`;
  const summary = await request(server).get(endpoint + '/assigned-summary').set(headers(sitter, 'synthetic-summary')).expect(200);
  expect(summary.body.data).toMatchObject({ visitId: String(row._id), state: 'ASSIGNED', serviceAddress: 'Synthetic private facility' });
  expect(summary.headers['cache-control']).toBe('private, no-store');
  expect(summary.body.data.location).toBe(row.location);
  expect(Object.keys(summary.body.data).sort()).toEqual(['endAt', 'location', 'serviceAddress', 'serviceName', 'startAt', 'state', 'visitId']);
  await request(server).get(endpoint + '/assigned-summary').set(headers(customer, 'synthetic-summary-denied')).expect(403);
  let current = (await request(server).get(`${endpoint}/execution`).set(headers(sitter, 'synthetic-read-care')).expect(200)).body.data;
  const upload = async key => (await request(server).post(images.mount).set(headers(sitter, key)).set('Content-Type', 'image/png').send(bytes).expect(201)).body.data.id;
  const mediaIn = await upload('synthetic-private-care-in');
  await request(server).get(images.mount+'/'+mediaIn+'/content').set(headers(customer,'synthetic-unbound-denied')).expect(404);
  const input = { expectedVersion: current.version, mediaId: mediaIn };
  const checkedIn = await request(server).post(`${endpoint}/check-ins`).set(headers(sitter, 'synthetic-check-in-care')).send(input).expect(200);
  const repeated = await request(server).post(`${endpoint}/check-ins`).set(headers(sitter, 'synthetic-check-in-care')).send(input).expect(200);
  expect(repeated.body.data).toEqual(checkedIn.body.data);
  const checkout = createBookingCheckoutService({ connection, clock });
  expect((await checkout.read(customer, String(row.bookingId))).careShifts[0]).toMatchObject({ state: 'IN_PROGRESS', checkInAt: new Date(clock()), checkOutAt: null });
  const mediaOut = await upload('synthetic-private-care-out');
  await request(server).post(`${endpoint}/check-outs`).set(headers(sitter, 'synthetic-out-before-checklist')).send({ expectedVersion: checkedIn.body.data.version, mediaId: mediaOut }).expect(409);
  const saved = await request(server).patch(`${endpoint}/checklists`).set(headers(sitter, 'synthetic-checklist-care'))
    .send({ expectedVersion: checkedIn.body.data.version, items: [{ itemId: 'pet-condition', status: 'DONE' }] }).expect(200);
  current = (await request(server).get(`${endpoint}/execution`).set(headers(sitter, 'synthetic-read-care')).expect(200)).body.data;
  expect(current.checklist).toEqual([{ itemId: 'pet-condition', status: 'DONE' }]);
  await request(server).post(`${endpoint}/check-outs`).set(headers(sitter, 'synthetic-check-out-care')).send({ expectedVersion: saved.body.data.version, mediaId: mediaOut }).expect(200);
  expect((await checkout.read(customer, String(row.bookingId))).careShifts[0]).toMatchObject({ state: 'COMPLETED', checkOutAt: new Date(clock()) });
  expect((await checkout.read(customer, String(row.bookingId))).state).toBe('COMPLETED');
  await expect(checkout.read(actor('CUSTOMER'), String(row.bookingId))).rejects.toMatchObject({ status: 404 });
  expect(stored.size).toBe(2);
  const finalRead = (await request(server).get(`${endpoint}/execution`).set(headers(sitter, 'synthetic-read-final')).expect(200)).body.data;
  expect(finalRead.evidence).toEqual([{kind:'CHECK_IN',mediaId:mediaIn},{kind:'CHECK_OUT',mediaId:mediaOut}]);
  await request(server).get(images.mount+'/'+mediaIn+'/content').set(headers(otherCustomer,'synthetic-other-customer')).expect(404);
  expect(Date.parse(finalRead.checkInOpensAt)).toBe(Date.parse(finalRead.startAt)-1800000);
  await request(server).get(images.mount+'/'+mediaIn+'/content').set(headers(customer,'synthetic-customer-image')).expect(200).expect('Cache-Control','private, no-store');
  await request(server).get(images.mount+'/'+mediaIn+'/content').set(headers(staff,'synthetic-no-staff-image')).expect(404);
  expect(await connection.collection('caremediabindings').countDocuments({ visitId: String(row._id) })).toBe(2);
});

test('execution read exposes timing and bound evidence while excluding private notes and money', async () => {
  const sitter = await employee(), other = await employee(), row = await visit();
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { sitterId: new mongoose.Types.ObjectId(sitter.userId),
    state: 'ASSIGNED', 'snapshots.checklistItemIds': ['service-scope', 'pet-condition'],
    privateAccessNotes: 'Synthetic private note', evidenceRefs: [{ mediaId: 'a'.repeat(64) }] } });
  const service = createBookingFinanceSourceService({ connection, clock: () => new Date(clock()) });
  const result = await service.readVisit(sitter, String(row._id));
  expect(result).toMatchObject({ visitId: String(row._id), state: 'ASSIGNED', version: 0, checklistItemIds: ['service-scope', 'pet-condition'] });
  expect(Object.keys(result).sort()).toEqual(['visitId', 'state', 'version', 'startAt', 'endAt', 'checkInAt', 'checkOutAt', 'checklistItemIds', 'checklist', 'serverNow', 'checkInOpensAt', 'checkInClosesAt', 'checkOutClosesAt', 'checklistItems', 'evidence', 'serviceName', 'completionAttention', 'closureOutcome', 'workflow'].sort());
  await expect(service.readVisit(other, String(row._id))).rejects.toMatchObject({ status: 404 });
  await expect(service.readVisit(customer, String(row._id))).rejects.toMatchObject({ status: 403 });
  const runtime = financeSourceRuntime({ connection, config: { auth: { enabled: true, tokenSecret: 'synthetic-cursor-secret-at-least-32-chars' } }, env: { FINANCE_SOURCES_ENABLED: 'true' }, clock,
    sessionService: { authenticate: async req => {
      const actors = [sitter, other, customer];
      const actor = actors.find(value => value.userId === req.get('x-test-actor'));
      return actor && { ...actor, expiresAt: clock() + 60000 };
    }, verifyCsrf: async () => false } });
  const server = express(); server.use(express.json(), requestId); server.use('/api/v1', runtime.router); server.use(errorHandler(() => {}));
  const url = `/api/v1/visits/${row._id}/execution`;
  await request(server).get(url).expect(401);
  await request(server).get(url).set('x-test-actor', customer.userId).expect(403);
  await request(server).get(url).set('x-test-actor', other.userId).expect(404);
  const response = await request(server).get(url).set('x-test-actor', sitter.userId).expect(200).expect('Cache-Control', 'private, no-store');
  expect(response.body.data.visitId).toBe(String(row._id));
  await request(server).post(`/api/v1/visits/${row._id}/check-ins`).set('x-test-actor', sitter.userId).send({ expectedVersion: 0 }).expect(403);
});

async function employee({ configure = true, contract = true } = {}) {
  const value = actor('PET_SITTER'), userId = new mongoose.Types.ObjectId(value.userId);
  await connection.collection('users').insertOne({ _id: userId, ...value });
  await connection.collection('sitterstatuses').insertOne({ userId, status: 'ACTIVE' });
  await connection.collection('sitterapplications').insertOne({ provisionedUserId: userId, state: 'APPROVED', submissionKeyDigest: `synthetic-${userId}` });
  await connection.collection('aisitterprofiles').insertOne({ userId, active: true, serviceIds: [serviceId],
    species: ['DOG', 'CAT'], allowedTraits: [], maxWeightKg: 25, maxPets: 3, dayOffDates: [],
    starts: Array.from({ length: 30 }, (_, i) => { const date = new Date(Date.parse('2026-10-30T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
      return { localDate: date, point: { type: 'Point', coordinates: [105.86, 21.02] }, availableFrom: new Date(`${date}T01:00:00Z`), availableUntil: new Date(`${date}T11:00:00Z`) }; }) });
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
    state: 'SCHEDULED', version: 0, sequence: 0, dispatchReview: { code: 'NO_ELIGIBLE_SITTER' }, areaCode, location: 'FACILITY', startAt: new Date(start), endAt: new Date(Date.parse(start) + minutes * 60000),
    snapshots: { serviceName: 'Synthetic service', point: { type: 'Point', coordinates: [105.86, 21.02] }, serviceAddress: 'Synthetic private facility', employeeServiceNetVnd: net, boarding, pets: [{ id: String(oid()), name: 'Synthetic dog', species: 'DOG', weightKg: 4, traits: [] }] } };
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
  now -= 1;
  expect(await travel.get(customer, visitId)).toMatchObject({ available: false, location: null });
  await expect(travel.command(sitter, visitId, { action: 'START', expectedVersion: 0 })).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED' });
  now += 1;
  expect(await travel.get(customer, visitId)).toMatchObject({ available: true, location: null });
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
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { state: 'IN_PROGRESS', checkInAt: new Date(now) } });
  expect(await travel.get(customer, visitId)).toMatchObject({ available: false, sharing: false, location: null });
  await expect(travel.locate(sitter, visitId, sample)).rejects.toMatchObject({ code: 'TRAVEL_WINDOW_CLOSED' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { state: 'ASSIGNED' }, $unset: { checkInAt: '' } });
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

test('verified Admin contract unlocks both scheduling screens without creating bookings or duplicate contracts', async () => {
  const sitter = await employee({ configure: false, contract: false });
  const areas = { actor: sitter, areas: ['DISTRICT_HAI_BA_TRUNG'], expectedVersion: 0, idempotencyKey: 'recover-areas-key' };
  const command = { zone: 'Asia/Ho_Chi_Minh', effectiveFrom: '2026-10-30', workingWindows: windows,
    expectedVersion: 1, idempotencyKey: 'recover-hours-key' };
  await expect(module.repository.areas.replaceMine(areas)).rejects.toMatchObject({ code: 'CONTRACT_REQUIRED' });
  const input = { employeeId: sitter.userId, expectedVersion: 0, employmentType: 'PART_TIME', salaryBasis: 'GROSS', monthlyBaseVnd: 3000000,
    payCycle: 'MONTHLY', weeklyMinutes: 1200, signedAt: '2026-10-01T00:00:00Z', effectiveAt: '2026-10-01T00:00:00Z',
    contractReference: 'synthetic-verified-contract', workplaceRegion: 1, workplaceReference: 'Synthetic verified workplace' };
  const admin = actor('ADMIN'), beforeBookings = await connection.collection('bookings').countDocuments();
  await expect(payrollService.recordContract(staff, input, 'recover-contract-key')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const saved = await payrollService.recordContract(admin, input, 'recover-contract-key');
  expect(await payrollService.recordContract(admin, input, 'recover-contract-key')).toEqual(saved);
  expect((await module.repository.areas.replaceMine(areas)).expectedVersion).toBe(1);
  expect((await module.repository.availability.updateMine({ actor: sitter, command })).expectedVersion).toBe(2);
  expect(await payroll.EmploymentContract.countDocuments({ employeeId: sitter.userId })).toBe(1);
  expect(await connection.collection('bookings').countDocuments()).toBe(beforeBookings);
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

test('dispatch follows advisory ordering only among currently eligible employees', async () => {
  const preferred = await employee(), unavailable = await employee();
  for (let index = 0; index < 4; index++) await employee();
  await payroll.EmploymentContract.deleteMany({ employeeId: unavailable.userId });
  const row = await visit({ start: '2026-11-05T02:00:00Z' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { bookingMode: 'SYSTEM',
    recommendationRef: { candidateIds: [unavailable.userId, preferred.userId], advisory: true } } });
  const result = await module.dispatch.invite(staff, String(row._id), { expectedVersion: 0 }, 'advisory-priority');
  expect(result.sitterId).toBe(preferred.userId);
  expect(result.invitations).toHaveLength(5);
  expect((await connection.collection('visits').findOne({ _id: row._id })).sitterId).toBeNull();
});

test('GBR-12 automatic fallback sends five nearby newcomers together and rechecks their origin', async () => {
  const selectedService = oid(), workers = [];
  for (let index = 0; index < 7; index++) {
    const sitter = await employee(); workers.push(sitter);
    await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(sitter.userId) }, { $set: {
      serviceIds: [selectedService], starts: [{ localDate: '2026-11-25', point: { type: 'Point', coordinates: [105.86 + (index + 1) / 1000, 21.02] },
        availableFrom: new Date('2026-11-25T01:00:00Z'), availableUntil: new Date('2026-11-25T11:00:00Z') }]
    } });
  }
  await payroll.EmploymentContract.deleteMany({ employeeId: workers[6].userId });
  const row = await visit({ start: '2026-11-25T02:00:00Z' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { serviceId: selectedService }, $unset: { dispatchReview: 1 } });
  const repository = createEmployeeScheduleRepository({ connection, clock, routingProvider: {
    edgeKey, cacheTtlMs: 0, source: 'SYNTHETIC_ROUTE', async matrix(points) {
      return { map: new Map(points.flatMap(a => points.map(b => [edgeKey(a, b), Math.abs(a[0] - b[0]) * 1000]))), recordedAt: new Date(clock()), source: 'SYNTHETIC_ROUTE' };
    }
  } });
  const dispatch = createEmployeeDispatchService({ repository, clock });
  await expect(dispatch.invite(staff, String(row._id), { expectedVersion: 0 }, 'staff-before-system'))
    .rejects.toMatchObject({ code: 'SYSTEM_DISPATCH_IN_PROGRESS' });
  await dispatch.runBatch({ limit: 20 });
  const pending = () => repository.models.EmployeeVisitOffer.find({ visitId: row._id, state: 'PENDING' }).lean();
  const batch = await pending();
  expect(batch.map(offer => offer.sitterId)).toEqual(workers.slice(0, 5).map(worker => worker.userId));
  const [initial] = batch;
  expect(initial.sitterId).toBe(workers[0].userId);
  expect(await connection.collection('aivisitoutcomes').countDocuments({ sitterId: { $in: workers.map(w => new mongoose.Types.ObjectId(w.userId)) } })).toBe(0);
  expect(await connection.collection('notifications').countDocuments({ eventType: 'DispatchReviewRequired', 'metadata.visitId': String(row._id) })).toBe(0);
  const originOwner = new mongoose.Types.ObjectId(workers[0].userId), original = await connection.collection('aisitterprofiles').findOne({ userId: originOwner });
  await connection.collection('aisitterprofiles').updateOne({ userId: originOwner }, { $set: { starts: [] } });
  await expect(dispatch.offers.accept(workers[0], String(initial._id), 0, 'origin-removed-after-offer')).rejects.toMatchObject({ code: 'DAY_ORIGIN_MISSING' });
  await connection.collection('aisitterprofiles').updateOne({ userId: originOwner }, { $set: { starts: original.starts } });
  for (const [index, offer] of batch.entries()) {
    await dispatch.offers.decline(workers[index], String(offer._id), 0, `newcomer-decline-${offer._id}`, { reasonCode: 'SCHEDULE_CONFLICT' });
    await dispatch.runBatch({ limit: 20 });
    expect(await pending()).toHaveLength(4 - index);
  }
  expect(await pending()).toHaveLength(0);
  expect((await connection.collection('visits').findOne({ _id: row._id })).dispatchReview.code).toBe('INSUFFICIENT_DISPATCH_CANDIDATES');
});

test('unaccepted visits reaching shift start remain visible and notify Staff/Admin once', async () => {
  const row = await visit({ start: '2026-10-30T02:59:00Z' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $unset: { dispatchReview: 1 } });
  await module.dispatch.runBatch({ limit: 20 });
  expect((await connection.collection('visits').findOne({ _id: row._id })).dispatchReview.code).toBe('SHIFT_START_REACHED');
  expect((await module.dispatch.queue(staff)).items.some(visit => visit.id === String(row._id))).toBe(true);
  const query = { eventType: 'DispatchReviewRequired', 'metadata.visitId': String(row._id) };
  const before = await connection.collection('notifications').countDocuments(query);
  expect(before).toBeGreaterThan(0);
  await module.dispatch.runBatch({ limit: 20 });
  expect(await connection.collection('notifications').countDocuments(query)).toBe(before);
});

test('agent resumes without duplicate invitations, automatically plans legacy orders, respects payment and escalates exhausted offers once', async () => {
  const admin = actor('ADMIN'); await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(admin.userId), ...admin });
  const sitter = await employee(), row = await visit({ start: '2026-11-10T02:00:00Z', requestedSitterId: sitter.userId });
  const exclusiveService = oid();
  await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(sitter.userId) }, { $addToSet: { serviceIds: exclusiveService } });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { serviceId: exclusiveService }, $unset: { dispatchReview: 1 } });
  const unpaid = await visit({ start: '2026-11-11T02:00:00Z', prepay: true, requestedSitterId: sitter.userId });
  const unfinished = await visit({ start: '2026-11-12T02:00:00Z', requestedSitterId: sitter.userId });
  await connection.collection('bookings').updateOne({ _id: unfinished.bookingId }, { $set: { carePlanState: 'NEEDS_REVIEW' } });
  await Promise.all([module.dispatch.runBatch({ limit: 20 }), module.dispatch.runBatch({ limit: 20 })]);
  const offers = await module.repository.models.EmployeeVisitOffer.find({ visitId: row._id }).lean(); expect(offers).toHaveLength(1);
  expect(offers[0].sitterId).toBe(sitter.userId);
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: unpaid._id })).toBe(0);
  expect((await connection.collection('bookings').findOne({ _id: unfinished.bookingId })).carePlanState).toBe('APPROVED');
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: { $in: (await connection.collection('bookings').findOne({ _id: unfinished.bookingId })).visitIds } })).toBe(1);
  await module.repository.models.EmployeeVisitOffer.updateOne({ _id: offers[0]._id }, { $set: { deadline: new Date(clock() - 1) } });
  await module.dispatch.runBatch({ limit: 20 });
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id })).toBe(1);
  expect((await connection.collection('visits').findOne({ _id: row._id })).dispatchReview.code).toBe('DIRECTED_SCHEDULE_REVIEW_REQUIRED');
  const filter = { eventType: 'DispatchReviewRequired', 'metadata.visitId': String(row._id) };
  expect((await connection.collection('notifications').find(filter).toArray()).map(item => item.role).sort()).toEqual(['ADMIN', 'STAFF']);
  await module.dispatch.runBatch({ limit: 20 });
  expect(await connection.collection('notifications').countDocuments(filter)).toBe(2);
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
  await connection.collection('visits').updateOne({ _id: following._id }, { $set: { location: 'HOME', addressId: oid(), 'snapshots.serviceAddress': 'Synthetic other home' }, $unset: { 'snapshots.point': 1 } });
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
  await connection.collection('visits').updateMany({ bookingId: row.bookingId, state: 'SCHEDULED' }, { $set: { dispatchReview: { code: 'NO_ELIGIBLE_SITTER' } } });
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
  const secondForSameSitter = await request(reviewApp).post(second).set('x-test-actor', customer.userId)
    .set('Host', 'localhost').set('Origin', 'http://localhost').set('x-csrf-token', 'synthetic-csrf')
    .set('Idempotency-Key', 'verified-same-sitter-second-visit').send({ rating: 5 });
  expect(secondForSameSitter.status).toBe(409);
  expect(secondForSameSitter.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'IN_PROGRESS' } });
  await request(reviewApp).post(second).set('x-test-actor', customer.userId).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'unverified-rating-002').send({ rating: 5 }).expect(409);
  expect(await connection.models.SitterVisitOutcome.countDocuments({ visitId: plan.visits[1].id })).toBe(0);
});

test('Staff proposes a new directed time; only the owning customer may confirm before an atomic invitation is created', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-11-23T02:00:00Z', requestedSitterId: sitter.userId });
  await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(sitter.userId) }, { $set: { displayName: 'Synthetic assigned sitter' } });
  const old = await connection.collection('bookings').findOne({ _id: row.bookingId });
  const body = { expectedVersion: 0, startAt: '2026-11-23T04:00:00Z' };
  const proposal = await module.proposals.propose(staff, String(row._id), body, 'staff-proposes-time');
  expect(proposal.state).toBe('PENDING_CUSTOMER_CONFIRMATION');
  expect(await module.proposals.getProposal({ actor: customer, proposalId: proposal.id })).toMatchObject({ sitter: { displayName: 'Synthetic assigned sitter' } });
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

test('system recovery previews precise area, requires customer consent and rechecks before acceptance', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-10-29T02:00:00Z', areaCode: 'CITY_HANOI' });
  await employee(); // Another eligible employee must not replace the consented nominee.
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { location: 'HOME' } });
  const body = { expectedVersion: 0, startAt: '2026-11-01T02:00:00Z', areaCode: 'DISTRICT_HAI_BA_TRUNG', sitterId: sitter.userId };
  await expect(module.dispatch.invite(staff, String(row._id), { expectedVersion: 0 }, 'past-shift-invite')).rejects.toMatchObject({ code: 'SHIFT_START_REACHED' });
  const preview = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: body.startAt, areaCode: body.areaCode });
  expect(preview.items.some(item => item.sitterId === sitter.userId)).toBe(true);
  await expect(module.dispatch.previewCandidates(customer, String(row._id), { startAt: body.startAt })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const proposal = await module.proposals.propose(staff, String(row._id), body, 'system-recovery-proposal');
  expect(await module.proposals.propose(staff, String(row._id), body, 'system-recovery-proposal')).toEqual(proposal);
  expect(proposal).toMatchObject({ areaCode: body.areaCode, previousAreaCode: 'CITY_HANOI' });
  expect((await connection.collection('visits').findOne({ _id: row._id })).areaCode).toBe('CITY_HANOI');
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id })).toBe(0);
  const oldBooking = await connection.collection('bookings').findOne({ _id: row.bookingId });
  const input = { actor: customer, proposalId: proposal.id, expectedVersion: 0, selectedSlot: proposal.slots[0], idempotencyKey: 'confirm-system-recovery' };
  const result = await module.proposals.confirmProposal(input);
  expect(await module.proposals.confirmProposal(input)).toEqual(result);
  const revised = await connection.collection('visits').findOne({ _id: row._id });
  expect(revised).toMatchObject({ areaCode: body.areaCode, startAt: new Date(body.startAt), sitterId: null });
  expect(revised.snapshots).toEqual(row.snapshots);
  expect((await connection.collection('bookings').findOne({ _id: row.bookingId })).checkoutSnapshot).toEqual(oldBooking.checkoutSnapshot);
  const offer = await module.repository.models.EmployeeVisitOffer.findById(result.offer.id).lean();
  expect(offer).toMatchObject({ originRouteRequired: true, areaCode: body.areaCode });
  await module.dispatch.runBatch({ limit: 20 });
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id })).toBe(1);
  await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(sitter.userId) }, { $set: { serviceIds: [] } });
  await expect(module.dispatch.offers.accept(sitter, result.offer.id, 0, 'recover-recheck-failed')).rejects.toMatchObject({ code: 'SERVICE_CAPABILITY_REQUIRED' });
  await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(sitter.userId) }, { $set: { serviceIds: [serviceId] } });
  await module.dispatch.offers.accept(sitter, result.offer.id, 0, 'recover-recheck-success');
  expect((await connection.collection('visits').findOne({ _id: row._id })).state).toBe('ASSIGNED');
});

test('dispatch batches projected account/status prefilters while retaining authoritative eligibility', async () => {
  const workers = await Promise.all(Array.from({ length: 4 }, () => employee()));
  const row = await visit();
  await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(workers[1].userId) }, { $set: { state: 'LOCKED' } });
  await connection.collection('sitterstatuses').updateOne({ userId: new mongoose.Types.ObjectId(workers[2].userId) }, { $set: { status: 'SUSPENDED' } });
  const reads = [], checked = [];
  const repository = { ...module.repository,
    col: name => {
      const collection = module.repository.col(name);
      return new Proxy(collection, { get(target, key) {
        if (key === 'find') return (query, options) => {
          if (['users', 'sitterstatuses'].includes(name) && (query._id?.$in || query.userId?.$in)
            && !options?.projection?.displayName) reads.push({ name, query, projection: options?.projection });
          return target.find(query, options);
        };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }, eligible: async (...args) => { checked.push(args[0]); return module.repository.eligible(...args); }
  };
  const dispatch = createEmployeeDispatchService({ repository, clock });
  const result = await dispatch.previewCandidates(staff, String(row._id), { startAt: row.startAt.toISOString() });
  expect(reads).toHaveLength(2);
  expect(reads.map(read => read.projection)).toEqual([{ _id: 1 }, { userId: 1 }]);
  expect(reads.every(read => (read.query._id?.$in ?? read.query.userId.$in).length <= 100)).toBe(true);
  expect(checked).toContain(workers[0].userId);
  expect(checked).not.toContain(workers[1].userId); expect(checked).not.toContain(workers[2].userId);
  expect(result.items.some(item => item.sitterId === workers[0].userId)).toBe(true);
});

test('recovery requires escalation for replacements and rejects unrelated areas, missing origin, unpaid and boarding changes', async () => {
  const sitter = await employee(), other = await employee();
  const row = await visit({ start: '2026-11-26T02:00:00Z', requestedSitterId: sitter.userId });
  const body = { expectedVersion: 0, startAt: '2026-11-26T04:00:00Z', sitterId: other.userId };
  await connection.collection('visits').updateOne({ _id: row._id }, { $unset: { dispatchReview: 1 } });
  await expect(module.proposals.propose(staff, String(row._id), body, 'no-directed-substitute')).rejects.toMatchObject({ code: 'SYSTEM_DISPATCH_IN_PROGRESS' });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { dispatchReview: { code: 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' } } });
  await expect(module.proposals.propose(staff, String(row._id), { ...body, sitterId: sitter.userId, areaCode: 'DISTRICT_HOAN_KIEM' }, 'no-area-relocation')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const system = await visit({ start: '2026-11-26T02:00:00Z' });
  await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(other.userId) }, { $set: { starts: [] } });
  await expect(module.proposals.propose(staff, String(system._id), body, 'no-origin-bypass')).rejects.toMatchObject({ code: 'DAY_ORIGIN_MISSING' });
  const unpaid = await visit({ prepay: true });
  await expect(module.proposals.propose(staff, String(unpaid._id), body, 'no-payment-bypass')).rejects.toMatchObject({ code: 'VISIT_UNAVAILABLE' });
  const boarding = await visit({ boarding: true });
  await expect(module.proposals.propose(staff, String(boarding._id), body, 'no-boarding-reschedule')).rejects.toMatchObject({ code: 'STAY_CHANGE_REQUIRES_REVIEW' });
});

test('failed automatic dispatch persists bounded reasons and never broadens a city booking to district staff', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-11-27T02:00:00Z', areaCode: 'CITY_HANOI' });
  const city = await module.repository.models.EmployeeAvailability.find({ areas: 'CITY_HANOI' }).lean();
  await connection.collection('aisitterprofiles').updateMany({ userId: { $in: city.map(item => new mongoose.Types.ObjectId(item._id)) } }, { $set: { serviceIds: [] } });
  const preview = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: row.startAt.toISOString() });
  expect(preview.items.some(item => item.sitterId === sitter.userId)).toBe(false);
  expect(preview.diagnostics).toMatchObject({ eligible: 0 });
  await connection.collection('visits').updateOne({ _id: row._id }, { $unset: { dispatchReview: 1 } });
  await module.dispatch.runBatch({ limit: 20 });
  const saved = await connection.collection('visits').findOne({ _id: row._id });
  expect(saved.dispatchReview).toMatchObject({ code: 'NO_ELIGIBLE_SITTER', diagnostics: { eligible: 0 } });
  expect(JSON.stringify(saved.dispatchReview.diagnostics)).not.toContain(sitter.userId);
});


test('ranked OUTDOOR assignment retains its policy snapshot and records one verified customer rating after completed care', async () => {
  const sitter = await employee(), row = await visit({ start: '2026-10-31T02:00:00Z', requestedSitterId: sitter.userId });
  await connection.collection('visits').updateOne({ _id: row._id }, {
    $set: { location: 'OUTDOOR', 'snapshots.checklistItemIds': ['pet-condition'] }
  });
  const { matchingModels } = await import('../../src/models/sitter-matching.model.js');
  const matching = matchingModels(connection);
  await matching.SitterRankingPolicy.create({ version: 1, status: 'APPROVED', effectiveAt: new Date('2026-01-01'), approvedAt: new Date('2026-01-01'),
    approvalSource: 'SYNTHETIC_ISOLATED_POLICY', reason: 'Synthetic operational scoring test', weights: { fit: 30, travel: 25, quality: 20, reliability: 15, workload: 10 } });
  const archived = { version: 'archived-dispatch-model', weights: { fit: 100, travel: 0, quality: 0, reliability: 0, workload: 0 },
    trainingRows: 200, testMae: 1, baselineMae: 2, testGroups: 10, trainedUntil: new Date(0).toISOString() };
  await matching.SitterRankModel.create({ ...archived, state: 'APPROVED', sha256: digest(archived), approvedAt: new Date(1000) });
  const routingProvider = { validatePoints: () => {}, cacheTtlMs: 0, matrix: async points => ({ map: new Map(points.flatMap(a => points.map(b => [edgeKey(a, b), 0]))), recordedAt: new Date(clock()), source: 'SYNTHETIC_TEST_ROUTE' }) };
  const dispatch = createEmployeeDispatchService({ repository: module.repository, clock,
    ranker: createOperationalRanker({ connection, routingProvider, clock }) });
  await dispatch.runBatch({ limit: 20 });
  const offer = await module.repository.models.EmployeeVisitOffer.findOne({ visitId: row._id }).select('+featureSnapshot').lean();
  expect(offer.featureSnapshot).toMatchObject({ version: 'PWC_MATCH_FEATURES_V1', sitterId: sitter.userId, features: { fit: 0 }, policyVersion: 1, modelVersion: null });
  expect(JSON.stringify(await dispatch.offers.detail(sitter, String(offer._id)))).not.toContain('featureSnapshot');
  await dispatch.offers.accept(sitter, String(offer._id), 0, 'accept-captured-operational-offer');
  const assigned = await connection.collection('visits').findOne({ _id: row._id });
  expect(assigned.assignedFeatureSnapshot.features).toEqual(offer.featureSnapshot.features);
  expect(assigned.assignedFeatureSnapshot.sitterId).toBe(sitter.userId);
  expect(await matching.SitterVisitOutcome.countDocuments({ sitterId: new mongoose.Types.ObjectId(sitter.userId) })).toBe(0);

  // UC-41 GBR-24: the completed visit carries an acknowledged urgent replacement assignment.
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { handoverRequired: true,
    handoverAccepted: true, handoverLateCheckInExempt: true, assignedAt: new Date(+row.startAt - 40 * 60000) } });
  let at = +row.startAt + 10 * 60000;
  const finance = createBookingFinanceSourceService({ connection, clock: () => new Date(at) });
  const stored = new Map();
  const images = createPrivateImageService({ connection, secret: 'isolated-replay-example-media-key', media: {
    upload: async image => stored.set(image.storageRef, image),
    read: async ({ storageRef }) => stored.get(storageRef)
  } });
  for (const model of Object.values(privateImageModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#33885f' } }).png().toBuffer();
  const upload = async suffix => (await images.upload({
    actor: sitter, body: bytes, contentType: 'image/png', idempotencyKey: `demo-replay-image-${suffix}`
  })).id;
  const visitId = String(row._id);
  const input = { actor: sitter, visitId };
  const started = await finance.checkIn({
    ...input, expectedVersion: assigned.version, mediaId: await upload('arrival'), idempotencyKey: 'demo-replay-arrival'
  });
  const checklist = await finance.updateChecklist({
    ...input, expectedVersion: started.version, items: [{ itemId: 'pet-condition', status: 'DONE' }],
    idempotencyKey: 'demo-replay-checklist'
  });
  at = row.endAt.getTime();
  const completed = await finance.checkOut({
    ...input, expectedVersion: checklist.version, mediaId: await upload('departure'), idempotencyKey: 'demo-replay-departure'
  });
  expect(stored.size).toBe(2);
  expect(completed.state).toBe('COMPLETED');
  expect((await connection.collection('bookings').findOne({ _id: row.bookingId })).state).toBe('COMPLETED');
  expect(await matching.SitterVisitOutcome.countDocuments({ visitId: row._id })).toBe(0);

  reviewNow = at + 8 * 86400000;
  const afterSevenDays = await request(reviewApp).post(`/reviews/visits/${visitId}/ratings`)
    .set('x-test-actor', customer.userId).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'late-customer-rating-8days')
    .send({ rating: 4, expectedVersion: completed.version });
  expect(afterSevenDays.status).toBe(409);
  expect(afterSevenDays.body.error.code).toBe('RATING_WINDOW_EXPIRED');
  at += 60000;
  reviewNow = at;
  const rate = () => request(reviewApp).post(`/reviews/visits/${visitId}/ratings`)
    .set('x-test-actor', customer.userId).set('Host', 'localhost').set('Origin', 'http://localhost')
    .set('x-csrf-token', 'synthetic-csrf').set('Idempotency-Key', 'demo-replay-customer-rating')
    .send({ rating: 4, expectedVersion: completed.version }).expect(201);
  const accepted = await rate();
  expect((await rate()).body.data).toEqual(accepted.body.data);
  const outcomes = await matching.SitterVisitOutcome.find({ visitId: row._id }).select('+provenance').lean();
  expect(outcomes).toHaveLength(1);
  expect(await payroll.PayrollServiceCredit.findOne({ visitId: row._id }).lean()).toMatchObject({ onTime: true });
  expect(outcomes[0]).toMatchObject({ rating: 4, onTime: true, occurredAt: new Date(at),
    provenance: { labelVersion: 'VERIFIED_CUSTOMER_SATISFACTION_V1' } });
});

test('operational advice may reorder the complete eligible set but cannot add or remove employees', async () => {
  await employee(); await employee();
  const row = await visit({ start: '2026-11-27T02:00:00Z' }), input = { startAt: row.startAt.toISOString() };
  const baseline = await module.dispatch.previewCandidates(staff, String(row._id), input);
  expect(baseline.items.length).toBeGreaterThanOrEqual(2);
  const reverse = createEmployeeDispatchService({ repository: module.repository, clock, ranker: async ({ sitterIds }) => [...sitterIds].reverse() });
  expect((await reverse.previewCandidates(staff, String(row._id), input)).items.map(item => item.sitterId))
    .toEqual(baseline.items.map(item => item.sitterId).reverse());
  for (const ranker of [async ({ sitterIds }) => sitterIds.slice(1), async ({ sitterIds }) => ['f'.repeat(24), ...sitterIds.slice(1)], async () => { throw new Error('Synthetic unavailable advice'); }]) {
    const fallback = createEmployeeDispatchService({ repository: module.repository, clock, ranker });
    expect((await fallback.previewCandidates(staff, String(row._id), input)).items.map(item => item.sitterId))
      .toEqual(baseline.items.map(item => item.sitterId));
  }
});


test('new employee can be verified, manually invited and accept without any previous work or ratings', async () => {
  const newcomer = await employee(), userId = new mongoose.Types.ObjectId(newcomer.userId);
  await connection.collection('services').updateOne({ _id: serviceId }, { $setOnInsert: { code: 'synthetic-newcomer-service' } }, { upsert: true });
  await connection.collection('aisitterprofiles').deleteOne({ userId });
  const row = await visit({ requestedSitterId: newcomer.userId });
  const before = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: row.startAt.toISOString(), mode: 'MANUAL' });
  expect(before.items).toEqual([]); expect(before.blocked).toEqual([expect.objectContaining({ sitterId: newcomer.userId, reason: 'SERVICE_CAPABILITY_REQUIRED' })]);
  const capabilities = createSitterCapabilityService({ connection, clock }), actor = { ...staff, expiresAt: clock() + 60000 };
  const body = { expectedVersion: 0, serviceIds: [String(serviceId)], species: ['DOG'], allowedTraits: [], maxPets: 2, maxWeightKg: 10, active: true, reason: 'Synthetic practical skill verification' };
  await expect(capabilities.save({ actor: { ...customer, expiresAt: clock() + 60000 }, userId: newcomer.userId, body, key: 'verify-no-customer' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  const result = await capabilities.save({ actor, userId: newcomer.userId, body, key: 'verify-newcomer-skill' });
  expect(await capabilities.save({ actor, userId: newcomer.userId, body, key: 'verify-newcomer-skill' })).toEqual(result);
  await expect(capabilities.save({ actor, userId: newcomer.userId, body: { ...body, maxPets: 3 }, key: 'verify-newcomer-skill' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(capabilities.save({ actor, userId: newcomer.userId, body, key: 'verify-newcomer-stale' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  const profile = await connection.collection('aisitterprofiles').findOne({ userId });
  expect(profile.starts).toEqual([]); expect(profile.windows).toEqual([]);
  const manual = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: row.startAt.toISOString(), mode: 'MANUAL' });
  expect(manual.items).toEqual([expect.objectContaining({ sitterId: newcomer.userId })]);
  const automatic = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: row.startAt.toISOString() });
  expect(automatic.items).toEqual([]); expect(automatic.diagnostics.rejected.DAY_ORIGIN_MISSING).toBe(1);
  await expect(module.dispatch.previewCandidates(staff, String(row._id), { startAt: new Date(+row.startAt + 3600000).toISOString(), mode: 'MANUAL' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  const invitation = await module.dispatch.invite(staff, String(row._id), { expectedVersion: 0, sitterId: newcomer.userId }, 'manual-newcomer-invite');
  expect((await connection.collection('visits').findOne({ _id: row._id })).sitterId).toBeNull();
  await module.dispatch.offers.accept(newcomer, invitation.offerId, 0, 'newcomer-accepts-first-job');
  expect(String((await connection.collection('visits').findOne({ _id: row._id })).sitterId)).toBe(newcomer.userId);
  expect(await module.repository.models.EmployeeScheduleEvent.countDocuments({ type: 'CapabilityVerified', sitterId: newcomer.userId })).toBe(1);
});

test('daily origins are self-scoped, versioned, idempotent and preserve capabilities and working hours', async () => {
  const owner = await employee(), other = await employee();
  const url = '/api/v1/employee-scheduling/day-origins';
  await request(app).get(url).expect(401);
  await request(app).get(url).set('x-test-actor', staff.userId).expect(403);
  const existing = (await request(app).get(url).set('x-test-actor', owner.userId).expect(200)).body.data;
  const before = await connection.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(owner.userId) });
  const otherBefore = await connection.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(other.userId) });
  const body = { expectedVersion: existing.version, localDate: '2026-11-02', coordinates: [105.86, 21.02], availableFrom: '2026-11-02T01:00:00Z', availableUntil: '2026-11-02T11:00:00Z' };
  await request(app).put(url).set('x-test-actor', owner.userId).send(body).expect(403);
  const send = (payload, key) => request(app).put(url).set('host', '127.0.0.1').set('origin', 'http://127.0.0.1').set('x-test-actor', owner.userId).set('X-CSRF-Token', 'synthetic-csrf').set('Idempotency-Key', key).send(payload);
  const first = await send(body, 'self-origin-declaration').expect(200);
  const second = await send(body, 'self-origin-declaration').expect(200);
  expect(second.body.data).toEqual(first.body.data);
  await send({ ...body, expectedVersion: first.body.data.version, userId: other.userId }, 'origin-no-foreign-user').expect(422);
  await send(body, 'origin-stale-version').expect(409);
  await send({ ...body, expectedVersion: first.body.data.version, availableUntil: '2026-11-03T11:00:00Z' }, 'origin-invalid-overnight').expect(422);
  const after = await connection.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(owner.userId) });
  expect(after.serviceIds).toEqual(before.serviceIds); expect(after.windows).toEqual(before.windows);
  expect(after.starts).toHaveLength(30); expect(after.version).toBe(existing.version + 1);
  expect(await connection.collection('aisitterprofiles').findOne({ userId: new mongoose.Types.ObjectId(other.userId) })).toEqual(otherBefore);
});


const withdrawalRoot = '/api/v1/employee-scheduling';
const withdrawalPath = row => `${withdrawalRoot}/visits/${row._id}`;
const readWithdrawal = (row, sitter) => request(app).get(`${withdrawalPath(row)}/withdrawal-options`).set('x-test-actor', sitter.userId);
const sendWithdrawal = (row, sitter, body, key) => request(app).post(`${withdrawalPath(row)}/withdrawals`)
  .set({ 'x-test-actor': sitter.userId, 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': key, Host: 'localhost', Origin: 'http://localhost' }).send(body);
async function assignedForWithdrawal(sitter, start) {
  const row = await visit({ start });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { state: 'ASSIGNED', sitterId: new mongoose.Types.ObjectId(sitter.userId) } });
  await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { state: 'ASSIGNED' } });
  return row;
}

test.each([
  ['2026-10-30T15:01:00Z', 'EARLY'], ['2026-10-30T15:00:00Z', 'EARLY'], ['2026-10-30T14:59:00Z', 'LATE']
])('UC-82 GBR-21 chooses mode for %s on the server', async (start, mode) => {
  const sitter = await employee(), row = await assignedForWithdrawal(sitter, start);
  const response = await readWithdrawal(row, sitter).expect(200);
  expect(response.body.data).toMatchObject({ visitId: String(row._id), mode, version: 0 });
});

test('UC-82 GBR-21 allows the sitter to withdraw directly at exactly 12 hours', async () => {
  const sitter = await employee(), row = await assignedForWithdrawal(sitter, '2026-10-30T15:00:00Z');
  const result = await sendWithdrawal(row, sitter, {
    expectedVersion: 0, expectedMode: 'EARLY', reasonCode: 'ILLNESS'
  }, 'withdraw-at-twelve-hours').expect(200);
  expect(result.body.data).toMatchObject({ mode: 'EARLY', version: 1 });
  const stored = await connection.collection('visits').findOne({ _id: row._id });
  expect(stored).toMatchObject({ state: 'SCHEDULED', sitterId: null, handoverRequired: true });
});

test('UC-82 GBR-21 MSG56 scopes requests, stores a late request once and preserves the assignment', async () => {
  const sitter = await employee(), other = await employee(), row = await assignedForWithdrawal(sitter, '2026-10-30T11:00:00Z');
  const input = { expectedVersion: 0, expectedMode: 'LATE', reasonCode: 'ILLNESS', note: 'Synthetic note' };
  await request(app).get(`${withdrawalPath(row)}/withdrawal-options`).expect(401);
  await readWithdrawal(row, customer).expect(403);
  await readWithdrawal(row, other).expect(404);
  await sendWithdrawal(row, other, input, 'withdraw-foreign').expect(404);
  await request(app).post(`${withdrawalPath(row)}/withdrawals`).set('x-test-actor', sitter.userId).send(input).expect(403);
  await sendWithdrawal(row, sitter, { ...input, reasonCode: '' }, 'withdraw-no-reason').expect(422);
  const crossed = await sendWithdrawal(row, sitter, { ...input, expectedMode: 'EARLY' }, 'withdraw-crossed').expect(409);
  expect(crossed.body.error.code).toBe('WITHDRAWAL_MODE_CHANGED');
  const first = await sendWithdrawal(row, sitter, input, 'withdraw-late-first').expect(200);
  expect(first.body.data).toMatchObject({ mode: 'LATE', version: 1 });
  expect((await sendWithdrawal(row, sitter, input, 'withdraw-late-first').expect(200)).body.data).toEqual(first.body.data);
  await sendWithdrawal(row, sitter, { ...input, note: 'Changed' }, 'withdraw-late-first').expect(409);
  await sendWithdrawal(row, sitter, { ...input, expectedVersion: 1 }, 'withdraw-late-again').expect(409);
  const list = await request(app).get(`${withdrawalRoot}/assignments`).set('x-test-actor', sitter.userId).expect(200);
  expect(list.body.data.items).toContainEqual(expect.objectContaining({ id: String(row._id), canWithdraw: false }));
  const events = await module.repository.models.EmployeeScheduleEvent.find({ visitId: String(row._id) }).lean();
  expect(events.map(event => event.type)).toEqual(['VisitWithdrawalRequested']);
  const stored = await connection.collection('visits').findOne({ _id: row._id });
  expect(stored.state).toBe('ASSIGNED');
  expect(String(stored.sitterId)).toBe(sitter.userId);
  const queue = await request(app).get(`${withdrawalRoot}/dispatch`).set('x-test-actor', staff.userId).expect(200);
  expect(queue.body.data.withdrawalRequests).toContainEqual(expect.objectContaining({
    id: String(row._id), sitterId: sitter.userId, reasonCode: 'ILLNESS', note: 'Synthetic note', startAt: row.startAt.toISOString()
  }));
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { state: 'IN_PROGRESS', checkInAt: new Date(clock()) }, $inc: { version: 1 } });
  await sendWithdrawal(row, sitter, { ...input, expectedVersion: 2 }, 'withdraw-checked-in').expect(409);
  expect((await module.dispatch.queue(staff)).withdrawalRequests.some(item => item.id === String(row._id))).toBe(false);
});

test('directed withdrawal waits for customer replacement consent and retains the handover guard', async () => {
  const sitter = await employee(), replacement = await employee();
  const row = await visit({ start: '2026-11-23T02:00:00Z', requestedSitterId: sitter.userId });
  const dedicatedService = oid();
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: {
    serviceId: dedicatedService, 'snapshots.care': { schemaVersion: 1, capturedAt: new Date(clock()), pets: row.snapshots.pets }
  } });
  await connection.collection('aisitterprofiles').updateMany({
    userId: { $in: [sitter.userId, replacement.userId].map(value => new mongoose.Types.ObjectId(value)) }
  }, { $set: { serviceIds: [dedicatedService] } });
  const offered = await module.dispatch.invite(staff, String(row._id), { expectedVersion: 0, sitterId: sitter.userId }, 'withdraw-first-offer');
  await module.dispatch.offers.accept(sitter, offered.offerId, 0, 'withdraw-first-accept');
  const list = await request(app).get(`${withdrawalRoot}/assignments`).set('x-test-actor', sitter.userId).expect(200);
  expect(list.body.data.items).toContainEqual(expect.objectContaining({ id: String(row._id), canWithdraw: true }));
  const options = (await readWithdrawal(row, sitter).expect(200)).body.data;
  const input = { expectedVersion: options.version, expectedMode: 'EARLY', reasonCode: 'FAMILY_EMERGENCY' };
  const send = key => sendWithdrawal(row, sitter, input, key);
  const responses = await Promise.all([send('withdraw-early-first'), send('withdraw-early-racing')]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 404]);
  const index = responses.findIndex(response => response.status === 200);
  const first = responses[index].body.data;
  expect(first.mode).toBe('EARLY');
  expect((await send(index === 0 ? 'withdraw-early-first' : 'withdraw-early-racing').expect(200)).body.data).toEqual(first);
  const saved = await connection.collection('visits').findOne({ _id: row._id });
  expect(saved).toMatchObject({ state: 'SCHEDULED', sitterId: null, handoverRequired: true, handoverAccepted: false });
  expect(String(saved.requestedSitterId)).toBe(sitter.userId);
  const { EmployeeVisitOffer, EmployeeScheduleEvent } = module.repository.models;
  expect(await EmployeeScheduleEvent.countDocuments({ visitId: String(row._id), sitterId: sitter.userId, type: 'VisitWithdrawn' })).toBe(1);
  expect(await EmployeeVisitOffer.countDocuments({ visitId: row._id, state: 'PENDING' })).toBe(0);
  const current = await connection.collection('visits').findOne({ _id: row._id });
  expect(current.dispatchReview.code).toBe('DIRECTED_SCHEDULE_REVIEW_REQUIRED');
  await expect(module.dispatch.invite(staff, String(row._id), { expectedVersion: current.version, sitterId: replacement.userId }, 'withdraw-no-manual-bypass'))
    .rejects.toMatchObject({ code: 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' });
  const preview = await module.dispatch.previewCandidates(staff, String(row._id), { startAt: current.startAt.toISOString(), mode: 'REPLACEMENT' });
  expect(preview.items.map(item => item.sitterId)).toContain(replacement.userId);
  expect(preview.items.map(item => item.sitterId)).not.toContain(sitter.userId);
  const proposal = await module.proposals.propose(staff, String(row._id), { expectedVersion: current.version,
    startAt: current.startAt.toISOString(), sitterId: replacement.userId }, 'withdraw-propose-replacement');
  expect(proposal).toMatchObject({ previousSitterId: sitter.userId, sitterId: replacement.userId, state: 'PENDING_CUSTOMER_CONFIRMATION' });
  expect(await EmployeeVisitOffer.countDocuments({ visitId: row._id, state: 'PENDING' })).toBe(0);
  const inputConfirmation = { actor: customer, proposalId: proposal.id, expectedVersion: 0, selectedSlot: proposal.slots[0], idempotencyKey: 'withdraw-confirm-replacement' };
  const confirmed = await module.proposals.confirmProposal(inputConfirmation);
  expect(await module.proposals.confirmProposal(inputConfirmation)).toEqual(confirmed);
  expect(String((await connection.collection('visits').findOne({ _id: row._id })).requestedSitterId)).toBe(replacement.userId);
  await module.dispatch.offers.accept(replacement, confirmed.offer.id, 0, 'withdraw-replacement-accept');
  expect(await connection.collection('visits').findOne({ _id: row._id })).toMatchObject({ state: 'ASSIGNED', handoverRequired: true, handoverAccepted: false });
  await request(app).get(`${withdrawalPath(row)}/care`).set('x-test-actor', replacement.userId).expect(403);
  const handover = (await request(app).get(`${withdrawalPath(row)}/handover`).set('x-test-actor', replacement.userId).expect(200)).body.data;
  expect(handover).toMatchObject({ state: 'PENDING', note: { reasonCode: 'FAMILY_EMERGENCY' }, assignedAt: new Date(clock()).toISOString() });
  expect(await connection.collection('notifications').countDocuments({ eventType: 'VisitHandoverRequired', recipientId: replacement.userId, 'metadata.visitId': String(row._id) })).toBe(1);
});


test('UC-82 GBR-21 competes with real check-in on the same visit version', async () => {
  const sitter = await employee(), row = await assignedForWithdrawal(sitter, '2026-10-30T03:15:00Z');
  const mediaId = '9'.repeat(64);
  await connection.collection('privateimages').insertOne({ _id: mediaId, ownerId: new mongoose.Types.ObjectId(sitter.userId),
    state: 'READY', byteLength: 100, contentDigest: 'a'.repeat(64) });
  const finance = createBookingFinanceSourceService({ connection, clock: () => new Date(clock()) });
  const [withdrawal, checkIn] = await Promise.allSettled([
    sendWithdrawal(row, sitter, { expectedVersion: 0, expectedMode: 'LATE', reasonCode: 'OTHER' }, 'withdraw-before-check-in').then(response => response.status),
    finance.checkIn({ actor: sitter, visitId: String(row._id), expectedVersion: 0, idempotencyKey: 'check-in-before-withdrawal', mediaId })
  ]);
  expect(withdrawal.status).toBe('fulfilled');
  expect(checkIn.status === 'fulfilled' ? withdrawal.value : checkIn.reason.status).toBe(409);
  expect(await connection.collection('visits').findOne({ _id: row._id })).toMatchObject({
    version: 1, state: checkIn.status === 'fulfilled' ? 'IN_PROGRESS' : 'ASSIGNED'
  });
  expect(await module.repository.models.EmployeeScheduleEvent.countDocuments({ visitId: String(row._id),
    type: 'VisitWithdrawalRequested' })).toBe(checkIn.status === 'fulfilled' ? 0 : 1);
});

test('UC-82 sends a requeued visit with no candidates to Staff', async () => {
  const sitter = await employee(), row = await assignedForWithdrawal(sitter, '2026-11-23T04:00:00Z');
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { serviceId: oid() } });
  await sendWithdrawal(row, sitter, { expectedVersion: 0, expectedMode: 'EARLY', reasonCode: 'OTHER' }, 'withdraw-no-candidates').expect(200);
  const stored = await connection.collection('visits').findOne({ _id: row._id });
  expect(stored.dispatchReview.code).toBe('NO_ELIGIBLE_SITTER');
  expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id, state: 'PENDING' })).toBe(0);
});

async function sequentialFixture({ scores = [4, 3], preferred = false, consent = false, start = '2026-10-31T03:00:00Z', rankerFails = false } = {}) {
  const workers = [];
  const serviceId = oid();
  for (const score of scores) {
    const worker = await employee();
    workers.push({ ...worker, score });
    await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(worker.userId) }, { $set: { serviceIds: [serviceId] } });
  }
  const row = await visit({ start, requestedSitterId: preferred ? workers[0].userId : undefined });
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: { serviceId, ...(consent ? { customerScheduleConsent: oid() } : {}) } });
  const dispatch = createEmployeeDispatchService({ repository: module.repository, clock, ranker: async ({ sitterIds }) => {
    if (rankerFails) throw new Error('Synthetic ranker failure');
    const ranked = workers.filter(worker => sitterIds.includes(worker.userId)).sort((a, b) => b.score - a.score);
    return { sitterIds: ranked.map(worker => worker.userId), scoresBySitterId: Object.fromEntries(ranked.map(worker => [worker.userId, worker.score])) };
  } });
  const offers = state => module.repository.models.EmployeeVisitOffer.find({ visitId: row._id, ...(state ? { state } : {}) }).sort({ _id: 1 }).lean();
  const first = key => dispatch.invite(staff, String(row._id), { expectedVersion: 0 }, key);
  const rerun = () => dispatch.runBatch({ limit: 20 });
  return { row, workers, dispatch, offers, first, rerun };
}

test.each(['INELIGIBLE', 'DECLINED', 'EXPIRED'])('directed dispatch waits for customer consent after %s', async reason => {
  const { row, workers, dispatch, offers, first, rerun } = await sequentialFixture({ scores: [1, 9, 8], preferred: true });
  if (reason === 'INELIGIBLE') {
    await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(workers[0].userId) }, { $set: { serviceIds: [] } });
    await expect(first(`consent-ineligible-${row._id}`)).rejects.toMatchObject({ code: 'DIRECTED_SCHEDULE_REVIEW_REQUIRED' });
  } else {
    await first(`consent-first-${row._id}`);
    const [opening] = await offers('PENDING');
    expect(opening.sitterId).toBe(workers[0].userId);
    if (reason === 'DECLINED') await dispatch.offers.decline(workers[0], String(opening._id), 0, `consent-decline-${row._id}`, { reasonCode: 'SCHEDULE_CONFLICT' });
    else await module.repository.models.EmployeeVisitOffer.updateOne({ _id: opening._id }, { $set: { deadline: new Date(clock()) } });
  }
  await rerun();
  expect(await offers('PENDING')).toHaveLength(0);
  expect((await offers()).every(offer => offer.sitterId === workers[0].userId)).toBe(true);
  const stored = await connection.collection('visits').findOne({ _id: row._id });
  expect(stored.dispatchReview.code).toBe('DIRECTED_SCHEDULE_REVIEW_REQUIRED');
  await expect(dispatch.invite(staff, String(row._id), { expectedVersion: stored.version, sitterId: workers[1].userId }, `consent-no-bypass-${row._id}`))
    .rejects.toMatchObject({ code: 'DIRECTED_SITTER_MISMATCH' });
  expect(String(stored.requestedSitterId)).toBe(workers[0].userId);
  expect(stored.sitterId).toBeNull();
});

test('GBR-12 offers the top five together and GBR-13 permits exactly one winner', async () => {
  const { row, workers, dispatch, offers, first, rerun } = await sequentialFixture({ scores: [74.04, 74.01, 74.01, 74.01, 70] });
  await first(`gbr12-tie-${row._id}`);
  const group = await offers('PENDING');
  expect(group.map(offer => offer.sitterId)).toEqual(workers.map(worker => worker.userId));
  await dispatch.offers.decline(workers[0], String(group[0]._id), 0, `gbr12-tie-decline-${row._id}`, { reasonCode: 'SCHEDULE_CONFLICT' });
  await rerun();
  expect(await offers('PENDING')).toHaveLength(4);
  const responses = await Promise.allSettled(group.slice(1, 3).map((offer, index) =>
    dispatch.offers.accept(workers[index + 1], String(offer._id), 0, `gbr13-${offer._id}`)));
  expect(responses.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(responses.find(result => result.status === 'rejected').reason).toMatchObject({ code: 'VISIT_ALREADY_ASSIGNED', status: 409 });
  expect(await offers('REVOKED')).toHaveLength(3);
});

test('GBR-12 sends all six tied leaders and reports the full pending count', async () => {
  const { row, workers, dispatch, offers, first, rerun } = await sequentialFixture({ scores: [9, 9, 9, 9, 9, 9, 8] });
  await first(`gbr12-six-${row._id}`);
  await Promise.all([rerun(), rerun()]);
  expect((await offers()).map(offer => offer.sitterId)).toEqual(workers.slice(0, 6).map(worker => worker.userId));
  const queue = await dispatch.queue(staff);
  expect(queue.items).toContainEqual(expect.objectContaining({ id: String(row._id), pendingInvitationCount: 6 }));
});

test('GBR-12 uses a five-person batch on ranker failure and reports a shortage after expiry', async () => {
  const { row, dispatch, offers, first, rerun } = await sequentialFixture({ scores: [9, 9, 9, 9, 9, 9, 9], rankerFails: true });
  await first(`gbr12-ranker-failed-${row._id}`);
  expect(await offers('PENDING')).toHaveLength(5);
  expect((await dispatch.details(staff, String(row._id))).dispatchRanking.candidates.every(candidate => candidate.score === null)).toBe(true);
  await module.repository.models.EmployeeVisitOffer.updateMany({ visitId: row._id }, { $set: { deadline: new Date(clock()) } });
  await rerun();
  expect(await offers('EXPIRED')).toHaveLength(5);
  expect(await offers('PENDING')).toHaveLength(0);
  expect(await dispatch.details(staff, String(row._id))).toMatchObject({
    reviewCode: 'INSUFFICIENT_DISPATCH_CANDIDATES', dispatchRanking: { eligibleCount: 2, invitedCount: 0 }
  });
});

test('Staff can add one eligible sitter to a pending automatic batch while preserving previous offers', async () => {
  const { row, workers, dispatch, offers, first } = await sequentialFixture({ scores: [95, 90, 85, 80, 75, 70, 65] });
  const visitId = String(row._id);
  await first('pending-batch-opening');
  const details = await dispatch.details(staff, visitId);
  expect(details.dispatchRanking.candidates[0]).toMatchObject({ sitterId: workers[0].userId, score: 95, rank: 1, invited: true });
  expect((await dispatch.queue(staff)).items.find(item => item.id === visitId)).not.toHaveProperty('dispatchRanking');
  const preview = await dispatch.previewCandidates(staff, visitId, { startAt: row.startAt.toISOString(), mode: 'MANUAL' });
  expect(new Set(preview.items.map(candidate => candidate.sitterId))).toEqual(new Set(workers.slice(5).map(worker => worker.userId)));
  const body = { expectedVersion: details.version, sitterId: workers[5].userId };
  const additional = await dispatch.invite(staff, visitId, body, 'pending-add-worker');
  expect(await dispatch.invite(staff, visitId, body, 'pending-add-worker')).toEqual(additional);
  expect(additional.invitationCount).toBe(1);
  expect(await offers('PENDING')).toHaveLength(6);
  const updated = await dispatch.details(staff, visitId);
  expect(updated.latestOffers).toHaveLength(6);
  expect(updated.latestOffers.every(offer => offer.deadline instanceof Date)).toBe(true);
  expect(+updated.pendingInvitation.earliestDeadline).toBe(Math.min(...updated.latestOffers.map(offer => +offer.deadline)));
  await expect(dispatch.invite(staff, visitId, { ...body, expectedVersion: updated.version }, 'pending-duplicate-worker'))
    .rejects.toMatchObject({ code: 'SITTER_ALREADY_INVITED' });
  await request(app).get('/api/v1/employee-scheduling/visits/' + visitId + '/dispatch').set('x-test-actor', workers[0].userId).expect(403);
  await connection.collection('visits').updateOne({ _id: row._id }, { $set: {
    startAt: new Date(+row.startAt + 3600000), endAt: new Date(+row.endAt + 3600000)
  }, $inc: { version: 1 } });
  const rescheduled = await dispatch.details(staff, visitId);
  expect(rescheduled).not.toHaveProperty('dispatchRanking');
  expect(rescheduled.latestOffers).toEqual([]);
});

test('GBR-12 preserves the sitter accepted by the customer on a reschedule', async () => {
  const { row, workers, offers, first, rerun } = await sequentialFixture({ preferred: true, consent: true });
  await first(`gbr12-consent-${row._id}`);
  const [offer] = await offers('PENDING');
  expect(offer.sitterId).toBe(workers[0].userId);
  await module.repository.models.EmployeeVisitOffer.updateOne({ _id: offer._id }, { $set: { deadline: new Date(clock()) } });
  await rerun();
  expect(await offers()).toHaveLength(1);
});

test.each([
  ['2026-10-31T03:01:00Z', 120, false],
  ['2026-10-31T03:00:00Z', 30, true],
  ['2026-10-31T02:59:00Z', 30, false],
  ['2026-10-30T03:30:00Z', 30, true],
  ['2026-10-30T03:20:00Z', 20, false]
])('GBR-12 caps the deadline for %s and preserves explicit Staff selection (%s min, manual %s)', async (start, minutes, manual) => {
  const { row, workers, dispatch, first } = await sequentialFixture({ start, preferred: !manual });
  const result = manual
    ? await dispatch.invite(staff, String(row._id), { sitterId: workers[1].userId, expectedVersion: 0 }, `gbr12-staff-${row._id}`)
    : await first(`gbr12-window-${row._id}`);
  expect(result.invitations.map(offer => offer.sitterId)).toEqual([workers[manual ? 1 : 0].userId]);
  expect(new Date(result.invitations[0].deadline).getTime()).toBe(clock() + minutes * 60000);
});

test('signed upcoming contract permits onboarding preparation but does not authorize work before its start', async () => {
 const sitter=await employee({configure:false});const effectiveAt=new Date('2026-10-31T00:00:00+07:00');
 await payroll.EmploymentContract.updateOne({employeeId:sitter.userId},{$set:{effectiveAt}});
 const own=await module.repository.areas.getMine({actor:sitter});expect(own.registrationContract).toMatchObject({state:'UPCOMING',effectiveAt:effectiveAt.toISOString()});
 const saved=await module.repository.areas.replaceMine({actor:sitter,areas:['DISTRICT_HAI_BA_TRUNG'],expectedVersion:0,idempotencyKey:'future-contract-area'});expect(saved.expectedVersion).toBe(1);
 const availability=await module.repository.availability.getMine({actor:sitter});expect(availability.registrationContract.state).toBe('UPCOMING');
 await expect(module.repository.availability.updateMine({actor:sitter,command:{zone:'Asia/Ho_Chi_Minh',effectiveFrom:'2026-10-30',workingWindows:windows,expectedVersion:1,idempotencyKey:'before-contract-shifts'}})).rejects.toMatchObject({code:'CONTRACT_REQUIRED'});
 await module.repository.availability.updateMine({actor:sitter,command:{zone:'Asia/Ho_Chi_Minh',effectiveFrom:'2026-10-31',workingWindows:windows,expectedVersion:1,idempotencyKey:'future-contract-shifts'}});
 await expect(module.repository.contractAt(sitter.userId,new Date(clock()),new Date(clock()))).rejects.toMatchObject({code:'CONTRACT_REQUIRED'});
 expect((await module.repository.contractAt(sitter.userId,effectiveAt,effectiveAt)).employmentType).toBe('PART_TIME');
 await connection.collection('employmentcontracts').updateOne({employeeId:new mongoose.Types.ObjectId(sitter.userId)},{$unset:{verifiedBy:''}});
 await expect(module.repository.areas.replaceMine({actor:sitter,areas:[],expectedVersion:2,idempotencyKey:'unverified-contract-areas'})).rejects.toMatchObject({code:'CONTRACT_REQUIRED'});
});

test('UC-41 GBR-24 confirms an urgent assignment once and returns the MSG81 check-in time', async () => {
  const sitter = await employee(), other = await employee();
  const row = await assignedForWithdrawal(sitter, '2026-10-30T03:20:00Z');
  const visits = connection.collection('visits'), path = withdrawalPath(row);
  await visits.updateOne({ _id: row._id }, { $set: {
    handoverRequired: true, handoverAccepted: false, assignedAt: new Date(clock()),
    handoverLateCheckInExempt: true, 'snapshots.care': { schemaVersion: 1, capturedAt: new Date(clock()),
      pets: row.snapshots.pets, privateAccessNotes: 'synthetic access note' }
  } });
  const get = () => request(app).get(path + '/handover');
  await get().expect(401);
  await get().set('x-test-actor', customer.userId).expect(403);
  await get().set('x-test-actor', other.userId).expect(404);
  const current = (await get().set('x-test-actor', sitter.userId).expect(200)).body.data;
  expect(current).toMatchObject({ state: 'PENDING', urgent: true });
  expect(JSON.stringify(current)).not.toContain('synthetic access note');
  const access = () => request(app).get(path + '/access-notes').set('x-test-actor', sitter.userId);
  await access().expect(403);
  const mediaId = 'd'.repeat(64);
  await connection.collection('privateimages').insertOne({ _id: mediaId, ownerId: new mongoose.Types.ObjectId(sitter.userId),
    state: 'READY', byteLength: 100, contentDigest: 'a'.repeat(64) });
  const finance = createBookingFinanceSourceService({ connection, clock: () => new Date(clock()) });
  const checkIn = (expectedVersion, idempotencyKey) => finance.checkIn({ actor: sitter, visitId: String(row._id), expectedVersion, idempotencyKey, mediaId });
  await expect(checkIn(current.version, 'check-in-before-handover')).rejects.toMatchObject({ code: 'HANDOVER_REQUIRED' });
  const send = (input, key = 'test-handover-confirmation') => request(app).post(path + '/handover-confirmations')
    .set({ 'x-test-actor': sitter.userId, 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': key, Host: 'localhost', Origin: 'http://localhost' }).send(input);
  const input = { expectedVersion: current.version, careVersion: current.care.version, acknowledged: true };
  await send({ ...input, acknowledged: false }).expect(422);
  await send({ ...input, expectedVersion: current.version + 1 }).expect(409);
  await send({ ...input, careVersion: 'a'.repeat(64) }, 'test-handover-stale-care').expect(409);
  const first = (await send(input).expect(200)).body.data;
  expect(first).toMatchObject({ state: 'CONFIRMED', checkInOpensAt: '2026-10-30T02:50:00.000Z', version: current.version + 1 });
  expect((await send(input).expect(200)).body.data).toEqual(first);
  await send({ ...input, careVersion: 'a'.repeat(64) }).expect(409);
  await send(input, 'test-handover-second-command').expect(409);
  expect(await visits.findOne({ _id: row._id })).toMatchObject({
    handoverAccepted: true, handoverAcceptedBy: expect.anything(), handoverAcceptedAt: new Date(clock()),
    careAcknowledgement: { sitterId: sitter.userId, version: input.careVersion, acknowledgedAt: new Date(clock()) }
  });
  expect((await access().expect(200)).body.data.privateAccessNotes).toBe('synthetic access note');
  await expect(checkIn(first.version, 'check-in-after-handover')).resolves.toMatchObject({ state: 'IN_PROGRESS' });
  expect(await connection.collection('notifications').countDocuments({ eventType: 'VisitHandoverConfirmed', recipientId: staff.userId, 'metadata.visitId': String(row._id) })).toBe(1);
});

test('UC-41 GBR-24 payroll onTime treats equally late first assignments and replacements differently', async () => {
  const sitterId = oid(), startAt = new Date(clock()), checkInAt = new Date(clock() + 10 * 60000), assignedAt = new Date(clock() - 40 * 60000);
  const checkOutAt = new Date(clock() + 30 * 60000), common = { bookingId: oid(), sitterId, state: 'COMPLETED',
    startAt, checkInAt, assignedAt, checkOutAt, completedAt: checkOutAt, version: 4, snapshots: { employeeServiceNetVnd: 100000 } };
  const ordinary = { ...common, _id: oid() }, urgent = { ...common, _id: oid(), handoverRequired: true, handoverAccepted: true };
  await connection.transaction(session => recordEmployeeServiceCompletion({ connection, visits: [ordinary, urgent], session }));
  expect(await payroll.PayrollServiceCredit.findOne({ visitId: ordinary._id }).lean()).toMatchObject({ onTime: false });
  expect(await payroll.PayrollServiceCredit.findOne({ visitId: urgent._id }).lean()).toMatchObject({ onTime: true });
});

describe('UC-41 GBR-24 accepting an offer stores the late check-in exemption', () => {
  const startIn = minutes => new Date(clock() + minutes * 60000).toISOString();
  const waiting = { handoverRequired: true, handoverAccepted: false };
  const storedVisit = row => connection.collection('visits').findOne({ _id: row._id });
  // Staff invitation: Staff picks the sitter, the sitter accepts the resulting offer.
  async function acceptStaffInvitation(minutes, handover) {
    const sitter = await employee(), row = await visit({ start: startIn(minutes) });
    if (handover) await connection.collection('visits').updateOne({ _id: row._id }, { $set: handover });
    const invitation = await module.dispatch.invite(staff, String(row._id), { expectedVersion: 0, sitterId: sitter.userId }, `exempt-staff-invite-${row._id}`);
    await module.dispatch.offers.accept(sitter, invitation.offerId, 0, `exempt-staff-accept-${row._id}`);
    return storedVisit(row);
  }
  // Automatic invitation: the dispatch batch offers the visit, the sitter accepts it.
  async function acceptAutomaticInvitation(minutes, handover) {
    // Earlier tests leave many sitters in the same area; the automatic search refuses more than 100 candidates.
    await module.repository.models.EmployeeAvailability.deleteMany({});
    const { row, workers, dispatch, offers, first } = await sequentialFixture({ scores: [5, 4, 3, 2, 1], start: startIn(minutes) });
    if (handover) await connection.collection('visits').updateOne({ _id: row._id }, { $set: handover });
    await first(`exempt-auto-invite-${row._id}`);
    const [offer] = await offers('PENDING');
    await dispatch.offers.accept(workers[0], String(offer._id), 0, `exempt-auto-accept-${row._id}`);
    return storedVisit(row);
  }
  const paths = [['Staff invitation', acceptStaffInvitation], ['automatic invitation', acceptAutomaticInvitation]];

  describe.each(paths)('%s', (_name, accept) => {
    test.each([[30, true], [59, true], [60, false], [90, false]])(
      'a replacement accepted %i minutes before the visit stores handoverLateCheckInExempt=%s', async (minutes, exempt) => {
        const stored = await accept(minutes, waiting);
        expect(stored).toMatchObject({ state: 'ASSIGNED', handoverRequired: true, handoverAccepted: false, handoverLateCheckInExempt: exempt,
          assignedAt: new Date(clock()) });
      });

    test('a first assignment stays non-exempt even when it is accepted 30 minutes before the visit', async () => {
      const stored = await accept(30, undefined);
      expect(stored).toMatchObject({ state: 'ASSIGNED' });
      expect(stored).not.toHaveProperty('handoverLateCheckInExempt');
      expect(stored.handoverRequired).not.toBe(true);
    });

    test('a visit whose handover is already confirmed does not get a new flag', async () => {
      const stored = await accept(30, { handoverRequired: true, handoverAccepted: true });
      expect(stored).toMatchObject({ state: 'ASSIGNED', handoverRequired: true, handoverAccepted: true });
      expect(stored).not.toHaveProperty('handoverLateCheckInExempt');
    });
  });
});

describe('UC-41 GBR-24 monthly bonus on-time threshold counts urgent replacements as on time', () => {
  const admin = actor('ADMIN'), monthClose = Date.parse('2026-11-02T03:00:00Z');
  const month = { periodStart: '2026-10-01T08:00:00+07:00', periodEnd: '2026-11-01T00:00:00+07:00', dueAt: '2026-11-02T00:00:00+07:00' };
  // 20 completed 30-minute visits in October, all with a complete report. Check-in is 10 minutes late on `late` of them;
  // `urgent` of those late visits were replacements accepted 40 minutes before the start.
  async function credits({ late, urgent }) {
    const sitter = await employee(), sitterId = new mongoose.Types.ObjectId(sitter.userId);
    const visits = Array.from({ length: 20 }, (_, index) => {
      const startAt = new Date(Date.parse('2026-10-10T02:00:00Z') + index * 3600000), lateCheckIn = index < late;
      const checkInAt = new Date(+startAt + (lateCheckIn ? 10 : 0) * 60000), checkOutAt = new Date(+checkInAt + 30 * 60000);
      return { _id: oid(), bookingId: oid(), sitterId, state: 'COMPLETED', startAt, checkInAt, checkOutAt, completedAt: checkOutAt,
        assignedAt: new Date(+startAt - 3 * 86400000), version: 4, snapshots: { employeeServiceNetVnd: 100000 },
        ...(index < urgent ? { handoverRequired: true, handoverAccepted: true, assignedAt: new Date(+startAt - 40 * 60000) } : {}) };
    });
    await connection.transaction(session => recordEmployeeServiceCompletion({ connection, visits, session }));
    return sitter;
  }
  const assess = sitter => ({ employeeId: sitter.userId, ...month, scheduledMonthMinutes: 4800, paidPeriodMinutes: 4800, kpiTargetMinutes: 600,
    seriousViolationConfirmed: false, includeMonthlyBonus: true, overtimeVnd: 0, employeeInsuranceVnd: 0, incomeTaxVnd: 0, otherLawfulDeductionsVnd: 0,
    assessmentReference: 'synthetic-approved-timecard-tax-assessment', deductionConsentReference: 'synthetic-no-deductions', advanceRepayments: [] });

  test.each([
    // [late visits, urgent replacements among them, on-time credits, onTimeBps, bonus]
    [1, 0, 19, 9500, 300000],
    [2, 0, 18, 9000, 0],
    [2, 1, 19, 9500, 300000],
    [2, 2, 20, 10000, 300000],
    [3, 1, 18, 9000, 0]
  ])('%i late check-ins, %i of them urgent replacements: %i on-time credits, %i bps, bonus %i VND', async (late, urgent, onTime, bps, bonusVnd) => {
    const sitter = await credits({ late, urgent });
    expect(await payroll.PayrollServiceCredit.countDocuments({ employeeId: new mongoose.Types.ObjectId(sitter.userId), onTime: true })).toBe(onTime);
    expect(Math.floor(onTime * 10000 / 20)).toBe(bps);
    const bonusPayroll = createPayrollService({ connection, policy: employeePayrollPolicyResolver, clock: () => monthClose });
    const statement = await bonusPayroll.prepareStatement(admin, assess(sitter), `monthly-bonus-${late}-${urgent}-${sitter.userId}`);
    expect(statement.breakdown).toMatchObject({ bonusVnd });
  });
});

// UC-38 Reassign Pet Sitter (R3 11.2.1, GBR-24, GBR-32, MSG25, MSG45, MSG46, MSG92).
describe('UC-38 Staff replace the pet sitter of an accepted visit', () => {
  const root = '/api/v1/employee-scheduling', pathOf = row => `${root}/visits/${row._id}`;
  const visits = () => connection.collection('visits');
  const newStaff = async (role = 'STAFF') => { const value = actor(role); await connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(value.userId), ...value }); return value; };
  const read = (row, who) => request(app).get(`${pathOf(row)}/reassignment`).set('x-test-actor', who.userId);
  const send = (row, who, body, key = `reassign-${row._id}`) => request(app).post(`${pathOf(row)}/reassignments`)
    .set({ 'x-test-actor': who.userId, 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': key, Host: 'localhost', Origin: 'http://localhost' }).send(body);
  const LATE_START = '2026-10-30T09:00:00Z', STARTED = '2026-10-30T02:25:00Z', SOON = '2026-10-30T03:40:00Z';
  async function assigned(start, { withdrawal = false, requested = false } = {}) {
    const holder = await employee(), row = await assignedForWithdrawal(holder, start);
    await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(holder.userId) }, { $set: { displayName: 'Người chăm sóc cũ' } });
    await visits().updateOne({ _id: row._id }, { $set: { assignedAt: new Date(clock() - 5 * 3600000), ...(requested ? { requestedSitterId: new mongoose.Types.ObjectId(holder.userId) } : {}),
      'snapshots.care': { schemaVersion: 1, capturedAt: new Date(clock()), pets: row.snapshots.pets, privateAccessNotes: 'synthetic access note' } } });
    if (withdrawal) await sendWithdrawal(row, holder, { expectedVersion: 0, expectedMode: 'LATE', reasonCode: 'ILLNESS', note: 'Synthetic note' }, `uc38-withdraw-${row._id}`).expect(200);
    return { row, holder, version: withdrawal ? 1 : 0 };
  }
  const notices = (type, recipientId) => connection.collection('notifications').find({ eventType: type, ...(recipientId ? { recipientId } : {}) }).toArray();
  const eventTypes = async row => (await module.repository.models.EmployeeScheduleEvent.find({ visitId: String(row._id) }).sort({ at: 1, _id: 1 }).lean()).map(item => item.type);
  beforeAll(async () => {
    await module.repository.models.EmployeeAvailability.deleteMany({});
    await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(customer.userId) }, { $set: { displayName: 'Khách hàng mẫu' } });
  });

  test('roles: 401 without a session, 403 for pet sitters and customers, Staff and Admin may read', async () => {
    const { row, holder } = await assigned(LATE_START);
    await request(app).get(`${pathOf(row)}/reassignment`).expect(401);
    await send(row, customer, { expectedVersion: 0, sitterId: String(oid()), reason: 'x' }).expect(403);
    await read(row, customer).expect(403); await read(row, holder).expect(403);
    await send(row, holder, { expectedVersion: 0, sitterId: String(oid()), reason: 'x' }).expect(403);
    for (const role of ['STAFF', 'ADMIN']) await read(row, await newStaff(role)).expect(200);
  });

  test('the list holds only sitters passing the same checks, and never the holder or a sitter who withdrew', async () => {
    const { row, holder } = await assigned(LATE_START, { withdrawal: true });
    const ok = await employee(), dayOff = await employee(), busy = await employee(), withdrew = await employee();
    await connection.collection('aisitterprofiles').updateOne({ userId: new mongoose.Types.ObjectId(dayOff.userId) }, { $set: { dayOffDates: ['2026-10-30'] } });
    await assignedForWithdrawal(busy, LATE_START);
    await module.repository.models.EmployeeScheduleEvent.create({ type: 'VisitWithdrawn', sitterId: withdrew.userId, visitId: String(row._id), actorId: withdrew.userId, at: new Date(clock()) });
    const body = (await read(row, await newStaff()).expect(200)).body.data;
    expect(body.visit).toMatchObject({ id: String(row._id), version: 1, withdrawalPending: true, customerName: expect.anything() });
    expect(body.visit.reasons.map(reason => reason.code)).toEqual(expect.arrayContaining(['WITHDRAWAL_UNDER_12H']));
    expect(body.currentSitter).toMatchObject({ id: holder.userId, employmentType: 'PART_TIME' });
    const listed = [...body.items, ...body.blocked].map(item => item.sitterId);
    expect(body.items.map(item => item.sitterId)).toContain(ok.userId);
    expect(body.items.every(item => Number.isFinite(item.weeklyMinutes))).toBe(true);
    expect(body.blocked).toEqual(expect.arrayContaining([expect.objectContaining({ sitterId: dayOff.userId, reason: 'DAY_OFF' }), expect.objectContaining({ sitterId: busy.userId, reason: 'SLOT_UNAVAILABLE' })]));
    expect(listed).not.toContain(holder.userId); expect(listed).not.toContain(withdrew.userId);
    const staffUser = await newStaff();
    const refused = await send(row, staffUser, { expectedVersion: 1, sitterId: dayOff.userId, reason: 'Synthetic' }, 'uc38-day-off').expect(409);
    expect(refused.body.error).toMatchObject({ code: 'REASSIGN_SITTER_NOT_ELIGIBLE', reasonCode: 'DAY_OFF' });
    const taken = await send(row, staffUser, { expectedVersion: 1, sitterId: busy.userId, reason: 'Synthetic' }, 'uc38-busy').expect(409);
    expect(taken.body.error.code).toBe('REASSIGN_SITTER_BUSY');
    expect((await send(row, staffUser, { expectedVersion: 1, sitterId: withdrew.userId, reason: 'Synthetic' }, 'uc38-withdrew').expect(409)).body.error).toMatchObject({ code: 'REASSIGN_SITTER_NOT_ELIGIBLE', reasonCode: 'SITTER_WITHDREW' });
    expect(await visits().findOne({ _id: row._id })).toMatchObject({ sitterId: new mongoose.Types.ObjectId(holder.userId), version: 1 });
  });

  test('a late withdrawal request is replaced in one step: new holder, handover flag with the staff reason, request closed, everyone told', async () => {
    const { row, holder } = await assigned(LATE_START, { withdrawal: true }), replacement = await employee(), staffUser = await newStaff();
    await module.repository.models.EmployeeVisitOffer.create({ visitId: row._id, sitterId: replacement.userId, state: 'PENDING', version: 0, offeredAt: new Date(clock()), deadline: new Date(clock() + 600000) });
    const input = { expectedVersion: 1, sitterId: replacement.userId, reason: '  Người cũ báo ốm.  ' };
    const first = await send(row, staffUser, input, 'uc38-replace-late').expect(200);
    expect(first.body.data).toMatchObject({ visitId: String(row._id), version: 2, state: 'ASSIGNED', sitterId: replacement.userId, handoverLateCheckInExempt: false });
    expect((await send(row, staffUser, input, 'uc38-replace-late').expect(200)).body.data).toEqual(first.body.data);
    await send(row, staffUser, { ...input, reason: 'Khác' }, 'uc38-replace-late').expect(409);
    const stored = await visits().findOne({ _id: row._id });
    expect(String(stored.sitterId)).toBe(replacement.userId);
    expect(stored).toMatchObject({ state: 'ASSIGNED', version: 2, handoverRequired: true, handoverAccepted: false, handoverLateCheckInExempt: false, assignedAt: new Date(clock()),
      handoverNote: { reasonText: 'Người cũ báo ốm.', flaggedAt: new Date(clock()) } });
    expect(String(stored.handoverNote.previousSitterId)).toBe(holder.userId);
    for (const gone of ['withdrawalRequest', 'withdrawalDispatch', 'careAcknowledgement', 'assignedFeatureSnapshot']) expect(stored).not.toHaveProperty(gone);
    expect(stored.withdrawalDecision).toMatchObject({ decision: 'REASSIGN', reason: 'Người cũ báo ốm.', byUserId: staffUser.userId });
    expect(stored.staffReassignment).toMatchObject({ reason: 'Người cũ báo ốm.', withdrawalReasonCode: 'ILLNESS' });
    expect(await module.repository.models.EmployeeVisitOffer.countDocuments({ visitId: row._id, state: 'PENDING' })).toBe(0);
    expect((await module.dispatch.queue(staff)).withdrawalRequests.some(item => item.id === String(row._id))).toBe(false);
    // The former holder's withdrawal count does not grow: the request was recorded once, and the replacement is its own event.
    const types = await eventTypes(row);
    expect(types.filter(type => ['VisitWithdrawn', 'VisitWithdrawalRequested'].includes(type))).toHaveLength(1);
    expect(types).toEqual(expect.arrayContaining(['VisitReassigned', 'VisitHandoverRequired']));
    const customerNotice = await notices('VisitReassigned', customer.userId), formerNotice = await notices('VisitReassigned', holder.userId);
    expect(customerNotice.filter(item => item.metadata.visitId === String(row._id))).toHaveLength(1); expect(formerNotice).toHaveLength(1);
    expect(customerNotice.find(item => item.metadata.visitId === String(row._id)).deepLink).toBe(`/account/bookings/${stored.bookingId}`);
    expect(formerNotice[0]).toMatchObject({ deepLink: '/sitter/schedule', role: 'PET_SITTER' });
    expect(JSON.stringify([...customerNotice, ...formerNotice].map(item => [item.title, item.message]))).not.toMatch(/\+?84\d{8,9}|0\d{9}/);
    expect(await notices('VisitHandoverRequired', replacement.userId)).toEqual([expect.objectContaining({ deepLink: `/sitter/visits/${row._id}/handover` })]);
    // Another staff member who still holds version 1 gets MSG25 and the current state.
    const stale = await send(row, await newStaff(), { expectedVersion: 1, sitterId: (await employee()).userId, reason: 'Synthetic' }, 'uc38-stale').expect(409);
    expect(stale.body.error).toMatchObject({ code: 'REASSIGN_VISIT_CHANGED', version: 2, state: 'ASSIGNED' });
    await send(row, staffUser, { ...input, expectedVersion: 2, sitterId: replacement.userId }, 'uc38-same-holder').expect(409);
  });

  test('a visit 35 minutes past its start is replaced and the replacement is exempt from the late check-in', async () => {
    const { row } = await assigned(STARTED), replacement = await employee();
    const staffUser = await newStaff(), got = (await read(row, staffUser).expect(200)).body.data;
    expect(got.visit.reasons.map(reason => reason.code)).toContain('NOT_CHECKED_IN_30M');
    expect(got.items.map(item => item.sitterId)).toContain(replacement.userId);
    const done = (await send(row, staffUser, { expectedVersion: 0, sitterId: replacement.userId, reason: 'Chưa check-in sau 30 phút' }).expect(200)).body.data;
    expect(done.handoverLateCheckInExempt).toBe(true);
    const stored = await visits().findOne({ _id: row._id });
    expect(stored).toMatchObject({ handoverRequired: true, handoverAccepted: false, handoverLateCheckInExempt: true });
    const checkOutAt = new Date(clock() + 40 * 60000);
    await connection.transaction(session => recordEmployeeServiceCompletion({ connection, session, visits: [{ ...stored, state: 'COMPLETED', handoverAccepted: true,
      checkInAt: new Date(clock() + 35 * 60000), checkOutAt, completedAt: checkOutAt, snapshots: { ...stored.snapshots, employeeServiceNetVnd: 100000 } }] }));
    expect(await payroll.PayrollServiceCredit.findOne({ visitId: row._id }).lean()).toMatchObject({ onTime: true });
    // The same change with 6 hours to go is not exempt; with 40 minutes to go it is.
    const planned = await assigned(LATE_START), other = await employee();
    expect((await send(planned.row, staffUser, { expectedVersion: 0, sitterId: other.userId, reason: 'Synthetic' }).expect(200)).body.data.handoverLateCheckInExempt).toBe(false);
    const soon = await assigned(SOON), nearby = await employee();
    expect((await send(soon.row, staffUser, { expectedVersion: 0, sitterId: nearby.userId, reason: 'Synthetic' }).expect(200)).body.data.handoverLateCheckInExempt).toBe(true);
  });

  test('the replacement reads the staff reason and the former sitter, and cannot check in before confirming', async () => {
    const { row, holder } = await assigned(STARTED), replacement = await employee(), staffUser = await newStaff();
    await send(row, staffUser, { expectedVersion: 0, sitterId: replacement.userId, reason: 'Điều phối đổi người' }).expect(200);
    await request(app).get(`${pathOf(row)}/handover`).set('x-test-actor', holder.userId).expect(404);
    const current = (await request(app).get(`${pathOf(row)}/handover`).set('x-test-actor', replacement.userId).expect(200)).body.data;
    expect(current).toMatchObject({ state: 'PENDING', urgent: true, note: { reasonText: 'Điều phối đổi người', previousSitterName: expect.anything() } });
    const mediaId = 'e'.repeat(64);
    await connection.collection('privateimages').insertOne({ _id: mediaId, ownerId: new mongoose.Types.ObjectId(replacement.userId), state: 'READY', byteLength: 100, contentDigest: 'a'.repeat(64) });
    const finance = createBookingFinanceSourceService({ connection, clock: () => new Date(clock()) });
    await expect(finance.checkIn({ actor: replacement, visitId: String(row._id), expectedVersion: current.version, idempotencyKey: 'uc38-check-in-early', mediaId })).rejects.toMatchObject({ code: 'HANDOVER_REQUIRED' });
  });

  test('a customer-nominated visit is replaced directly; the nomination no longer points dispatch back at the former sitter', async () => {
    const { row, holder } = await assigned(LATE_START, { requested: true }), replacement = await employee(), staffUser = await newStaff();
    await send(row, staffUser, { expectedVersion: 0, sitterId: replacement.userId, reason: 'Synthetic' }).expect(200);
    const stored = await visits().findOne({ _id: row._id });
    expect(stored.requestedSitterId).toBeNull();
    expect(String(stored.staffReassignment.customerRequestedSitterId)).toBe(holder.userId);
    expect(reasonsOfVisit(stored, clock()).map(reason => reason.code)).not.toEqual(expect.arrayContaining(['NO_SITTER_TO_OFFER', 'NO_SITTER_24H']));
    expect((await module.dispatch.queue(staff)).items.some(item => item.id === String(row._id))).toBe(false);
    expect((await notices('VisitReassigned', customer.userId)).some(item => item.metadata.visitId === String(row._id))).toBe(true);
  });

  test('replacing the sitter of one visit leaves the other visits of the same booking with the sitter the customer chose', async () => {
    const { row, holder } = await assigned(LATE_START, { requested: true }), replacement = await employee(), staffUser = await newStaff();
    const second = await employee(), secondId = oid(), secondStart = new Date(Date.parse(LATE_START) + 24 * 3600000);
    const sibling = { ...row, _id: secondId, sitterId: new mongoose.Types.ObjectId(second.userId), requestedSitterId: new mongoose.Types.ObjectId(second.userId),
      startAt: secondStart, endAt: new Date(+secondStart + 60 * 60000), version: 0 };
    await visits().insertOne(sibling);
    await connection.collection('bookings').updateOne({ _id: row.bookingId }, { $set: { visitIds: [row._id, secondId], originalVisitCount: 2, careVisitCount: 2, 'checkoutSnapshot.customerVisits.0.requestedSitterId': new mongoose.Types.ObjectId(holder.userId) } });
    await send(row, staffUser, { expectedVersion: 0, sitterId: replacement.userId, reason: 'Synthetic' }).expect(200);
    const first = await visits().findOne({ _id: row._id }), other = await visits().findOne({ _id: secondId });
    expect(first.requestedSitterId).toBeNull();
    expect(String(first.staffReassignment.customerRequestedSitterId)).toBe(holder.userId);
    expect(String(other.requestedSitterId)).toBe(second.userId);
    expect(String(other.sitterId)).toBe(second.userId);
    expect(other.version).toBe(0); expect(other.staffReassignment).toBeUndefined();
    const booking = await connection.collection('bookings').findOne({ _id: row.bookingId });
    expect(String(booking.checkoutSnapshot.customerVisits[0].requestedSitterId)).toBe(holder.userId);
  });

  test('a visit that is checked in, finished or without a sitter cannot be replaced; a blank reason is 422', async () => {
    const { row } = await assigned(LATE_START), replacement = await employee(), staffUser = await newStaff();
    const valid = { expectedVersion: 0, sitterId: replacement.userId, reason: 'Synthetic' };
    for (const reason of ['', '   ']) expect((await send(row, staffUser, { ...valid, reason }, `uc38-blank-${reason.length}`).expect(422)).body.error.code).toBe('REASON_REQUIRED');
    await send(row, staffUser, { expectedVersion: 0, sitterId: replacement.userId }, 'uc38-no-reason').expect(422);
    await send(row, staffUser, { ...valid, reason: 'x'.repeat(1001) }, 'uc38-long').expect(422);
    await send(row, staffUser, { ...valid, extra: true }, 'uc38-extra').expect(422);
    await visits().updateOne({ _id: row._id }, { $set: { checkInAt: new Date(clock()) } });
    await read(row, staffUser).expect(409);
    expect((await send(row, staffUser, valid, 'uc38-checked-in').expect(409)).body.error.code).toBe('REASSIGN_VISIT_CHANGED');
    await visits().updateOne({ _id: row._id }, { $unset: { checkInAt: 1 }, $set: { state: 'COMPLETED' } });
    await send(row, staffUser, valid, 'uc38-completed').expect(409);
    await visits().updateOne({ _id: row._id }, { $set: { state: 'SCHEDULED', sitterId: null } });
    await read(row, staffUser).expect(409);
    await send(row, staffUser, valid, 'uc38-unassigned').expect(409);
  });

  test('two staff replacing at once: one succeeds and the other gets MSG25', async () => {
    const { row } = await assigned(LATE_START), first = await employee(), second = await employee();
    const results = await Promise.all([send(row, await newStaff(), { expectedVersion: 0, sitterId: first.userId, reason: 'A' }, 'uc38-race-a'),
      send(row, await newStaff('ADMIN'), { expectedVersion: 0, sitterId: second.userId, reason: 'B' }, 'uc38-race-b')]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 409).body.error.code).toBe('REASSIGN_VISIT_CHANGED');
    expect(await visits().countDocuments({ _id: row._id, version: 1 })).toBe(1);
  });

  test('only the reassignment path may open a started visit to the eligibility check', async () => {
    const sitter = await employee(), started = await visit({ start: STARTED });
    await expect(module.repository.eligible(sitter.userId, started)).rejects.toMatchObject({ code: 'SHIFT_REVIEW_REQUIRED' });
    await expect(module.repository.eligible(sitter.userId, started, undefined, { allowStarted: true })).resolves.toMatchObject({ eligible: true });
    const ended = await visit({ start: '2026-10-30T00:30:00Z' });
    await expect(module.repository.eligible(sitter.userId, ended, undefined, { allowStarted: true })).rejects.toMatchObject({ code: 'SHIFT_REVIEW_REQUIRED' });
    await expect(module.dispatch.invite(staff, String(started._id), { expectedVersion: 0, sitterId: sitter.userId }, 'uc38-invite-started')).rejects.toMatchObject({ code: 'SHIFT_START_REACHED' });
  });
});

describe('ST-BKG-05 offer decline reason', () => {
  test('declining without reason or with invalid code returns 422 while keeping offer open, valid reason persists and excludes sitter from automatic re-offer', async () => {
    const { row, workers, dispatch, offers, first, rerun } = await sequentialFixture({ scores: [90, 88, 86, 84, 82, 80, 78, 76, 74, 72] });
    await first(`st-bkg-05-first-${row._id}`);
    const batch = await offers('PENDING');
    expect(batch).toHaveLength(5);
    const target = batch[0];
    const postDecline = (body, key) => request(app)
      .post(`/api/v1/employee-scheduling/offers/${target._id}/declines`)
      .set('x-test-actor', target.sitterId)
      .set('origin', 'http://127.0.0.1')
      .set('host', '127.0.0.1')
      .set('x-csrf-token', 'synthetic-csrf')
      .set('idempotency-key', key)
      .send(body);

    const missing = await postDecline({ expectedVersion: 0 }, `st-bkg-05-missing-${target._id}`).expect(422);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');
    expect(missing.body.error.messageCode).toBe('MSG01');

    const bad = await postDecline({ expectedVersion: 0, reasonCode: 'NOT_A_REASON' }, `st-bkg-05-bad-${target._id}`).expect(422);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');

    expect((await module.repository.models.EmployeeVisitOffer.findById(target._id).lean()).state).toBe('PENDING');

    const ok = await postDecline(
      { expectedVersion: 0, reasonCode: 'ILLNESS', note: 'Bị sốt nhẹ, không đi được' },
      `st-bkg-05-ok-${target._id}`
    ).expect(200);
    expect(ok.body.data).toMatchObject({
      state: 'DECLINED',
      reasonCode: 'ILLNESS',
      note: 'Bị sốt nhẹ, không đi được',
      messageCode: 'MSG79'
    });

    const savedOffer = await module.repository.models.EmployeeVisitOffer.findById(target._id).lean();
    expect(savedOffer).toMatchObject({
      state: 'DECLINED',
      declineReasonCode: 'ILLNESS',
      declineNote: 'Bị sốt nhẹ, không đi được'
    });
    const audit = await module.repository.models.EmployeeScheduleEvent.findOne({ type: 'OfferDeclined', offerId: String(target._id) }).lean();
    expect(audit?.detail).toMatchObject({ reasonCode: 'ILLNESS', note: 'Bị sốt nhẹ, không đi được' });

    for (const remainingOffer of batch.slice(1)) {
      const sitter = workers.find(worker => worker.userId === remainingOffer.sitterId);
      await dispatch.offers.decline(sitter, String(remainingOffer._id), 0, `st-bkg-05-rest-${remainingOffer._id}`, { reasonCode: 'SCHEDULE_CONFLICT' });
    }
    await rerun();
    const nextBatch = await offers('PENDING');
    expect(nextBatch).toHaveLength(5);
    expect(nextBatch.map(item => item.sitterId)).not.toContain(target.sitterId);
  });
});
