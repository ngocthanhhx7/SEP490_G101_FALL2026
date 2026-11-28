import { afterAll, beforeAll, beforeEach, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/environment.js';
import { createSessionService } from '../../src/services/session.service.js';
import { userModel } from '../../src/models/user.model.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { workflowHash } from '../../src/services/care/workflow-snapshot.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { assertEmployeeSchedulingStorage } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { assertPayrollStorage } from '../../src/services/payroll/payroll-storage.service.js';

let replica;
let connection;
let app;
let nowMs;
let customerSession;
let otherCustomerSession;
let sitterSession;
let replacementSession;
let config;

const oid = () => new mongoose.Types.ObjectId();
const col = name => connection.db.collection(name);
const baseHeaders = { Host: '127.0.0.1', Origin: 'http://127.0.0.1' };
const authHeaders = (session, key) => ({
  ...baseHeaders,
  Cookie: `pwc_session=${session.token}`,
  'X-CSRF-Token': session.csrfToken,
  ...(key ? { 'Idempotency-Key': key } : {})
});

const env = {
  NODE_ENV: 'test',
  AUTH_ENABLED: 'true',
  BOOKING_CHECKOUT_ENABLED: 'true',
  EMPLOYEE_SCHEDULING_ENABLED: 'true',
  FINANCE_SOURCES_ENABLED: 'true',
  SESSION_TOKEN_SECRET: 'a'.repeat(48),
  SESSION_CSRF_SECRET: 'b'.repeat(48),
  OTP_HMAC_SECRET: 'c'.repeat(48),
  CONTACT_LOOKUP_SECRET: 'd'.repeat(48),
  CONTACT_ENCRYPTION_KEY: 'e'.repeat(32)
};

async function createActorSession(sessions, displayName, roles) {
  const user = await userModel(connection).create({ displayName, roles, state: 'ACTIVE' });
  if (roles.includes('PET_SITTER')) {
    const { SitterStatus } = sitterApplicationModels(connection);
    await SitterStatus.create({ userId: user._id, status: 'ACTIVE', changedAt: new Date(nowMs) });
  }
  return connection.transaction(session => sessions.issueInTransaction(user, session));
}

function makeVisit({ bookingId, customerId, sitterId = null, state = 'SCHEDULED', startAt, endAt, petId, handover = false }) {
  return {
    _id: oid(),
    bookingId,
    customerId,
    serviceId: oid(),
    petIds: [petId],
    sitterId,
    state,
    version: 0,
    sequence: 0,
    areaCode: 'DISTRICT_HAI_BA_TRUNG',
    location: 'HOME',
    startAt,
    endAt,
    checkInAt: null,
    checkOutAt: null,
    evidenceRefs: [],
    ...(handover ? {
      handoverRequired: true,
      handoverAccepted: false,
      assignedAt: new Date(nowMs - 10 * 60000),
      handoverNote: { reasonCode: 'REASSIGNED', reasonText: 'Đổi người chăm sóc', flaggedAt: new Date(nowMs - 15 * 60000) }
    } : {}),
    snapshots: {
      serviceName: 'Chăm sóc tại nhà',
      serviceScope: 'Cho ăn và vệ sinh cơ bản',
      serviceAddress: '12 Bà Triệu, Hà Nội',
      careMinutes: 60,
      baseVnd: 150000,
      surchargeVnd: 0,
      employeeServiceNetVnd: 150000,
      checklistItemIds: ['service-scope', 'pet-condition'],
      checklistItems: [
        { itemId: 'service-scope', label: 'Cho ăn và vệ sinh cơ bản' },
        { itemId: 'pet-condition', label: 'Ghi nhận tình trạng thú cưng sau chăm sóc' }
      ],
      care: {
        schemaVersion: 1,
        capturedAt: new Date(nowMs - 3600000),
        privateAccessNotes: 'Chìa khoá để trong hộp thư',
        pets: [{
          id: String(petId),
          name: 'Milo',
          species: 'DOG',
          weightKg: 8,
          ageMonths: 24,
          sex: 'MALE',
          traits: [],
          version: 1,
          careNeedsConfirmed: true,
          careProfile: {
            feeding: { status: 'KNOWN', value: 'Ăn hạt 2 lần/ngày' },
            medication: { status: 'KNOWN', value: 'Không dùng thuốc' },
            handling: { status: 'KNOWN', value: 'Thân thiện' }
          }
        }]
      },
      pets: [{ id: String(petId), name: 'Milo', species: 'DOG', weightKg: 8, traits: [], version: 1 }]
    }
  };
}

async function seedBookingWithVisits(visitSpecs) {
  const bookingId = oid();
  const petId = oid();
  const customerOid = new mongoose.Types.ObjectId(customerSession.user.id);
  const visits = visitSpecs.map((spec, index) => ({
    ...makeVisit({ bookingId, customerId: customerOid, petId, ...spec }),
    sequence: index
  }));
  const totalVnd = visits.length * 150000;
  const booking = {
    _id: bookingId,
    bookingCode: 'BK-CARE-001',
    customerId: customerOid,
    quoteId: oid(),
    quoteVersion: 1,
    originalVisitCount: visits.length,
    careVisitCount: visits.length,
    visitIds: visits.map(v => v._id),
    state: 'ASSIGNED',
    paymentMode: 'PREPAY',
    paymentState: 'PAID',
    paymentSnapshot: { amountVnd: totalVnd, currency: 'VND' },
    version: 0,
    financeGuardVersion: 0,
    carePlanState: 'APPROVED',
    createdAt: new Date(nowMs - 7200000),
    checkoutSnapshot: {
      consentAt: new Date(nowMs - 3600000),
      policyVersion: 'PWC-CHECKOUT-2026-10-30-v1',
      customerVisits: visits
    }
  };
  await col('bookings').insertOne(booking);
  await col('visits').insertMany(visits);
  await col('payments').insertOne({
    _id: oid(),
    bookingId,
    state: 'VERIFIED',
    receiptMoney: { currency: 'VND', amountVnd: totalVnd },
    verifiedAt: new Date(nowMs - 3500000)
  });
  return { booking, visits, petId: String(petId) };
}

async function seedWorkflow(visitId) {
  const definition = {
    title: 'Quy trình chăm sóc thử',
    steps: ['CHECK_IN', 'EXECUTION', 'CHECK_OUT'].map(phase => ({
      stepId: phase.toLowerCase(), title: 'Việc trong quy trình', phase, scope: 'PER_VISIT', species: [], locations: [],
      required: true, canSkip: false, photoSlots: []
    }))
  };
  await col('visits').updateOne({ _id: visitId }, { $set: {
    'snapshots.workflow': { definition, revision: 1, hash: workflowHash(definition) },
    workflowResults: definition.steps.map(step => ({ taskKey: `${step.stepId}:visit`, status: 'COMPLETED' }))
  } });
}

async function seedEvidence(sitterId, mediaId) {
  await col('privateimages').insertOne({
    _id: mediaId,
    ownerId: new mongoose.Types.ObjectId(sitterId),
    state: 'READY',
    contentDigest: 'f'.repeat(64),
    byteLength: 1024,
    contentType: 'image/jpeg'
  });
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  env.MONGO_URI = replica.getUri();
  env.MONGO_DB = 'visit_care_instructions_test';
  config = loadConfig(env);
  connection = await mongoose.createConnection(replica.getUri(), { dbName: env.MONGO_DB }).asPromise();
  nowMs = Date.parse('2026-11-27T03:00:00.000Z');
  app = createApp({ config, connection, env, clock: () => nowMs, lifecycle: { draining: false } });
  await provisionFinanceSources(connection);
  await assertEmployeeSchedulingStorage(connection);
  await assertPayrollStorage(connection);
  for (const model of Object.values(connection.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
  await col('privateimages').insertOne({ _id: 'sentinel' });
  await col('privateimages').deleteMany({});
  const sessions = createSessionService({
    connection,
    clock: () => nowMs,
    tokenSecret: config.auth.tokenSecret,
    csrfSecret: config.auth.csrfSecret
  });
  customerSession = await createActorSession(sessions, 'Khách Hàng Một', ['CUSTOMER']);
  otherCustomerSession = await createActorSession(sessions, 'Khách Hàng Hai', ['CUSTOMER']);
  sitterSession = await createActorSession(sessions, 'Sitter Một', ['PET_SITTER']);
  replacementSession = await createActorSession(sessions, 'Sitter Thay Thế', ['PET_SITTER']);
}, 180000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  nowMs = Date.parse('2026-11-27T03:00:00.000Z');
  for (const name of [
    'bookings', 'visits', 'payments', 'notifications', 'privateimages',
    'financesourcecommands', 'financesourceevents', 'caremediabindings',
    'employeeschedulecommands', 'employeescheduleevents'
  ]) {
    await col(name).deleteMany({});
  }
});

test.each(['legacy', 'versioned'])('ST-BKG-26 full flow: customer edits, sitter acknowledges and completes a %s visit', async mode => {
  const startAt = new Date(nowMs + 3 * 3600000);
  const endAt = new Date(nowMs + 4 * 3600000);
  const sitterOid = new mongoose.Types.ObjectId(sitterSession.user.id);
  const { booking, visits, petId } = await seedBookingWithVisits([
    { sitterId: sitterOid, state: 'ASSIGNED', startAt, endAt }
  ]);
  const visitId = String(visits[0]._id);

  const versioned = mode === 'versioned';
  if (versioned) await seedWorkflow(visits[0]._id);

  // Role/ownership guards
  await request(app).get(`/api/v1/checkout/bookings/${booking._id}/care-instructions`).set(authHeaders(otherCustomerSession)).expect(404);
  await request(app).get(`/api/v1/checkout/bookings/${booking._id}/care-instructions`).set(authHeaders(sitterSession)).expect(403);

  // Customer loads initial care instructions (v1 from pet profile)
  const initial = await request(app)
    .get(`/api/v1/checkout/bookings/${booking._id}/care-instructions`)
    .set(authHeaders(customerSession))
    .expect(200);
  expect(initial.body.data.visits).toHaveLength(1);
  expect(initial.body.data.visits[0]).toMatchObject({
    visitId,
    instructionVersion: 1,
    locked: false,
    cancelled: false,
    withinTwoHours: false
  });
  expect(initial.body.data.visits[0].pets[0].feeding).toBe('Ăn hạt 2 lần/ngày');

  // Customer updates feeding + adds custom required & optional tasks
  const updated = await request(app)
    .put(`/api/v1/checkout/bookings/${booking._id}/visits/${visitId}/care-instructions`)
    .set(authHeaders(customerSession))
    .send({
      expectedVersion: 0,
      pets: [{ petId, feeding: 'Trộn 1 thìa pate gà với hạt', medicine: 'Vitamin sáng (chỉ tham khảo)', behavior: 'Nhát người lạ' }],
      tasks: [
        { itemId: 'service-scope', label: 'Cho ăn và vệ sinh cơ bản', required: true },
        { itemId: 'pet-condition', label: 'Ghi nhận tình trạng thú cưng sau chăm sóc', required: true },
        { label: 'Chải lông nhẹ', required: true },
        { label: 'Chơi bóng 5 phút', required: false }
      ],
      homeAccessNote: 'Mật khẩu cửa mới 2468',
      applyToLater: false
    })
    .expect(200);
  expect(updated.body.data.visits[0]).toMatchObject({
    instructionVersion: 2,
    requiresAcknowledgement: true,
    acknowledgedAt: null
  });

  // Notification inbox of pet sitter loads cleanly without SENSITIVE_KEY errors
  const inbox = await request(app)
    .get('/api/v1/notifications')
    .set(authHeaders(sitterSession))
    .expect(200);
  const careNotif = inbox.body.data.items.find(item => item.eventType === 'CareInstructionsUpdated');
  expect(careNotif).toBeTruthy();
  expect(careNotif.deepLink).toBe(`/sitter/visits/${visitId}`);
  expect(careNotif.metadata).toMatchObject({ visitId, instructionVersion: 2 });

  // Advance clock to 20 minutes before visit start
  nowMs = startAt.getTime() - 20 * 60000;

  // Opening care page (GET) MUST NOT auto-acknowledge
  const careBefore = await request(app)
    .get(`/api/v1/employee-scheduling/visits/${visitId}/care`)
    .set(authHeaders(sitterSession))
    .expect(200);
  expect(careBefore.body.data.acknowledged).toBe(false);
  expect(careBefore.body.data.careInstructions).toMatchObject({
    version: 2,
    requiresAcknowledgement: true,
    acknowledgedAt: null
  });
  expect(careBefore.body.data.careInstructions.pets[0].feeding).toBe('Trộn 1 thìa pate gà với hạt');

  // Execution endpoint reports careInstructionsPendingAck: true
  const execBefore = await request(app)
    .get(`/api/v1/visits/${visitId}/execution`)
    .set(authHeaders(sitterSession))
    .expect(200);
  expect(execBefore.body.data.careInstructionsPendingAck).toBe(true);

  // Backend blocks check-in with CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED
  const checkInMedia = '1'.repeat(64);
  const checkOutMedia = '2'.repeat(64);
  await seedEvidence(sitterSession.user.id, checkInMedia);
  await seedEvidence(sitterSession.user.id, checkOutMedia);
  const blockedCheckIn = await request(app)
    .post(`/api/v1/visits/${visitId}/check-ins`)
    .set(authHeaders(sitterSession, 'checkin-blocked-01'))
    .send({ expectedVersion: execBefore.body.data.version, mediaId: checkInMedia })
    .expect(409);
  expect(blockedCheckIn.body.error.code).toBe('CARE_INSTRUCTIONS_NOT_ACKNOWLEDGED');

  // Sitter clicks "Tôi đã đọc bản mới" (acknowledge via assigned-care digest -> syncs acknowledgedInstructionVersion)
  const ackRes = await request(app)
    .post(`/api/v1/employee-scheduling/visits/${visitId}/care/acknowledgements`)
    .set(authHeaders(sitterSession, 'care-ack-v2-0001'))
    .send({ version: careBefore.body.data.version })
    .expect(200);
  expect(ackRes.body.data).toMatchObject({ acknowledged: true, instructionVersion: 2 });

  // Verify DB fields match both digest and numeric version
  const storedVisit = await col('visits').findOne({ _id: visits[0]._id });
  expect(storedVisit.currentInstructionVersion).toBe(2);
  expect(storedVisit.acknowledgedInstructionVersion).toBe(2);
  expect(storedVisit.careAcknowledgement?.version).toBe(careBefore.body.data.version);

  // Check-in now succeeds
  const execAfterAck = await request(app)
    .get(`/api/v1/visits/${visitId}/execution`)
    .set(authHeaders(sitterSession))
    .expect(200);
  expect(execAfterAck.body.data.careInstructionsPendingAck).toBe(false);

  const checkedIn = await request(app)
    .post(`/api/v1/visits/${visitId}/check-ins`)
    .set(authHeaders(sitterSession, 'checkin-allowed-01'))
    .send({ expectedVersion: execAfterAck.body.data.version, mediaId: checkInMedia })
    .expect(200);
  expect(checkedIn.body.data.state).toBe('IN_PROGRESS');

  // Once checked in, customer cannot edit that visit anymore
  await request(app)
    .put(`/api/v1/checkout/bookings/${booking._id}/visits/${visitId}/care-instructions`)
    .set(authHeaders(customerSession))
    .send({
      expectedVersion: checkedIn.body.data.version,
      pets: [{ petId, feeding: 'Đổi sau check-in', medicine: '', behavior: '' }],
      tasks: [
        { itemId: 'service-scope', label: 'Cho ăn và vệ sinh cơ bản', required: true },
        { itemId: 'pet-condition', label: 'Ghi nhận tình trạng thú cưng sau chăm sóc', required: true }
      ],
      homeAccessNote: '',
      applyToLater: false
    })
    .expect(409);

  // Checklist requires service-scope, pet-condition, and required custom task (optional task may be omitted)
  const requiredCustom = execAfterAck.body.data.checklistItems.find(item => item.label === 'Chải lông nhẹ');
  expect(requiredCustom.required).toBe(true);
  const optionalCustom = execAfterAck.body.data.checklistItems.find(item => item.label === 'Chơi bóng 5 phút');
  expect(optionalCustom.required).toBe(false);

  const defaults = versioned ? [] : ['service-scope', 'pet-condition'].map(itemId => ({ itemId, status: 'DONE' }));
  if (versioned) {
    expect(execAfterAck.body.data.workflow).toMatchObject({ mode: 'VERSIONED', completed: 3 });
    expect(execAfterAck.body.data.checklistItemIds).toEqual([requiredCustom.itemId]);
  }

  // An optional completed item cannot satisfy the missing required task.
  const partial = await request(app)
    .patch(`/api/v1/visits/${visitId}/checklists`)
    .set(authHeaders(sitterSession, 'checklist-partial-01'))
    .send({
      expectedVersion: checkedIn.body.data.version,
      items: [...defaults, { itemId: optionalCustom.itemId, status: 'DONE' }]
    })
    .expect(200);
  let versionAfterNote = partial.body.data.version;
  if (versioned) {
    const note = await request(app).patch(`/api/v1/visits/${visitId}/checklists`)
      .set(authHeaders(sitterSession, 'synthetic-versioned-care-note'))
      .send({ expectedVersion: versionAfterNote, customerNote: 'Milo đã uống nước.' }).expect(200);
    versionAfterNote = note.body.data.version;
    const progress = await request(app).get(`/api/v1/visits/${visitId}/execution`)
      .set(authHeaders(sitterSession)).expect(200);
    expect(progress.body.data).toMatchObject({ customerNote: 'Milo đã uống nước.',
      checklist: [{ itemId: optionalCustom.itemId, status: 'DONE' }] });
  }
  const blocked = await request(app)
    .post(`/api/v1/visits/${visitId}/check-outs`)
    .set(authHeaders(sitterSession, 'checkout-blocked-01'))
    .send({ expectedVersion: versionAfterNote, mediaId: checkOutMedia })
    .expect(409);
  expect(blocked.body.error.code).toBe('CHECKLIST_REQUIRED');

  const savedChecklist = await request(app)
    .patch(`/api/v1/visits/${visitId}/checklists`)
    .set(authHeaders(sitterSession, 'checklist-complete-01'))
    .send({
      expectedVersion: versionAfterNote,
      items: [...defaults, { itemId: requiredCustom.itemId, status: 'DONE' }],
      ...(versioned ? {} : { customerNote: 'Milo đã uống nước.' })
    })
    .expect(200);

  if (versioned) {
    const progress = await request(app).get(`/api/v1/visits/${visitId}/execution`)
      .set(authHeaders(sitterSession)).expect(200);
    expect(progress.body.data).toMatchObject({ customerNote: 'Milo đã uống nước.',
      checklist: [{ itemId: requiredCustom.itemId, status: 'DONE' }] });
  }

  const checkedOut = await request(app)
    .post(`/api/v1/visits/${visitId}/check-outs`)
    .set(authHeaders(sitterSession, 'checkout-ok-01'))
    .send({ expectedVersion: savedChecklist.body.data.version, mediaId: checkOutMedia })
    .expect(200);
  expect(checkedOut.body.data.state).toBe('COMPLETED');
});

test('bulk care instructions reject a stale target and require confirmation when the cutoff changes', async () => {
  const start = new Date(nowMs + 3 * 3600000);
  const later = new Date(nowMs + 24 * 3600000);
  const { booking, visits } = await seedBookingWithVisits([
    { startAt: start, endAt: new Date(+start + 3600000) },
    { startAt: later, endAt: new Date(+later + 3600000) }
  ]);
  const [firstId, laterId] = visits.map(row => String(row._id));
  const put = (id, body) => request(app)
    .put(`/api/v1/checkout/bookings/${booking._id}/visits/${id}/care-instructions`)
    .set(authHeaders(customerSession)).send({ expectedVersion: 0, pets: [], tasks: [], ...body });

  await put(laterId, { tasks: [{ label: 'Việc riêng của buổi sau', required: true }] }).expect(200);
  const outdated = await put(firstId, {
    applyToLater: true, targetVersions: [{ visitId: laterId, version: 0 }]
  }).expect(409);
  expect(outdated.body.error.code).toBe('VERSION_CONFLICT');
  expect((await col('visits').findOne({ _id: visits[1]._id })).careInstructions.tasks)
    .toContainEqual(expect.objectContaining({ label: 'Việc riêng của buổi sau' }));

  nowMs += 3600000 + 1;
  const payload = {
    applyToLater: true, targetVersions: [{ visitId: laterId, version: 1 }],
    tasks: [{ label: 'Đã xác nhận phạm vi mới', required: true }]
  };
  const crossesCutoff = await put(firstId, payload).expect(409);
  expect(crossesCutoff.body.error.code).toBe('CARE_INSTRUCTIONS_SCOPE_CHANGED');
  expect((await col('visits').findOne({ _id: visits[1]._id })).version).toBe(1);
  const confirmed = await put(firstId, { ...payload, applyFromNextVisit: true }).expect(200);
  expect(confirmed.body.data.updatedVisitIds).toEqual([laterId]);
  expect((await col('visits').findOne({ _id: visits[0]._id })).version).toBe(0);
});

test('applies customer tasks across services while preserving each visit’s locked task labels', async () => {
  const firstStart = new Date(nowMs + 3 * 3600000), laterStart = new Date(nowMs + 24 * 3600000);
  const { booking, visits } = await seedBookingWithVisits([
    { startAt: firstStart, endAt: new Date(+firstStart + 3600000) },
    { startAt: laterStart, endAt: new Date(+laterStart + 3600000) }
  ]);
  const [first, later] = visits;
  const tasks = label => [{ itemId: 'service-scope', label, required: true },
    { itemId: 'pet-condition', label: 'Ghi nhận tình trạng', required: true }];
  await col('visits').updateOne({ _id: first._id }, { $set: {
    'snapshots.serviceName': 'Dắt chó đi dạo', 'snapshots.checklistItems': tasks('Dắt chó đi dạo')
  } });
  await col('visits').updateOne({ _id: later._id }, { $set: {
    'snapshots.serviceName': 'Cho ăn tại nhà', 'snapshots.checklistItems': tasks('Cho ăn tại nhà')
  } });
  const updated = await request(app).put(`/api/v1/checkout/bookings/${booking._id}/visits/${first._id}/care-instructions`)
    .set(authHeaders(customerSession)).send({
      expectedVersion: 0, applyToLater: true, targetVersions: [{ visitId: String(later._id), version: 0 }],
      pets: [], tasks: [...tasks('Dắt chó đi dạo'), { label: 'Thay nước sạch', required: true }]
    }).expect(200);
  expect(updated.body.data.visits[0].tasks[0].label).toBe('Dắt chó đi dạo');
  expect(updated.body.data.visits[1]).toMatchObject({ serviceName: 'Cho ăn tại nhà' });
  expect(updated.body.data.visits[1].tasks[0]).toMatchObject({ itemId: 'service-scope', label: 'Cho ăn tại nhà', locked: true });
  expect(updated.body.data.visits[1].tasks).toContainEqual(expect.objectContaining({ label: 'Thay nước sạch' }));
});

test('a replacement sitter sees updated customer tasks before acknowledging a versioned handover', async () => {
  const startAt = new Date(nowMs + 3 * 3600000);
  const { booking, visits } = await seedBookingWithVisits([{
    state: 'ASSIGNED', sitterId: new mongoose.Types.ObjectId(sitterSession.user.id), startAt, endAt: new Date(+startAt + 3600000)
  }]);
  const visit = visits[0], root = `/api/v1/employee-scheduling/visits/${visit._id}`;
  await seedWorkflow(visit._id);
  await request(app).put(`/api/v1/checkout/bookings/${booking._id}/visits/${visit._id}/care-instructions`)
    .set(authHeaders(customerSession)).send({
      expectedVersion: 0, pets: [], tasks: [
        { label: 'Thay nước sạch', required: true }, { label: 'Chơi bóng 5 phút', required: false }
      ]
    }).expect(200);
  nowMs = +startAt - 20 * 60000;
  await col('visits').updateOne({ _id: visit._id }, { $set: {
    sitterId: new mongoose.Types.ObjectId(replacementSession.user.id), handoverRequired: true, handoverAccepted: false,
    assignedAt: new Date(nowMs), handoverNote: { previousSitterId: new mongoose.Types.ObjectId(sitterSession.user.id), reasonCode: 'REASSIGNED' }
  }, $inc: { version: 1 } });

  await request(app).get(root + '/handover').set(authHeaders(sitterSession)).expect(404);
  const handover = await request(app).get(root + '/handover').set(authHeaders(replacementSession)).expect(200);
  const { care, version } = handover.body.data;
  expect(care.tasks).toContain('Việc trong quy trình');
  expect(care.additionalTasks).toEqual([
    expect.objectContaining({ label: 'Thay nước sạch', required: true }),
    expect.objectContaining({ label: 'Chơi bóng 5 phút', required: false })
  ]);
  const confirm = expectedVersion => request(app).post(root + '/handover-confirmations')
    .set(authHeaders(replacementSession, `synthetic-handover-${expectedVersion}`))
    .send({ expectedVersion, careVersion: care.version, acknowledged: true });
  await confirm(version - 1).expect(409);
  await confirm(version).expect(200);
  const saved = await col('visits').findOne({ _id: visit._id });
  expect(saved.acknowledgedInstructionVersion).toBe(2);
  expect(saved.careInstructions.acknowledgedBySitterId).toBe(replacementSession.user.id);
});

test('GBR-23 under 2 hours keeps old version on current visit and applies new version only to later unstarted visits', async () => {
  const sitterOid = new mongoose.Types.ObjectId(sitterSession.user.id);
  const v1Start = new Date(nowMs + 90 * 60000); // 1.5 hours away (< 2h)
  const v2Start = new Date(nowMs + 24 * 3600000); // next day (>= 2h)
  const v3Start = new Date(nowMs + 48 * 3600000); // cancelled visit
  const { booking, visits, petId } = await seedBookingWithVisits([
    { sitterId: sitterOid, state: 'ASSIGNED', startAt: v1Start, endAt: new Date(v1Start.getTime() + 3600000) },
    { sitterId: sitterOid, state: 'ASSIGNED', startAt: v2Start, endAt: new Date(v2Start.getTime() + 3600000) },
    { sitterId: null, state: 'CANCELLED', startAt: v3Start, endAt: new Date(v3Start.getTime() + 3600000) }
  ]);

  const res = await request(app)
    .put(`/api/v1/checkout/bookings/${booking._id}/visits/${visits[0]._id}/care-instructions`)
    .set(authHeaders(customerSession))
    .send({
      expectedVersion: 0,
      pets: [{ petId, feeding: 'Khẩu phần mới từ buổi sau', medicine: '', behavior: 'Cần vuốt ve trước' }],
      tasks: [
        { itemId: 'service-scope', label: 'Cho ăn và vệ sinh cơ bản', required: true },
        { itemId: 'pet-condition', label: 'Ghi nhận tình trạng thú cưng sau chăm sóc', required: true }
      ],
      homeAccessNote: 'Ghi chú mới cho buổi sau',
      applyToLater: true,
      applyFromNextVisit: true,
      targetVersions: [{ visitId: String(visits[1]._id), version: 0 }]
    })
    .expect(200);

  expect(res.body.data.appliedFromNextVisit).toBe(true);
  expect(res.body.data.updatedVisitIds).toEqual([String(visits[1]._id)]);

  // Visit 1 (< 2h) kept untouched at v1
  const dbV1 = await col('visits').findOne({ _id: visits[0]._id });
  expect(dbV1.currentInstructionVersion).toBeUndefined();
  expect(dbV1.snapshots.care.pets[0].careProfile.feeding.value).toBe('Ăn hạt 2 lần/ngày');

  // Visit 2 (>= 2h) updated to v2 and requires sitter acknowledgement
  const dbV2 = await col('visits').findOne({ _id: visits[1]._id });
  expect(dbV2.currentInstructionVersion).toBe(2);
  expect(dbV2.acknowledgedInstructionVersion).toBe(1);
  expect(dbV2.snapshots.care.pets[0].careProfile.feeding.value).toBe('Khẩu phần mới từ buổi sau');

  // Cancelled visit untouched
  const dbV3 = await col('visits').findOne({ _id: visits[2]._id });
  expect(dbV3.currentInstructionVersion).toBeUndefined();
});

test('legacy visits without careInstructions continue working identically for check-in, checklist, check-out, and handover', async () => {
  const sitterOid = new mongoose.Types.ObjectId(sitterSession.user.id);
  const replacementOid = new mongoose.Types.ObjectId(replacementSession.user.id);
  const startAt = new Date(nowMs + 15 * 60000);
  const endAt = new Date(nowMs + 75 * 60000);
  const { visits } = await seedBookingWithVisits([
    { sitterId: sitterOid, state: 'ASSIGNED', startAt, endAt },
    { sitterId: replacementOid, state: 'ASSIGNED', startAt: new Date(nowMs + 2 * 3600000), endAt: new Date(nowMs + 3 * 3600000), handover: true }
  ]);

  // 1. Legacy visit without careInstructions: direct check-in, default checklist, check-out
  const v1Id = String(visits[0]._id);
  const m1 = '3'.repeat(64);
  const m2 = '4'.repeat(64);
  await seedEvidence(sitterSession.user.id, m1);
  await seedEvidence(sitterSession.user.id, m2);
  const exec = await request(app).get(`/api/v1/visits/${v1Id}/execution`).set(authHeaders(sitterSession)).expect(200);
  expect(exec.body.data.careInstructionsPendingAck).toBeFalsy();
  const ci = await request(app)
    .post(`/api/v1/visits/${v1Id}/check-ins`)
    .set(authHeaders(sitterSession, 'legacy-checkin-01'))
    .send({ expectedVersion: 0, mediaId: m1 })
    .expect(200);
  const cl = await request(app)
    .patch(`/api/v1/visits/${v1Id}/checklists`)
    .set(authHeaders(sitterSession, 'legacy-checklist-01'))
    .send({
      expectedVersion: ci.body.data.version,
      items: [
        { itemId: 'service-scope', status: 'DONE' },
        { itemId: 'pet-condition', status: 'DONE' }
      ],
      customerNote: 'Synthetic care note'
    })
    .expect(200);
  const co = await request(app)
    .post(`/api/v1/visits/${v1Id}/check-outs`)
    .set(authHeaders(sitterSession, 'legacy-checkout-01'))
    .send({ expectedVersion: cl.body.data.version, mediaId: m2 })
    .expect(200);
  expect(co.body.data.state).toBe('COMPLETED');

  // 2. Legacy replacement visit handover confirmation works identically
  const v2Id = String(visits[1]._id);
  const handover = await request(app)
    .get(`/api/v1/employee-scheduling/visits/${v2Id}/handover`)
    .set(authHeaders(replacementSession))
    .expect(200);
  expect(handover.body.data.state).toBe('PENDING');
  const confirmed = await request(app)
    .post(`/api/v1/employee-scheduling/visits/${v2Id}/handover-confirmations`)
    .set(authHeaders(replacementSession, 'legacy-handover-01'))
    .send({ expectedVersion: handover.body.data.version, careVersion: handover.body.data.care.version, acknowledged: true })
    .expect(200);
  expect(confirmed.body.data.state).toBe('CONFIRMED');
});
