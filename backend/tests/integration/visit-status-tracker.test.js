import { afterAll, beforeAll, expect, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { customerReadRuntime } from '../../src/routes/customer-read-runtime.js';
import { errorHandler, notFound, requestId } from '../../src/middlewares/http.js';
import { financeSourceModels } from '../../src/models/finance-source.model.js';

const oid = () => new mongoose.Types.ObjectId();
const booking = oid(), owner = oid(), outsider = oid(), sitter = oid(), service = oid();
const active = oid(), scheduled = oid(), complete = oid(), cancelled = oid(), superseded = oid(), arrived = oid();
const at = hhmm => new Date('2026-11-04T' + hhmm + ':00+07:00');
const clock = () => +at('08:12');
let replica, connection, app;
const col = name => connection.db.collection(name);
const path = (visit = active, bookingId = booking) => '/api/v1/bookings/' + bookingId + '/visits/' + visit + '/tracker';
const read = (visit, actor = 'owner') => request(app).get(path(visit)).set('x-test-actor', actor);

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_visit_tracker' }).asPromise();
  const config = { auth: { enabled: true, tokenSecret: 'synthetic-visit-tracker-session-key' } };
  const sessionService = { verifyCsrf: async () => false, authenticate: async req => {
    const actor = req.get('x-test-actor');
    if (!actor) return null;
    return { userId: String(actor === 'owner' ? owner : outsider), roles: [actor === 'staff' ? 'STAFF' : 'CUSTOMER'],
      state: 'ACTIVE', expiresAt: clock() + 60000 };
  } };
  app = express();
  app.use(requestId);
  app.use('/api/v1', customerReadRuntime({ config, connection, sessionService, clock,
    env: { BOOKING_CHECKOUT_ENABLED: 'true', EMPLOYEE_SCHEDULING_ENABLED: 'true', VISIT_TRAVEL_ENABLED: 'true', FINANCE_SOURCES_ENABLED: 'true' } }).router);
  app.use(notFound, errorHandler(() => {}));
  const ids = [scheduled, complete, active, cancelled, arrived];
  await col('bookings').insertOne({ _id: booking, customerId: owner, bookingCode: 'BK-0042',
    state: 'IN_PROGRESS', visitIds: ids });
  const base = { bookingId: booking, customerId: owner, serviceId: service, sitterId: sitter,
    startAt: at('07:00'), endAt: at('07:30'), version: 5,
    snapshots: { serviceName: 'Dắt chó đi dạo', serviceAddress: '12 Nguyễn Trãi', careMinutes: 30,
      pets: [{ name: 'Milo' }], point: { coordinates: [105, 21] }, care: { privateAccessNotes: 'SECRET_FIXTURE' } } };
  const execution = { assignedAt: at('06:30'), checkInAt: at('06:58'), checklist: [{ itemId: 'walk', status: 'DONE' }] };
  await col('visits').insertMany([
    { ...base, _id: active, state: 'IN_PROGRESS', ...execution, sequence: 2 },
    { ...base, _id: scheduled, state: 'SCHEDULED', sitterId: null, sequence: 0 },
    { ...base, _id: complete, state: 'COMPLETED', ...execution, checkOutAt: at('07:31'), sequence: 1 },
    { ...base, _id: cancelled, state: 'CANCELLED', sequence: 3 },
    { ...base, _id: arrived, state: 'IN_PROGRESS', assignedAt: at('06:30'), checkInAt: at('06:58'), checklist: [], sequence: 4 },
    { ...base, _id: superseded, state: 'SUPERSEDED' }
  ]);
  await col('bookings').updateOne({ _id: booking }, { $set: {
    'checkoutSnapshot.customerVisits': [{ _id: active, startAt: at('06:00'), endAt: at('06:30') }]
  } });
  await col('services').insertOne({ _id: service, code: 'dog-walking' });
  await col('users').insertOne({ _id: sitter, displayName: 'Lê Văn Minh' });
  await col('reviews').insertMany([
    { visitId: complete, sitterId: sitter, direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 5 },
    { visitId: oid(), sitterId: String(sitter), direction: 'CUSTOMER_TO_SITTER', state: 'PUBLISHED', rating: 4 },
    { visitId: oid(), sitterId: sitter, direction: 'CUSTOMER_TO_SITTER', state: 'DRAFT', rating: 1 }
  ]);
  const events = financeSourceModels(connection).FinanceSourceEvent.collection;
  const event = (id, resourceId, time, actorId = sitter) => ({ _id: id, type: 'VisitCHECKLIST',
    bookingId: String(booking), actorId: String(actorId), resourceId, at: at(time) });
  await events.insertMany([
    event('valid-first', active + ':3', '07:03'), event('valid-second', active + ':4', '07:06'),
    event('future', active + ':2', '08:13'), event('wrong-sitter', active + ':2', '06:59', outsider),
    event('wrong-visit', scheduled + ':2', '06:59'), event('before-in', active + ':1', '06:57'),
    event('future-only', arrived + ':2', '08:13')
  ]);
}, 180000);

afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);

test('owner can read only the assigned active sitter approved bio and areas; re-review hides them', async () => {
  await col('users').updateOne({ _id: sitter }, { $set: { roles: ['PET_SITTER'], state: 'ACTIVE' } });
  await col('sitterstatuses').insertOne({ userId: sitter, status: 'ACTIVE' });
  await col('sitterpublicprofiles').insertOne({ userId: sitter, state: 'APPROVED', bio: 'Approved bio', areas: ['Hà Nội'], reason: 'INTERNAL_NOTE' });
  try {
    const res = await read(active).expect(200);
    expect(res.body.data.sitter.profile).toEqual({ bio: 'Approved bio', areas: ['Hà Nội'] });
    expect(res.body.data.actions.profile).toBe(true);
    expect(res.text).not.toContain('INTERNAL_NOTE');
    await col('sitterpublicprofiles').updateOne({ userId: sitter }, { $set: { state: 'SUBMITTED' } });
    const pending = await read(active).expect(200);
    expect(pending.body.data.actions.profile).toBe(false);
    expect(pending.text).not.toContain('Approved bio');
  } finally {
    await col('sitterpublicprofiles').deleteOne({ userId: sitter });
  }
});

test('UC-78 owner reads live times, first matching checklist and newest updates with private caching', async () => {
  const response = await read(active).expect(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.headers.vary).toMatch(/Cookie/i);
  expect(response.body.data).toMatchObject({
    booking: { code: 'BK-0042', visitNumber: 3, visitCount: 5 },
    visit: { startAt: at('07:00').toISOString(), status: 'IN_PROGRESS' },
    sitter: { name: 'Lê Văn Minh', rating: 4.5 },
    actions: { profile: false, walkLocation: { eligible: true, available: true }, incident: true, careReport: false }
  });
  const { milestones, updates } = response.body.data;
  expect(milestones.map(row => row.at)).toEqual([at('06:30').toISOString(), at('06:58').toISOString(),
    at('07:03').toISOString(), null, null]);
  expect(updates.map(row => row.key)).toEqual(['IN_PROGRESS', 'ARRIVED', 'ASSIGNED']);
  expect(response.text).not.toMatch(/SECRET_FIXTURE|coordinates|actorId/);
});

test('UC-46 exposes the map only after dog walk check-in while travel is enabled', async () => {
  const homeCare = oid();
  await col('services').insertOne({ _id: homeCare, code: 'home-care' });
  await col('visits').updateOne({ _id: active }, { $set: { serviceId: homeCare } });
  try {
    const care = (await read(active).expect(200)).body.data.actions;
    expect(care).toMatchObject({ walkLocation: { eligible: false, available: false }, incident: false });
    const finished = (await read(complete).expect(200)).body.data.actions;
    expect(finished).toMatchObject({ walkLocation: { eligible: false, available: false }, incident: false });
  } finally {
    await col('visits').updateOne({ _id: active }, { $set: { serviceId: service } });
  }
});

test('UC-78 rejects unauthenticated, other actors, mismatched and superseded visits', async () => {
  await request(app).get(path()).expect(401);
  await read(active, 'other').expect(404);
  await read(active, 'staff').expect(404);
  await read(superseded).expect(404);
  await request(app).get(path(active, oid())).set('x-test-actor', 'owner').expect(404);
});

test('UC-78 reports waiting, arrived, ready report and cancelled without inventing timestamps', async () => {
  const waiting = (await read(scheduled).expect(200)).body.data;
  expect(waiting.visit.status).toBe('FINDING_SITTER');
  expect(waiting.milestones.every(row => row.at === null && !row.reached)).toBe(true);
  const checkedIn = (await read(arrived).expect(200)).body.data;
  expect(checkedIn.visit.status).toBe('ARRIVED');
  expect(checkedIn.milestones[2].at).toBeNull();
  const finished = (await read(complete).expect(200)).body.data;
  expect(finished.visit.status).toBe('REPORT_READY');
  expect(finished.milestones[2]).toMatchObject({ reached: true, at: null });
  expect(finished.milestones.slice(3).map(row => row.at)).toEqual([at('07:31').toISOString(), at('07:31').toISOString()]);
  expect(finished.updates.filter(row => row.at === at('07:31').toISOString())).toHaveLength(1);
  expect(finished.actions).toMatchObject({ careReport: true, walkLocation: { eligible: false, available: false } });
  const closed = (await read(cancelled).expect(200)).body.data;
  expect(closed.visit.status).toBe('CANCELLED');
  expect(closed.actions.careReport).toBe(false);
});

test('UC-78 walk eligibility starts at check-in and applies only to dog walking', async () => {
  expect((await read(scheduled).expect(200)).body.data.actions.walkLocation.eligible).toBe(false);
  const homeCare = oid();
  await col('services').insertOne({ _id: homeCare, code: 'home-care' });
  await col('visits').updateOne({ _id: arrived }, { $set: { serviceId: homeCare } });
  expect((await read(arrived).expect(200)).body.data.actions.walkLocation).toEqual({ eligible: false, available: false });
});

test('UC-78 keeps the care report available for a completed visit on an overdue booking', async () => {
  const bookingId = oid(), visitId = oid();
  const completedVisit = await col('visits').findOne({ _id: complete });
  await col('bookings').insertOne({ _id: bookingId, customerId: owner, state: 'OVERDUE', visitIds: [visitId] });
  await col('visits').insertOne({ ...completedVisit, _id: visitId, bookingId });

  const { data } = (await request(app).get(path(visitId, bookingId)).set('x-test-actor', 'owner').expect(200)).body;
  expect(data.visit).toMatchObject({ status: 'REPORT_READY', showProgress: true });
  expect(data.milestones.at(-1)).toMatchObject({ key: 'REPORT_READY', reached: true, at: at('07:31').toISOString() });
  expect(data.actions.careReport).toBe(true);
});

test('UC-78 offers the travel entry only inside the assigned pre-check-in window', async () => {
  const bookingId = oid(), visitId = oid();
  const source = await col('visits').findOne({ _id: active });
  await col('bookings').insertOne({ _id: bookingId, customerId: owner, state: 'ASSIGNED', visitIds: [visitId] });
  await col('visits').insertOne({ ...source, _id: visitId, bookingId, state: 'ASSIGNED',
    checkInAt: null, startAt: at('08:43'), endAt: at('09:15') });
  const get = () => request(app).get(path(visitId, bookingId)).set('x-test-actor', 'owner').expect(200);
  expect((await get()).body.data.actions.travel).toBeUndefined();
  await col('visits').updateOne({ _id: visitId }, { $set: { startAt: at('08:42') } });
  expect((await get()).body.data.actions.travel).toBe(true);
  await col('visits').updateOne({ _id: visitId }, { $set: { state: 'IN_PROGRESS', checkInAt: at('08:12') } });
  expect((await get()).body.data.actions.travel).toBeUndefined();
});

test('UC-78 shows customer-visible SOP photos during care and makes the report available at checkout', async () => {
  const bookingId = oid(), visitId = oid(), petId = String(oid());
  const source = await col('visits').findOne({ _id: arrived });
  const step = (stepId, customerVisible) => ({ stepId, title: stepId, phase: 'EXECUTION', scope: 'PER_PET',
    customerVisible, locations: ['HOME'], species: ['DOG'], photoSlots: [{ photoSlotId: 'proof', title: 'Ảnh SOP', maxPhotos: 1 }] });
  const result = (stepId, mediaId) => ({ taskKey: `${stepId}:${petId}`, status: 'COMPLETED', updatedAt: at('07:15'),
    evidence: [{ photoSlotId: 'proof', mediaId, uploadedBy: String(sitter) }] });
  const photo = 'a'.repeat(64), hidden = 'b'.repeat(64);
  await col('bookings').insertOne({ _id: bookingId, customerId: owner, state: 'IN_PROGRESS', visitIds: [visitId] });
  await col('visits').insertOne({ ...source, _id: visitId, bookingId, checklist: null, location: 'HOME',
    snapshots: { ...source.snapshots, pets: [{ id: petId, name: 'Milo', species: 'DOG' }], workflow: {
      definition: { title: 'SOP', steps: [step('feeding', true), step('internal', false)] }, revision: 2
    } }, workflowResults: [result('feeding', photo), result('internal', hidden)] });
  const get = actor => request(app).get(path(visitId, bookingId)).set('x-test-actor', actor);
  const activeRead = await get('owner').expect(200);
  expect(activeRead.body.data.visit.status).toBe('IN_PROGRESS');
  expect(activeRead.body.data.actions.careReport).toBe(false);
  expect(activeRead.body.data.careUpdates).toEqual([{ taskKey: `feeding:${petId}`, title: 'feeding', petName: 'Milo',
    status: 'COMPLETED', at: at('07:15').toISOString(), photos: [{ mediaId: photo, label: 'Ảnh SOP' }] }]);
  expect(activeRead.text).not.toContain(hidden);
  expect(activeRead.text).not.toContain('uploadedBy');
  await get('other').expect(404);
  await col('visits').updateOne({ _id: visitId }, { $set: { state: 'COMPLETED', checkOutAt: at('07:30') } });
  const done = (await get('owner').expect(200)).body.data;
  expect(done.visit.status).toBe('REPORT_READY');
  expect(done.actions.careReport).toBe(true);
  expect(done.careUpdates).toBeNull();
});
