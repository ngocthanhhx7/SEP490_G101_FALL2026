import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { userModel } from '../../src/models/user.model.js';
import { createSessionService } from '../../src/services/session.service.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MINUTE = 60000;
const LEAD_MESSAGE = 'Gửi yêu cầu trước giờ cũ ít nhất 24 giờ, cho giờ mới cách bây giờ ít nhất 2 giờ.';
const BASE = Date.parse('2030-01-02T00:00:00+07:00');
const oid = () => new mongoose.Types.ObjectId();
const iso = value => new Date(value).toISOString();
const staffPath = '/api/v1/staff/booking-change-requests';
const customerPath = bookingId => '/api/v1/bookings/' + bookingId;
let replica, connection, app, sessions, now, owner, other, staff, admin, sitter, replacement, command;
const col = name => connection.db.collection(name);
const headers = (session, key) => ({
  Host: '127.0.0.1', Origin: 'http://127.0.0.1', Cookie: 'pwc_session=' + session.token,
  'X-CSRF-Token': session.csrfToken, ...(key ? { 'Idempotency-Key': key } : {})
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  const env = {
    NODE_ENV: 'test', AUTH_ENABLED: 'true', BOOKING_CHECKOUT_ENABLED: 'true',
    EMPLOYEE_SCHEDULING_ENABLED: 'true', FINANCE_SOURCES_ENABLED: 'true', EMPLOYEE_DISPATCH_AGENT_ENABLED: 'true',
    SESSION_TOKEN_SECRET: 'a'.repeat(48), SESSION_CSRF_SECRET: 'b'.repeat(48), OTP_HMAC_SECRET: 'c'.repeat(48),
    CONTACT_LOOKUP_SECRET: 'd'.repeat(48), CONTACT_ENCRYPTION_KEY: 'e'.repeat(32),
    MONGO_URI: replica.getUri(), MONGO_DB: 'booking_change_test'
  };
  const config = loadConfig(env);
  connection = await mongoose.createConnection(env.MONGO_URI, { dbName: env.MONGO_DB }).asPromise();
  now = BASE;
  const clock = () => now;
  app = createApp({ config, connection, env, clock, lifecycle: { draining: false } });
  await provisionEmployeeScheduling(connection);
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  sessions = createSessionService({ connection, clock, tokenSecret: config.auth.tokenSecret, csrfSecret: config.auth.csrfSecret });
  async function login(displayName, role) {
    const user = await userModel(connection).create({ displayName, state: 'ACTIVE', roles: [role] });
    return connection.transaction(session => sessions.issueInTransaction(user, session));
  }
  owner = await login('Trần Thị Lan', 'CUSTOMER');
  other = await login('Khách khác', 'CUSTOMER');
  staff = await login('Đặng Thu Trang', 'STAFF');
  admin = await login('Quản trị kiểm thử', 'ADMIN');
  sitter = await login('Lê Văn Minh', 'PET_SITTER');
  replacement = await login('Trần Ngọc Mai', 'PET_SITTER');
  await col('sitterstatuses').insertMany([sitter, replacement].map(session => ({
    userId: new mongoose.Types.ObjectId(session.user.id), status: 'ACTIVE'
  })));
}, 180000);

beforeEach(async () => {
  now = BASE;
  command = 0;
  for (const name of ['bookingchangerequests', 'employeeschedulecommands', 'notifications', 'notificationevents', 'employeescheduleproposals',
    'employeevisitoffers', 'bookings', 'visits', 'pets', 'employmentcontracts', 'employeeavailabilities',
    'employeeavailabilityrevisions', 'aisitterprofiles']) await col(name).deleteMany({});
});

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

async function booking(starts, { assigned = false, state = 'ASSIGNED', boarding = false } = {}) {
  const _id = oid(), petId = oid(), serviceId = oid(), addressId = oid();
  const customerId = new mongoose.Types.ObjectId(owner.user.id);
  const sitterId = assigned ? new mongoose.Types.ObjectId(sitter.user.id) : null;
  await col('pets').insertOne({ _id: petId, ownerId: customerId, state: 'ACTIVE', version: 0 });
  const visits = starts.map((start, sequence) => ({
    _id: oid(), bookingId: _id, customerId, petIds: [petId], serviceId, addressId, sequence,
    customerVisitId: String(oid()), location: 'HOME', areaCode: 'DISTRICT_DONG_DA',
    state: assigned ? 'ASSIGNED' : 'SCHEDULED', sitterId, version: 0,
    startAt: new Date(start), endAt: new Date(start + HOUR / 2),
    snapshots: { baseVnd: 90000, surchargeVnd: 0, employeeServiceNetVnd: 60000, serviceName: 'Dắt chó đi dạo', boarding,
      point: { type: 'Point', coordinates: [105.82, 21.02] },
      pets: [{ id: String(petId), name: 'Milo', species: 'DOG', weightKg: 8, traits: [] }] }
  }));
  await col('bookings').insertOne({ _id, customerId, state, version: 0, carePlanState: 'APPROVED',
    bookingCode: 'BK-0042', paymentMode: 'POSTPAY', paymentState: 'UNPAID',
    paymentSnapshot: { amountVnd: starts.length * 90000, currency: 'VND' }, visitIds: visits.map(visit => visit._id) });
  await col('visits').insertMany(visits);
  return { _id, visits, petId, serviceId };
}

async function readySitter(serviceId, windows = [{ weekday: 3, startLocalTime: '06:30', endLocalTime: '19:00' }], session = sitter) {
  const userId = new mongoose.Types.ObjectId(session.user.id);
  await col('employmentcontracts').insertOne({ employeeId: userId, employmentType: 'PART_TIME',
    signedAt: new Date(BASE - DAY), effectiveAt: new Date(BASE - DAY), weeklyMinutes: 2400, version: 1 });
  await col('employeeavailabilities').insertOne({ _id: String(userId), state: 'ACTIVE', version: 1,
    areas: ['DISTRICT_DONG_DA'], workingWindows: windows, dayOffDates: [] });
  await col('employeeavailabilityrevisions').insertOne({ sitterId: String(userId), version: 1,
    effectiveFrom: '2029-01-01', workingWindows: windows });
  await col('aisitterprofiles').insertOne({ userId, active: true, serviceIds: [serviceId],
    species: ['DOG'], maxPets: 2, maxWeightKg: 20, allowedTraits: [],
    starts: [{ localDate: '2030-01-03', availableFrom: new Date(BASE + DAY + 6 * HOUR),
      availableUntil: new Date(BASE + DAY + 19 * HOUR), point: { type: 'Point', coordinates: [105.82, 21.02] } }]
  });
}

async function refreshStaff() {
  const user = await userModel(connection).findById(staff.user.id);
  staff = await connection.transaction(session => sessions.issueInTransaction(user, session));
}

const single = (visit, start) => ({ scope: 'VISIT', visitId: String(visit._id), startAt: iso(start) });
const whole = (firstDay, ...times) => ({ scope: 'BOOKING', firstDay, times });
function submit(record, body, session = owner, key = 'create-booking-change-' + ++command) {
  return request(app).post(customerPath(record._id) + '/change-requests').set(headers(session, key)).send(body);
}
function decision(change, action = 'APPROVE', session = staff, key = 'decide-booking-change-' + ++command) {
  return request(app).post(staffPath + '/' + change.id + '/decision').set(headers(session, key))
    .send({ action, expectedVersion: change.version });
}
const detail = change => request(app).get(staffPath + '/' + change.id).set(headers(staff));
const errorCode = response => response.body.error.code;

describe('UC-84 customer requests', () => {
  test('provisions one new collection and uses an indexed unique pending-visit claim', async () => {
    const names = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(row => row.name);
    expect(names.filter(name => name.startsWith('bookingchange'))).toEqual(['bookingchangerequests']);
    const record = await booking([BASE + DAY]);
    const change = (await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(201)).body.data;
    const saved = await col('bookingchangerequests').findOne({ _id: new mongoose.Types.ObjectId(change.id) });
    expect(saved.pendingVisitIds).toEqual([String(record.visits[0]._id)]);
    await expect(col('bookingchangerequests').insertOne({ ...saved, _id: oid() })).rejects.toMatchObject({ code: 11000 });
    const plan = await col('bookingchangerequests').find({ state: 'PENDING', pendingVisitIds: { $in: saved.pendingVisitIds } })
      .limit(1).explain('executionStats');
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('pendingVisitIds_1');
    await decision(change, 'REJECT').expect(200);
    expect(await col('bookingchangerequests').findOne({ _id: saved._id })).toMatchObject({ pendingVisitIds: [] });
    await submit(record, single(record.visits[0], BASE + 3 * DAY)).expect(201);
  });

  test('serializes concurrent submissions without a separate claim collection', async () => {
    const record = await booking([BASE + DAY]);
    const responses = await Promise.all([
      submit(record, single(record.visits[0], BASE + 2 * DAY), owner, 'concurrent-change-one'),
      submit(record, single(record.visits[0], BASE + 3 * DAY), owner, 'concurrent-change-two')
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409).body.error.code).toBe('MSG149');
    expect(await col('bookingchangerequests').countDocuments({ state: 'PENDING' })).toBe(1);
  });

  test('rolls back decision, visit, claim and shared command when notification persistence fails', async () => {
    const record = await booking([BASE + DAY]);
    const change = (await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(201)).body.data;
    const prototype = Object.getPrototypeOf(col('notifications'));
    const original = prototype.updateOne;
    const failure = jest.spyOn(prototype, 'updateOne').mockImplementation(function (...args) {
      if (this.collectionName === 'notifications') throw new Error('synthetic notification storage failure');
      return original.apply(this, args);
    });
    try { await decision(change, 'APPROVE', staff, 'notification-atomic-retry').expect(500); }
    finally { failure.mockRestore(); }
    expect(await col('bookingchangerequests').findOne({ _id: new mongoose.Types.ObjectId(change.id) }))
      .toMatchObject({ state: 'PENDING', pendingVisitIds: [String(record.visits[0]._id)] });
    expect(await col('visits').findOne({ _id: record.visits[0]._id })).toMatchObject({ startAt: record.visits[0].startAt, version: 0 });
    expect(await col('employeeschedulecommands').countDocuments({})).toBe(1);
    expect(await col('notifications').countDocuments({})).toBe(0);
    const result = await decision(change, 'APPROVE', staff, 'notification-atomic-retry').expect(200);
    expect((await decision(change, 'APPROVE', staff, 'notification-atomic-retry').expect(200)).body.data).toEqual(result.body.data);
    expect(await col('notifications').countDocuments({ eventType: 'BookingChangeApproved' })).toBe(1);
  });

  test('requires owner session and CSRF, and rejects non-customer callers', async () => {
    const record = await booking([BASE + DAY]);
    const payload = single(record.visits[0], BASE + 2 * DAY);
    await request(app).post(customerPath(record._id) + '/change-requests').send(payload).expect(401);
    await submit(record, payload, other).expect(404);
    await submit(record, payload, staff).expect(403);
    await request(app).post(customerPath(record._id) + '/change-requests')
      .set({ ...headers(owner, 'csrf-failure-test'), 'X-CSRF-Token': 'invalid' }).send(payload).expect(403);
  });

  test.each([
    [DAY, 2 * HOUR, 201],
    [DAY + MINUTE, 2 * HOUR, 201],
    [DAY - MINUTE, 3 * HOUR, 422],
    [23 * HOUR, 3 * HOUR, 422],
    [25 * HOUR, 2 * HOUR, 201],
    [25 * HOUR, 2 * HOUR - MINUTE, 422]
  ])('checks the old and new minimum lead times (%d, %d)', async (oldOffset, newOffset, status) => {
    const record = await booking([BASE + oldOffset]);
    const res = await submit(record, single(record.visits[0], BASE + newOffset)).expect(status);
    if (status === 422) expect(res.body.error).toMatchObject({ code: 'MSG54', message: LEAD_MESSAGE });
    else expect(res.body.data).toMatchObject({ state: 'PENDING', messageCode: 'MSG53' });
    expect((await col('visits').findOne({ _id: record.visits[0]._id })).startAt).toEqual(record.visits[0].startAt);
  });

  test.each([
    { label: '23 hours 59 minutes', lead: DAY - MINUTE, keepsOldTime: true },
    { label: '24 hours', lead: DAY, keepsOldTime: false }
  ])('whole booking handles a visit with $label of notice through approval', async ({ lead, keepsOldTime }) => {
    const record = await booking([BASE + lead, BASE + 2 * DAY + 8 * HOUR]);
    const [firstVisit, secondVisit] = record.visits;
    const firstId = String(firstVisit._id), secondId = String(secondVisit._id);
    const options = (await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200)).body.data;
    expect(options).toMatchObject({ canChangeBooking: true, slotNumbers: [1] });
    expect(options.visits).toMatchObject([
      { id: firstId, canSelect: !keepsOldTime, keepsOldTime },
      { id: secondId, canSelect: true, keepsOldTime: false }
    ]);

    const change = (await submit(record, whole('2030-01-06', '08:00')).expect(201)).body.data;
    const moved = keepsOldTime ? [secondVisit] : [firstVisit, secondVisit];
    expect(change.keptVisitIds).toEqual(keepsOldTime ? [firstId] : []);
    expect(change.items.map(item => item.visitId)).toEqual(moved.map(visit => String(visit._id)));
    await decision(change).expect(200);

    for (const [index, visit] of moved.entries()) {
      const startAt = new Date(Date.parse('2030-01-06T08:00:00+07:00') + index * DAY);
      expect(await col('visits').findOne({ _id: visit._id })).toMatchObject({ startAt, version: 1 });
    }
    if (keepsOldTime) {
      expect(await col('visits').findOne({ _id: firstVisit._id })).toMatchObject({
        startAt: firstVisit.startAt, endAt: firstVisit.endAt, version: firstVisit.version
      });
    }
  });

  test('whole booking cannot be changed when every upcoming visit has less than 24 hours of notice', async () => {
    const record = await booking([BASE + DAY - MINUTE]);
    const options = (await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200)).body.data;
    expect(options).toMatchObject({
      canChangeBooking: false, unavailableReason: 'LEAD_TIME', slotNumbers: [], visits: [{ canSelect: false, keepsOldTime: true }]
    });
    const result = await submit(record, whole('2030-01-06', '08:00')).expect(422);
    expect(result.body.error).toMatchObject({ code: 'MSG54', message: LEAD_MESSAGE });
  });

  test('whole booking keeps the near visit and preserves the second slot of its day', async () => {
    const record = await booking([BASE + DAY + 7 * HOUR, BASE + DAY + 17 * HOUR, BASE + 2 * DAY + 7 * HOUR]);
    now = BASE + 16 * HOUR;
    const options = (await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200)).body.data;
    expect(options).toMatchObject({ canChangeBooking: true, slotNumbers: [1, 2] });
    expect(options.visits[0]).toMatchObject({ canSelect: false, keepsOldTime: true });
    const result = (await submit(record, whole('2030-01-04', '08:00', '18:00')).expect(201)).body.data;
    expect(result.items.map(item => item.newStartAt)).toEqual([
      iso(Date.parse('2030-01-04T18:00:00+07:00')), iso(Date.parse('2030-01-05T08:00:00+07:00'))
    ]);
    expect(result.keptVisitIds).toEqual([String(record.visits[0]._id)]);
  });

  test('an evening-only change exposes slot two and still checks the unchanged schedule', async () => {
    const record = await booking([BASE + DAY + 7 * HOUR, BASE + DAY + 17 * HOUR]);
    now = BASE + 16 * HOUR;
    const options = (await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200)).body.data;
    expect(options.slotNumbers).toEqual([2]);
    expect(errorCode(await submit(record, whole('2030-02-03', '18:00')).expect(422))).toBe('MSG20');
    const accepted = (await submit(record, whole('2030-01-03', '18:00')).expect(201)).body.data;
    expect(accepted.items[0]).toMatchObject({ visitId: String(record.visits[1]._id), newStartAt: iso(BASE + DAY + 18 * HOUR) });
  });

  test('hides change options for boarding, near-only bookings, and unconfirmed payments', async () => {
    for (const record of [await booking([BASE + HOUR]), await booking([BASE + DAY], { boarding: true }),
      await booking([BASE + DAY], { state: 'AWAITING_PAYMENT' })]) {
      const response = await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200);
      expect(response.body.data.canChangeBooking).toBe(false);
    }
  });

  test('rejects overlap with another pending request in both scopes and replays an identical key', async () => {
    const record = await booking([BASE + DAY, BASE + 2 * DAY]);
    const payload = single(record.visits[0], BASE + 3 * DAY), key = 'replay-same-booking-change';
    const first = (await submit(record, payload, owner, key).expect(201)).body.data;
    const options = (await request(app).get(customerPath(record._id) + '/change-options').set(headers(owner)).expect(200)).body.data;
    expect(options.visits).toMatchObject([
      { id: String(record.visits[0]._id), pendingChange: true },
      { id: String(record.visits[1]._id), pendingChange: false }
    ]);
    const replay = (await submit(record, payload, owner, key).expect(201)).body.data;
    expect(replay).toEqual(first);
    expect(errorCode(await submit(record, whole('2030-01-06', '09:00')).expect(409))).toBe('MSG149');
    expect(errorCode(await submit(record, payload).expect(409))).toBe('MSG149');
  });

  test('blocks an active Staff proposal and ignores an expired proposal', async () => {
    const record = await booking([BASE + DAY]);
    const { insertedId } = await col('employeescheduleproposals').insertOne({
      visitId: String(record.visits[0]._id), state: 'PENDING_CUSTOMER_CONFIRMATION', visitVersion: 0, expiresAt: new Date(BASE + DAY)
    });
    const payload = single(record.visits[0], BASE + 2 * DAY);
    const staffProposalError = {
      code: 'BOOKING_CHANGE_STAFF_PROPOSAL_PENDING',
      message: 'Buổi này đang có đề xuất đổi giờ của nhân viên chờ bạn xác nhận.'
    };
    for (const input of [payload, whole('2030-01-05', '09:00')]) {
      const response = await submit(record, input).expect(409);
      expect(response.body.error).toMatchObject(staffProposalError);
    }
    await col('employeescheduleproposals').updateOne({ _id: insertedId }, { $set: { expiresAt: new Date(BASE) } });
    await submit(record, payload).expect(201);
    await col('employeescheduleproposals').updateOne({ _id: insertedId }, { $set: { expiresAt: new Date(BASE + DAY) } });
    const overlapping = await submit(record, payload).expect(409);
    expect(overlapping.body.error).toMatchObject(staffProposalError);
  });

  test('checks POSTPAY active states and verifies a PREPAY receipt before allowing a request', async () => {
    for (const state of ['DISPATCH_PENDING', 'ASSIGNED', 'IN_PROGRESS']) {
      const record = await booking([BASE + DAY], { state });
      await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(201);
    }
    const record = await booking([BASE + DAY]);
    await col('bookings').updateOne({ _id: record._id }, { $set: { paymentMode: 'PREPAY', paymentState: 'PAID' } });
    await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(409);
    await col('payments').insertOne({ bookingId: record._id, state: 'VERIFIED', receiptMoney: { amountVnd: 90000, currency: 'VND' } });
    await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(201);
  });

  test.each([
    [[DAY, 2 * DAY], 33 * DAY, 'MSG20'],
    [[DAY, 2 * DAY, 2 * DAY + HOUR], 2 * DAY + 2 * HOUR, 'MSG150'],
    [[DAY, 2 * DAY], 2 * DAY + 15 * 60000, 'MSG148']
  ])('rejects an invalid resulting schedule with %s', async (offsets, newOffset, code) => {
    const record = await booking(offsets.map(offset => BASE + offset));
    expect(errorCode(await submit(record, single(record.visits[0], BASE + newOffset)).expect(422))).toBe(code);
  });

  test('allows an exact end-to-start boundary, up to two visits per day and a 30-day span', async () => {
    const record = await booking([BASE + DAY, BASE + 2 * DAY, BASE + 31 * DAY]);
    await submit(record, single(record.visits[1], BASE + DAY + HOUR / 2)).expect(201);
    const tooLong = await booking([BASE + DAY, BASE + 2 * DAY]);
    await submit(tooLong, single(tooLong.visits[1], BASE + 31 * DAY)).expect(201);
    const thirtyOne = await booking([BASE + DAY, BASE + 2 * DAY]);
    expect(errorCode(await submit(thirtyOne, single(thirtyOne.visits[1], BASE + 32 * DAY)).expect(422))).toBe('MSG20');
  });

  test('checks pet collisions across bookings and accepts a boundary that only touches', async () => {
    const record = await booking([BASE + DAY]);
    await col('visits').insertOne({ bookingId: oid(), state: 'SCHEDULED', petIds: [String(record.petId)],
      startAt: new Date(BASE + 2 * DAY), endAt: new Date(BASE + 2 * DAY + HOUR) });
    const response = await submit(record, single(record.visits[0], BASE + 2 * DAY)).expect(422);
    expect(response.body.error).toMatchObject({ code: 'MSG68', pet: 'Milo' });
    await submit(record, single(record.visits[0], BASE + 2 * DAY + HOUR)).expect(201);
  });
});

describe('UC-85 decisions and expiry', () => {
  test('approves a request sent at 25 hours when 20 hours remain, retaining a free sitter and prices', async () => {
    const record = await booking([BASE + 25 * HOUR], { assigned: true });
    await readySitter(record.serviceId, [{ weekday: 4, startLocalTime: '06:30', endLocalTime: '19:00' }]);
    const visit = record.visits[0], newStart = BASE + DAY + 8 * HOUR;
    // UC-41: recompute a retained replacement's previously stored exemption against the new schedule.
    await col('visits').updateOne({ _id: visit._id }, { $set: { handoverRequired: true, handoverAccepted: true,
      handoverLateCheckInExempt: true, assignedAt: new Date(BASE - 40 * MINUTE) } });
    const change = (await submit(record, single(visit, newStart)).expect(201)).body.data;
    now = BASE + 5 * HOUR;
    expect((await detail(change).expect(200)).body.data.items[0].availability).toBe('AVAILABLE');
    await decision(change, 'APPROVE', owner).expect(403);
    const results = await Promise.all([decision(change), decision(change, 'APPROVE', admin)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 200).body.data).toMatchObject({ state: 'APPROVED', messageCode: 'MSG126' });
    const moved = await col('visits').findOne({ _id: visit._id });
    expect(moved).toMatchObject({ state: 'ASSIGNED', sitterId: visit.sitterId, snapshots: visit.snapshots,
      startAt: new Date(newStart), endAt: new Date(newStart + HOUR / 2), handoverAccepted: true, handoverLateCheckInExempt: false });
    expect((await col('bookings').findOne({ _id: record._id })).paymentSnapshot.amountVnd).toBe(90000);
    await app.locals.bookingChange.runBatch();
    expect(await col('notifications').countDocuments({ eventType: 'BookingChangeApproved' })).toBe(2);
    now = BASE;
    expect(errorCode(await submit(record, single(moved, BASE + 2 * DAY)).expect(409))).toBe('MSG55');
  });

  test('requeues a busy sitter, revokes old offers and flags the approved slot when fewer than five can be invited', async () => {
    const record = await booking([BASE + DAY], { assigned: true });
    await readySitter(record.serviceId);
    await readySitter(record.serviceId, [{ weekday: 4, startLocalTime: '06:30', endLocalTime: '19:00' }], replacement);
    const visit = record.visits[0], newStart = BASE + DAY + 8 * HOUR;
    const { insertedId } = await col('employeevisitoffers').insertOne({ visitId: visit._id, state: 'PENDING', version: 0 });
    const change = (await submit(record, single(visit, newStart)).expect(201)).body.data;
    expect((await detail(change).expect(200)).body.data.items[0].availability).toBe('BUSY');
    await decision(change, 'APPROVE', admin).expect(200);
    expect(await col('visits').findOne({ _id: visit._id })).toMatchObject({
      state: 'SCHEDULED', sitterId: null, startAt: new Date(newStart), handoverRequired: true,
      handoverNote: { reasonCode: 'BOOKING_RESCHEDULED', previousSitterId: visit.sitterId },
      dispatchReview: { code: 'INSUFFICIENT_DISPATCH_CANDIDATES' },
      dispatchRanking: { eligibleCount: 1, candidates: [{ sitterId: replacement.user.id }] }
    });
    expect(await col('employeevisitoffers').findOne({ _id: insertedId })).toMatchObject({ state: 'REVOKED' });
    expect(await col('employeevisitoffers').countDocuments({ visitId: visit._id, state: 'PENDING' })).toBe(0);
    expect(await col('bookings').findOne({ _id: record._id })).toMatchObject({ state: 'DISPATCH_PENDING' });
  });

  test('checks the new work together and excludes the sitter’s superseded times', async () => {
    const record = await booking([BASE + DAY + 8 * HOUR, BASE + DAY + 9 * HOUR], { assigned: true });
    await readySitter(record.serviceId, [{ weekday: 4, startLocalTime: '06:30', endLocalTime: '19:00' }]);
    const change = (await submit(record, whole('2030-01-03', '08:15', '09:15')).expect(201)).body.data;
    const preview = (await detail(change).expect(200)).body.data;
    expect(preview.items.map(item => item.availability)).toEqual(['AVAILABLE', 'AVAILABLE']);
    await decision(change).expect(200);
    expect(await col('visits').countDocuments({ bookingId: record._id, state: 'ASSIGNED' })).toBe(2);
  });

  test('lists waiting requests in deadline order with a scoped cursor', async () => {
    const late = await booking([BASE + 2 * DAY]);
    const early = await booking([BASE + 25 * HOUR]);
    const lateChange = (await submit(late, single(late.visits[0], BASE + 3 * DAY)).expect(201)).body.data;
    const earlyChange = (await submit(early, single(early.visits[0], BASE + DAY)).expect(201)).body.data;
    const read = query => request(app).get(staffPath).query(query).set(headers(staff));
    await request(app).get(staffPath).set(headers(owner)).expect(403);
    const first = (await read({ limit: 1 }).expect(200)).body.data;
    expect(first.items[0]).toMatchObject({ id: earlyChange.id, customerName: 'Trần Thị Lan' });
    const next = (await read({ limit: 1, cursor: first.nextCursor }).expect(200)).body.data;
    expect(next.items[0].id).toBe(lateChange.id);
    await read({ limit: 1, cursor: first.nextCursor, bookingId: String(late._id) }).expect(422);
  });

  test('serializes a competing pet reservation through the checkout booking guard', async () => {
    const record = await booking([BASE + DAY]), visit = record.visits[0], start = BASE + 2 * DAY;
    const change = (await submit(record, single(visit, start)).expect(201)).body.data;
    let entered, release;
    const hasGuard = new Promise(resolve => { entered = resolve; });
    const mayCommit = new Promise(resolve => { release = resolve; });
    const reservation = connection.transaction(async session => {
      await col('pets').updateOne({ _id: record.petId }, { $inc: { bookingGuard: 1 } }, { session });
      await col('visits').insertOne({ bookingId: oid(), petIds: [record.petId], state: 'SCHEDULED',
        startAt: new Date(start), endAt: new Date(start + HOUR) }, { session });
      entered();
      await mayCommit;
    });
    await hasGuard;
    const deciding = decision(change).then(response => response);
    release();
    const [response] = await Promise.all([deciding, reservation]);
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: 'MSG151', reasonCode: 'PET_OVERLAP' });
    expect(await col('visits').findOne({ _id: visit._id })).toMatchObject({ startAt: visit.startAt });
  });

  test('returns MSG151 for a new conflicting pet visit and preserves the old schedule', async () => {
    const record = await booking([BASE + DAY]), visit = record.visits[0], start = BASE + 2 * DAY;
    const change = (await submit(record, single(visit, start)).expect(201)).body.data;
    await col('visits').insertOne({ bookingId: oid(), petIds: [record.petId], state: 'ASSIGNED',
      startAt: new Date(start), endAt: new Date(start + HOUR) });
    expect((await decision(change).expect(422)).body.error).toMatchObject({ code: 'MSG151', reasonCode: 'PET_OVERLAP' });
    expect(await col('visits').findOne({ _id: visit._id })).toMatchObject({ startAt: visit.startAt, version: 0 });
    const rejected = (await decision(change, 'REJECT').expect(200)).body.data;
    expect(rejected).toMatchObject({ state: 'REJECTED', messageCode: 'MSG127' });
    await app.locals.bookingChange.runBatch();
    expect(await col('notifications').countDocuments({ recipientId: owner.user.id, eventType: 'BookingChangeRejected' })).toBe(1);
  });

  test('rejects stale visit versions with the Staff instruction', async () => {
    const record = await booking([BASE + DAY]), visit = record.visits[0];
    const change = (await submit(record, single(visit, BASE + 2 * DAY)).expect(201)).body.data;
    await col('visits').updateOne({ _id: visit._id }, { $inc: { version: 1 } });
    expect((await decision(change).expect(409)).body.error).toMatchObject({
      code: 'BOOKING_CHANGE_VISIT_CHANGED',
      message: 'Buổi đã thay đổi sau khi khách gửi yêu cầu. Vui lòng từ chối yêu cầu.'
    });
    await decision(change, 'REJECT').expect(200);
  });

  test.each([[25, 26], [30, 3]])('expires at six hours before the earliest old time regardless of new time (%d, %d)', async (oldHours, newHours) => {
    const record = await booking([BASE + oldHours * HOUR]);
    const change = (await submit(record, single(record.visits[0], BASE + newHours * HOUR)).expect(201)).body.data;
    const due = BASE + (oldHours - 6) * HOUR;
    expect(change.expiresAt).toBe(iso(due));
    now = due - 1;
    await refreshStaff();
    await app.locals.bookingChange.runBatch();
    expect((await detail(change).expect(200)).body.data.state).toBe('PENDING');
    now = due;
    await app.locals.bookingChange.runBatch();
    await app.locals.bookingChange.runBatch();
    expect((await detail(change).expect(200)).body.data.state).toBe('EXPIRED');
    expect(errorCode(await decision(change).expect(409))).toBe('BOOKING_CHANGE_NOT_PENDING');
    expect(await col('notifications').countDocuments({ eventType: 'BookingChangeExpired' })).toBe(1);
    expect(await col('visits').findOne({ _id: record.visits[0]._id })).toMatchObject({ startAt: record.visits[0].startAt });
  });

  test('ST-BKG-32 / GBR-19: Staff can approve a request moved to 3 hours from now, and approval rejects with MSG151 if under 2 hours remain', async () => {
    const record = await booking([BASE + 3 * DAY]);
    const visit = record.visits[0];
    const target = BASE + 3 * HOUR;
    const change = (await submit(record, single(visit, target)).expect(201)).body.data;
    expect(change.expiresAt).toBe(iso(BASE + 3 * DAY - 6 * HOUR));
    await decision(change).expect(200);
    expect(await col('visits').findOne({ _id: visit._id })).toMatchObject({ startAt: new Date(target), version: 1 });

    // Second booking: send at 3 hours ahead, then advance clock so < 2 hours remain at Staff approval.
    const lateRecord = await booking([BASE + 3 * DAY]);
    const lateVisit = lateRecord.visits[0];
    const lateChange = (await submit(lateRecord, single(lateVisit, BASE + 3 * HOUR)).expect(201)).body.data;
    now = BASE + HOUR + MINUTE;
    await refreshStaff();
    const refused = await decision(lateChange).expect(422);
    expect(refused.body.error).toMatchObject({
      code: 'MSG151',
      reasonCode: 'NEW_TIME_TOO_SOON',
      reason: 'giờ mới không còn cách hiện tại ít nhất 2 giờ'
    });
    expect(await col('visits').findOne({ _id: lateVisit._id })).toMatchObject({ startAt: lateVisit.startAt, version: 0 });
  });

  test('removes cancelled visits, recalculates the earliest deadline and closes when none remain', async () => {
    const record = await booking([BASE + DAY, BASE + 2 * DAY]);
    const change = (await submit(record, whole('2030-01-05', '10:00')).expect(201)).body.data;
    expect(change.expiresAt).toBe(iso(BASE + DAY - 6 * HOUR));
    await col('visits').updateOne({ _id: record.visits[0]._id }, { $set: { state: 'CANCELLED' } });
    now = BASE + 19 * HOUR;
    await refreshStaff();
    const current = (await detail(change).expect(200)).body.data;
    expect(current).toMatchObject({ state: 'PENDING', expiresAt: iso(BASE + 2 * DAY - 6 * HOUR) });
    expect(current.items).toHaveLength(1);
    await col('visits').updateOne({ _id: record.visits[1]._id }, { $set: { state: 'CANCELLED' } });
    now += 60000;
    await app.locals.bookingChange.runBatch();
    expect(await col('bookingchangerequests').findOne({ _id: new mongoose.Types.ObjectId(change.id) })).toMatchObject({ state: 'CLOSED' });
    expect((await detail(change).expect(200)).body.data.state).toBe('CLOSED');
    expect(await col('notifications').countDocuments({})).toBe(0);
  });
});


test('approved rescheduling preserves workflow definition, per-pet progress and prior evidence references', async () => {
  const { serviceWorkflowDrafts } = await import('../../src/constants/service-workflow-drafts.js');
  const { workflowHash } = await import('../../src/services/care/workflow-snapshot.service.js');
  const record = await booking([BASE + DAY + 9 * HOUR]);
  const definition = serviceWorkflowDrafts.find(item => item.code === 'home-care').definition;
  const workflow = { revision: 2, definition, hash: workflowHash(definition), publishedAt: new Date(BASE - DAY) };
  const results = [{ taskKey: `arrival:${record.petId}`, status: 'IN_PROGRESS', note: 'Existing synthetic care observation', evidence: [{ mediaId: 'a'.repeat(64), photoSlotId: 'condition', uploadedBy: sitter.user.id }] }];
  await col('visits').updateOne({ _id: record.visits[0]._id }, { $set: { 'snapshots.workflow': workflow, workflowResults: results } });
  const change = (await submit(record, single(record.visits[0], BASE + 2 * DAY + 10 * HOUR)).expect(201)).body.data;
  await decision(change).expect(200);
  const saved = await col('visits').findOne({ _id: record.visits[0]._id });
  expect(saved.startAt).toEqual(new Date(BASE + 2 * DAY + 10 * HOUR));
  expect(saved.snapshots.workflow).toEqual(workflow);
  expect(saved.workflowResults).toEqual(results);
});
