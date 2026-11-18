import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { createServiceWorkflowService } from '../../src/services/care/service-workflow.service.js';
import { createVisitWorkflowService } from '../../src/services/care/visit-workflow.service.js';
import {
  captureServiceWorkflow,
  workflowHash,
  workflowTasks,
  assertWorkflowGate
} from '../../src/services/care/workflow-snapshot.service.js';
import { serviceWorkflowVersionModel } from '../../src/models/service-workflow-version.model.js';
import { createVisitEvidenceAccess } from '../../src/services/care/visit-evidence-access.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { createServiceWorkflowRouter } from '../../src/routes/service-workflow.routes.js';
import { requestId, errorHandler } from '../../src/middlewares/http.js';
import { createIncidentService } from '../../src/services/incidents/incident.service.js';
import { createMongoIncidentRepository } from '../../src/services/incidents/mongo-incident.repository.js';
import { createIncidentRouter } from '../../src/routes/incident.routes.js';
import { boardingCarePlan } from '../../src/services/booking-proposals/boarding-care-plan.service.js';
import { serviceWorkflowDrafts } from '../../src/constants/service-workflow-drafts.js';
import { planCatalogWorkflows, applyCatalogWorkflows } from '../../src/services/care/catalog-workflows.service.js';
import { validateWorkflow } from '../../src/validators/service-workflow.validator.js';
import { reasonsOfVisit } from '../../src/services/employee-scheduling/needs-action.service.js';
import { visitNeedsCountStages } from '../../src/services/employee-scheduling/visit-board-query.service.js';

let replica,
  connection,
  templates,
  execution,
  finance,
  admin,
  sitter,
  customer,
  other,
  serviceId,
  visitId,
  bookingId,
  petIds,
  at,
  app,
  definition,
  incidents;
const oid = () => new mongoose.Types.ObjectId(),
  col = (name) => connection.db.collection(name);
const actor = (role) => ({ userId: String(oid()), state: 'ACTIVE', roles: [role], expiresAt: +at + 86400000 });
const step = (stepId, phase, extra = {}) => ({
  stepId,
  title: stepId,
  instructions: 'Follow owner instructions; stop if unsafe',
  phase,
  scope: 'PER_PET',
  inputType: 'CONFIRMATION',
  required: true,
  canSkip: false,
  safetyCritical: false,
  customerVisible: true,
  photoSlots: [],
  species: [],
  locations: [],
  fields: [],
  ...extra
});
const slot = (photoSlotId) => ({
  photoSlotId,
  title: photoSlotId,
  instructions: 'Photograph the named side',
  minPhotos: 1,
  maxPhotos: 1
});
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose
    .createConnection(replica.getUri(), { dbName: 'workflow_test', autoIndex: false, autoCreate: false })
    .asPromise();
  for (const model of [
    ...Object.values(employeeSchedulingModels(connection)),
    ...Object.values(payrollModels(connection)),
    serviceWorkflowVersionModel(connection)
  ]) {
    await model.createCollection();
    await model.createIndexes();
  }
  await provisionFinanceSources(connection);
}, 180000);
afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});
beforeEach(async () => {
  for (const { name } of await connection.db.listCollections({}, { nameOnly: true }).toArray())
    await col(name).deleteMany({});
  at = new Date('2026-11-18T10:00:00Z');
  admin = actor('ADMIN');
  sitter = actor('PET_SITTER');
  customer = actor('CUSTOMER');
  other = actor('CUSTOMER');
  serviceId = oid();
  visitId = oid();
  bookingId = oid();
  petIds = [oid(), oid()];
  for (const user of [admin, sitter, customer, other])
    await col('users').insertOne({ _id: new mongoose.Types.ObjectId(user.userId), state: 'ACTIVE', roles: user.roles });
  await col('sitterstatuses').insertOne({ userId: new mongoose.Types.ObjectId(sitter.userId), status: 'ACTIVE' });
  await col('services').insertOne({ _id: serviceId, code: 'home-care' });
  templates = createServiceWorkflowService({ connection, clock: () => +at });
  execution = createVisitWorkflowService({ connection, clock: () => +at });
  finance = createBookingFinanceSourceService({ connection, clock: () => at });
  definition = {
    title: 'Care workflow',
    steps: [
      step('arrival', 'CHECK_IN'),
      step('ears', 'EXECUTION', { inputType: 'PHOTO', photoSlots: [slot('left-ear'), slot('right-ear')] }),
      step('handover', 'CHECK_OUT')
    ]
  };
  const session = {
    authenticate: async (req) => ({ admin, sitter, customer, other })[req.get('x-test-actor')],
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  incidents = createIncidentService({
    repository: createMongoIncidentRepository({ connection, finance, clock: () => +at }),
    clock: () => +at
  });
  app = express();
  app.use(express.json());
  app.use('/api/v1', createIncidentRouter({ service: incidents, sessionPort: session, clock: () => +at }));
  app.use(requestId);
  app.use('/api/v1', createServiceWorkflowRouter({ templates, execution, sessionService: session, clock: () => +at }));
  app.get('/public-probe', (_req, res) => res.json({ public: true }));
  app.use(errorHandler(() => {}));
});
async function publish(value = definition, revision = 0) {
  await templates.mutate(
    admin,
    String(serviceId),
    'DRAFT',
    { expectedVersion: revision, definition: value },
    `save-draft-${revision}`
  );
  return templates.mutate(
    admin,
    String(serviceId),
    'PUBLISH',
    { expectedVersion: revision + 1 },
    `publish-workflow-${revision}`
  );
}
async function fixture({ twoPets = false, legacy = false, state = 'ASSIGNED' } = {}) {
  if (!legacy) await publish();
  const pets = petIds
    .slice(0, twoPets ? 2 : 1)
    .map((id, i) => ({ id: String(id), name: `Pet ${i + 1}`, species: 'DOG' }));
  const snapshot = await captureServiceWorkflow(connection, serviceId, pets, 'HOME');
  const care = { schemaVersion: 1, capturedAt: at, pets };
  const visit = {
    _id: visitId,
    bookingId,
    serviceId,
    customerId: new mongoose.Types.ObjectId(customer.userId),
    sitterId: new mongoose.Types.ObjectId(sitter.userId),
    petIds: pets.map((p) => new mongoose.Types.ObjectId(p.id)),
    state,
    version: 0,
    location: 'HOME',
    areaCode: 'DEMO',
    startAt: at,
    endAt: new Date(+at + 3600000),
    evidenceRefs: [],
    careAcknowledgement: { sitterId: sitter.userId, version: workflowHash(care) },
    snapshots: {
      pets,
      care,
      employeeServiceNetVnd: 100000,
      checklistItemIds: ['legacy-task'],
      ...(snapshot ? { workflow: snapshot } : {})
    }
  };
  if (state === 'IN_PROGRESS') visit.checkInAt = at;
  await col('bookings').insertOne({
    _id: bookingId,
    customerId: new mongoose.Types.ObjectId(customer.userId),
    state: 'ASSIGNED',
    carePlanState: 'APPROVED',
    visitIds: [visitId],
    originalVisitCount: 1,
    careVisitCount: 1,
    paymentMode: 'POSTPAY',
    version: 0
  });
  await col('visits').insertOne(visit);
  return visit;
}
const taskKey = (stepId, index = 0) => `${stepId}:${petIds[index]}`;
const task = (stepId, expectedVersion = 0, extra = {}, key = `task:${stepId}:${expectedVersion}`) =>
  execution.task(
    sitter,
    String(visitId),
    { expectedVersion, taskKey: taskKey(stepId), status: 'COMPLETED', ...extra },
    key
  );
async function image(char = 'a', owner = sitter) {
  const id = char.repeat(64);
  await col('privateimages').insertOne({
    _id: id,
    ownerId: new mongoose.Types.ObjectId(owner.userId),
    state: 'READY',
    contentType: 'image/png',
    contentDigest: 'e'.repeat(64),
    byteLength: 100
  });
  return id;
}
async function start() {
  await task('arrival');
  const mediaId = await image('1');
  await finance.checkIn({
    actor: sitter,
    visitId: String(visitId),
    expectedVersion: 1,
    idempotencyKey: 'check-in-workflow',
    mediaId
  });
}

test('AC01 draft, validation, publication/history are Admin-only and idempotent', async () => {
  await expect(
    templates.mutate(customer, String(serviceId), 'DRAFT', { expectedVersion: 0, definition }, 'draft-request')
  ).rejects.toMatchObject({ status: 403 });
  await templates.mutate(admin, String(serviceId), 'DRAFT', { expectedVersion: 0, definition }, 'draft-request');
  expect(
    await templates.mutate(admin, String(serviceId), 'VALIDATE', { expectedVersion: 1 }, 'validate-request')
  ).toMatchObject({ valid: true });
  const first = await templates.mutate(admin, String(serviceId), 'PUBLISH', { expectedVersion: 1 }, 'publish-request');
  expect(
    await templates.mutate(admin, String(serviceId), 'PUBLISH', { expectedVersion: 1 }, 'publish-request')
  ).toEqual(first);
  expect((await templates.read(admin, String(serviceId))).history).toHaveLength(1);
});
test('AC02 snapshots keep V1 after publish V2 and retirement; new snapshots use V2', async () => {
  await fixture();
  const original = await col('visits').findOne({ _id: visitId });
  const v2 = { ...definition, title: 'V2' };
  await publish(v2, 2);
  expect((await captureServiceWorkflow(connection, serviceId, original.snapshots.pets, 'HOME')).definition.title).toBe(
    'V2'
  );
  expect((await col('visits').findOne({ _id: visitId })).snapshots.workflow).toEqual(original.snapshots.workflow);
  await templates.mutate(admin, String(serviceId), 'RETIRE', { expectedVersion: 4 }, 'retire-request');
  expect(await captureServiceWorkflow(connection, serviceId, original.snapshots.pets, 'HOME')).toBeUndefined();
  expect((await execution.read(sitter, String(visitId))).title).toBe('Care workflow');
});
test('AC03 named slots and AC05 persistence after reload reject one photo filling two slots', async () => {
  await fixture();
  await start();
  const left = await image('2');
  await expect(task('ears', 2, { mediaId: left, photoSlotId: 'left-ear' })).rejects.toMatchObject({
    code: 'WORKFLOW_INCOMPLETE',
    details: { missingTasks: [{ taskKey: taskKey('ears'), reasons: ['PHOTO_SLOT:right-ear'] }] }
  });
  expect(await col('caremediabindings').findOne({ _id: left })).toBeNull();
  await task('ears', 2, { status: 'IN_PROGRESS', mediaId: left, photoSlotId: 'left-ear' });
  expect((await execution.read(sitter, String(visitId))).tasks.find((t) => t.stepId === 'ears').evidence).toHaveLength(
    1
  );
  await expect(task('ears', 3, { mediaId: left, photoSlotId: 'right-ear' })).rejects.toMatchObject({
    code: 'EVIDENCE_ALREADY_USED'
  });
  const right = await image('3');
  await task('ears', 3, { mediaId: right, photoSlotId: 'right-ear' });
  expect((await execution.read(sitter, String(visitId))).completed).toBe(2);
});
test('AC04 check-in cannot bypass tasks or assignment; check-in window remains 30 minutes', async () => {
  await fixture();
  const mediaId = await image('1');
  await expect(
    finance.checkIn({
      actor: sitter,
      visitId: String(visitId),
      expectedVersion: 0,
      idempotencyKey: 'checkin-no-tasks',
      mediaId
    })
  ).rejects.toMatchObject({ code: 'WORKFLOW_INCOMPLETE' });
  await expect(
    execution.task(
      { ...sitter, userId: other.userId },
      String(visitId),
      { expectedVersion: 0, taskKey: taskKey('arrival'), status: 'COMPLETED' },
      'wrong-assignment'
    )
  ).rejects.toMatchObject({ status: 404 });
  at = new Date(+at - 1800001);
  await expect(task('arrival')).rejects.toMatchObject({ code: 'WORKFLOW_WINDOW_CLOSED' });
});
test('AC06 checkout refuses missing tasks and generic checklist cannot bypass versioned workflow', async () => {
  await fixture();
  await start();
  const mediaId = await image('4');
  await expect(
    finance.updateChecklist({
      actor: sitter,
      visitId: String(visitId),
      expectedVersion: 2,
      idempotencyKey: 'generic-checklist',
      items: [{ itemId: 'legacy-task', status: 'DONE' }]
    })
  ).rejects.toMatchObject({ code: 'WORKFLOW_TASKS_REQUIRED' });
  await expect(
    finance.checkOut({
      actor: sitter,
      visitId: String(visitId),
      expectedVersion: 2,
      idempotencyKey: 'check-out-missing',
      mediaId
    })
  ).rejects.toMatchObject({ code: 'WORKFLOW_INCOMPLETE' });
  const left = await image('2'),
    right = await image('3');
  await task('ears', 2, { status: 'IN_PROGRESS', mediaId: left, photoSlotId: 'left-ear' });
  await task('ears', 3, { mediaId: right, photoSlotId: 'right-ear' });
  await task('handover', 4);
  await execution.verifyEvidence(await col('visits').findOne({ _id: visitId }));
  assertWorkflowGate(await col('visits').findOne({ _id: visitId }), ['CHECK_IN', 'EXECUTION', 'CHECK_OUT']);
  expect(await col('payrollservicecredits').countDocuments()).toBe(0);
  at = new Date(+at + 900000);
  const final = await finance.checkOut({
    actor: sitter,
    visitId: String(visitId),
    expectedVersion: 5,
    idempotencyKey: 'full-check-out',
    mediaId
  });
  expect(final).toMatchObject({ state: 'COMPLETED', version: 6 });
  expect(await col('payrollservicecredits').countDocuments()).toBe(1);
});
test('AC07 per-pet tasks cannot share photos or claim another pet task', async () => {
  await fixture({ twoPets: true });
  await task('arrival');
  await task('arrival', 1, { taskKey: taskKey('arrival', 1) });
  expect((await execution.read(sitter, String(visitId))).total).toBe(6);
  await expect(task('arrival', 2, { taskKey: `arrival:${oid()}` })).rejects.toMatchObject({
    code: 'WORKFLOW_TASK_NOT_FOUND'
  });
  const before = await col('visits').findOne({ _id: visitId });
  expect(before.workflowResults.every((row) => row.evidence.length === 0)).toBe(true);
});
test('AC08 concurrent CAS loses no progress and same-key retry creates one result/event', async () => {
  await fixture();
  const body = { expectedVersion: 0, taskKey: taskKey('arrival'), status: 'IN_PROGRESS', note: 'same progress' };
  const values = await Promise.all([
    execution.task(sitter, String(visitId), body, 'same-operation'),
    execution.task(sitter, String(visitId), body, 'same-operation')
  ]);
  expect(values[0]).toEqual(values[1]);
  expect((await col('visits').findOne({ _id: visitId })).version).toBe(1);
  expect(await col('employeescheduleevents').countDocuments({ type: 'VisitWorkflowTaskSaved' })).toBe(1);
  const outcomes = await Promise.allSettled([
    task('arrival', 1, {}, 'concurrent-one'),
    task('arrival', 1, {}, 'concurrent-two')
  ]);
  expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find((row) => row.status === 'rejected').reason.code).toBe('VERSION_CONFLICT');
});
test('AC09 reassignment preserves results; former sitter loses mutation scope; handover required', async () => {
  await fixture();
  await task('arrival', 0, { status: 'IN_PROGRESS' });
  const next = actor('PET_SITTER');
  await col('users').insertOne({ _id: new mongoose.Types.ObjectId(next.userId), state: 'ACTIVE', roles: next.roles });
  await col('sitterstatuses').insertOne({ userId: new mongoose.Types.ObjectId(next.userId), status: 'ACTIVE' });
  await col('visits').updateOne(
    { _id: visitId },
    {
      $set: { sitterId: new mongoose.Types.ObjectId(next.userId), handoverRequired: true, handoverAccepted: false },
      $inc: { version: 1 }
    }
  );
  await expect(task('arrival', 2)).rejects.toMatchObject({ status: 404 });
  await expect(
    execution.task(
      next,
      String(visitId),
      { expectedVersion: 2, taskKey: taskKey('arrival'), status: 'COMPLETED' },
      'replacement-one'
    )
  ).rejects.toMatchObject({ code: 'HANDOVER_REQUIRED' });
  expect((await col('visits').findOne({ _id: visitId })).workflowResults[0].completedBy).toBe(sitter.userId);
});
test('AC10 privacy enforces visibility and binding/digest; Staff gets only bound workflow media', async () => {
  definition.steps[1].customerVisible = false;
  await fixture();
  await start();
  const mediaId = await image('2');
  await task('ears', 2, { status: 'IN_PROGRESS', mediaId, photoSlotId: 'left-ear' });
  const authorize = createVisitEvidenceAccess({ connection }),
    photo = await col('privateimages').findOne({ _id: mediaId });
  expect(await authorize({ actor: customer, image: photo })).toBe(false);
  expect(await authorize({ actor: other, image: photo })).toBe(false);
  expect(await authorize({ actor: admin, image: photo })).toBe(true);
  expect((await execution.read(customer, String(visitId))).tasks.some((row) => row.stepId === 'ears')).toBe(false);
  expect(await authorize({ actor: admin, image: { ...photo, contentDigest: 'wrong' } })).toBe(false);
  await expect(execution.read(other, String(visitId))).rejects.toMatchObject({ status: 404 });
});
test('AC11 blocked task escalates with audit/notification, blocks gate and needs reasoned staff retry', async () => {
  await fixture();
  await task('arrival', 0, { status: 'BLOCKED', note: 'Pet cannot be handled safely' });
  await expect(task('arrival', 1)).rejects.toMatchObject({ code: 'WORKFLOW_TASK_LOCKED' });
  expect(await col('notifications').countDocuments({ eventType: 'CARE_REVIEW_REQUIRED' })).toBe(1);
  expect((await col('visits').aggregate(visitNeedsCountStages(+at)).toArray())[0].total).toBe(1);
  await expect(
    execution.review(
      customer,
      String(visitId),
      { expectedVersion: 1, taskKey: taskKey('arrival'), reason: 'Confirmed safe retry' },
      'review-wrong'
    )
  ).rejects.toMatchObject({ status: 403 });
  await execution.review(
    admin,
    String(visitId),
    { expectedVersion: 1, taskKey: taskKey('arrival'), reason: 'Discussed with owner, retry after calming' },
    'review-valid'
  );
  expect((await col('visits').findOne({ _id: visitId })).workflowProgress.blocked).toBe(false);
  await task('arrival', 2);
});
test('AC12 legacy never silently takes newest workflow', async () => {
  await fixture({ legacy: true });
  await publish();
  expect((await execution.read(sitter, String(visitId))).mode).toBe('LEGACY');
  await expect(task('arrival')).rejects.toMatchObject({ code: 'LEGACY_WORKFLOW' });
  const mediaId = await image('1');
  expect(
    await finance.checkIn({
      actor: sitter,
      visitId: String(visitId),
      expectedVersion: 0,
      idempotencyKey: 'legacy-check-in',
      mediaId
    })
  ).toMatchObject({ state: 'IN_PROGRESS' });
});
test('AC13 pending/unowned uploads do not bind or report success', async () => {
  await fixture();
  await start();
  const mediaId = await image('2');
  await col('privateimages').updateOne({ _id: mediaId }, { $set: { state: 'PENDING' } });
  await expect(task('ears', 2, { status: 'IN_PROGRESS', mediaId, photoSlotId: 'left-ear' })).rejects.toMatchObject({
    code: 'EVIDENCE_NOT_READY'
  });
  expect((await col('visits').findOne({ _id: visitId })).version).toBe(2);
  expect(await col('caremediabindings').findOne({ _id: mediaId })).toBeNull();
});
test('AC14 template and task saves leave financial and catalog policy stores unchanged', async () => {
  await fixture();
  const booking = await col('bookings').findOne({ _id: bookingId });
  await task('arrival');
  expect(await col('bookings').findOne({ _id: bookingId })).toEqual(booking);
  for (const name of ['payments', 'taxassessments', 'payrollservicecredits', 'pricingpolicies', 'servicepriceversions'])
    expect(await col(name).countDocuments()).toBe(0);
});
test('malformed/unsafe publication and unknown client fields are rejected server-side', async () => {
  await expect(
    templates.mutate(
      admin,
      String(serviceId),
      'DRAFT',
      { expectedVersion: 0, definition: { ...definition, steps: [...definition.steps, definition.steps[0]] } },
      'duplicate-steps'
    )
  ).rejects.toMatchObject({ code: 'WORKFLOW_INVALID' });
  definition.steps[0].canSkip = true;
  expect(() => validateWorkflow(definition, { publishing: true })).toThrow();
  definition.steps[0].canSkip = false;
  definition.steps[1].photoSlots = [];
  expect(() => validateWorkflow(definition, { publishing: true })).toThrow();
});
test('HTTP session, role, CSRF and body boundaries protect template/task endpoints', async () => {
  const path = `/api/v1/services/admin/${serviceId}/workflow`;
  expect((await request(app).get(path)).status).toBe(401);
  expect((await request(app).get(path).set('x-test-actor', 'customer')).status).toBe(403);
  expect(
    (
      await request(app)
        .put(path + '/draft')
        .set('x-test-actor', 'admin')
        .send({ expectedVersion: 0, definition })
    ).status
  ).toBe(403);
  const response = await request(app)
    .put(path + '/draft')
    .set('Host', 'localhost')
    .set('Origin', 'http://localhost')
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('x-test-actor', 'admin')
    .set('Idempotency-Key', 'http-draft-one')
    .send({ expectedVersion: 0, definition });
  expect(response.status).toBe(200);
  expect(response.body.data.revision).toBe(1);
});
test('all 15 current catalog SOPs preserve provenance and boarding captures per shift', async () => {
  expect(serviceWorkflowDrafts).toHaveLength(15);
  const boarding = serviceWorkflowDrafts.find((item) => item.code === 'pet-boarding').definition;
  expect(boarding.steps.find((item) => item.stepId === 'boarding-admission').phase).toBe('CHECK_IN');
  expect(boarding.steps.some((item) => item.stepId === 'boarding-hygiene' && item.safetyCritical)).toBe(true);
  for (const item of serviceWorkflowDrafts)
    expect(validateWorkflow(item.definition, { publishing: true }).steps.length).toBeGreaterThan(2);
  await fixture();
  const visit = await col('visits').findOne({ _id: visitId });
  visit.endAt = new Date(+visit.startAt + 24 * 3600000);
  visit.snapshots.boarding = true;
  visit.snapshots.employeeServiceNetVnd = 120000;
  const shifts = boardingCarePlan({ checkoutSnapshot: { customerVisits: [visit] } }, 480);
  expect(shifts).toHaveLength(3);
  expect(shifts.every((shift) => shift.snapshots.workflow.hash === visit.snapshots.workflow.hash)).toBe(true);
});

test('catalog operator publishes all current codes without new stores, repeats safely and rejects Admin conflicts', async () => {
  for (const item of serviceWorkflowDrafts.filter((item) => item.code !== 'home-care'))
    await col('services').insertOne({ code: item.code });
  const beforeCollections = (await connection.db.listCollections({}, { nameOnly: true }).toArray())
    .map((row) => row.name)
    .sort();
  let plan = await planCatalogWorkflows(connection);
  expect(plan.entries.every((item) => item.state === 'NEW')).toBe(true);
  await expect(
    applyCatalogWorkflows(connection, { adminId: customer.userId, expectedPlanHash: plan.hash })
  ).rejects.toThrow('Admin');
  await expect(applyCatalogWorkflows(connection, { adminId: admin.userId, expectedPlanHash: 'stale' })).rejects.toThrow(
    'plan changed'
  );
  plan = await applyCatalogWorkflows(connection, { adminId: admin.userId, expectedPlanHash: plan.hash });
  expect(plan.entries.every((item) => item.state === 'CURRENT')).toBe(true);
  expect(await col('serviceworkflowversions').countDocuments()).toBe(15);
  await applyCatalogWorkflows(connection, { adminId: admin.userId, expectedPlanHash: plan.hash });
  expect(await col('serviceworkflowversions').countDocuments()).toBe(15);
  expect((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name).sort()).toEqual(
    beforeCollections
  );
  const snapshot = await captureServiceWorkflow(
    connection,
    serviceId,
    [{ id: String(petIds[0]), name: 'Cat', species: 'CAT' }],
    'HOME'
  );
  const tasks = workflowTasks(snapshot, [{ id: String(petIds[0]), name: 'Cat', species: 'CAT' }], 'HOME');
  expect(tasks.some((row) => row.step.stepId === 'dog-environment')).toBe(false);
  expect(tasks.some((row) => row.step.stepId === 'cat-environment')).toBe(true);
  expect(tasks.every((row) => row.step.instructions.includes('https://'))).toBe(true);
  await col('services').updateOne(
    { _id: serviceId },
    { $set: { workflowPublished: null, workflowRevision: 3, workflowDraft: definition } }
  );
  plan = await planCatalogWorkflows(connection);
  await expect(
    applyCatalogWorkflows(connection, { adminId: admin.userId, expectedPlanHash: plan.hash })
  ).rejects.toThrow('conflicts');
  expect((await col('services').findOne({ _id: serviceId })).workflowDraft).toEqual(definition);
});

test('operator resumes its saved draft after interruption without duplicating history', async () => {
  const item = serviceWorkflowDrafts.find((row) => row.code === 'home-care');
  await templates.mutate(
    admin,
    String(serviceId),
    'DRAFT',
    { expectedVersion: 0, definition: item.definition },
    'operator-interruption'
  );
  const plan = await planCatalogWorkflows(connection);
  expect(plan.entries.find((row) => row.code === item.code).state).toBe('RESUME_PUBLICATION');
  await applyCatalogWorkflows(connection, { adminId: admin.userId, expectedPlanHash: plan.hash });
  expect(await col('serviceworkflowversions').countDocuments()).toBe(1);
});
test('history index explains bounded equality/sort without collection scan or in-memory sort', async () => {
  await publish();
  const plan = await col('serviceworkflowversions')
    .find({ serviceId })
    .sort({ revision: -1 })
    .limit(21)
    .explain('executionStats');
  expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('COLLSCAN');
  expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
  expect(plan.executionStats.totalDocsExamined).toBeLessThanOrEqual(21);
});

test('incident HTTP/persistence follows existing contract, gates care and retains financial hold until explicit Admin closure', async () => {
  await fixture();
  const body = {
    visitId: String(visitId),
    expectedVersion: 0,
    category: 'SAFETY',
    severity: 'HIGH',
    urgency: 'URGENT',
    description: 'Synthetic pet cannot cooperate safely',
    evidenceRefs: []
  };
  const send = () =>
    request(app)
      .post('/api/v1/incidents')
      .set('Host', 'localhost')
      .set('Origin', 'http://localhost')
      .set('X-CSRF-Token', 'synthetic-csrf')
      .set('x-test-actor', 'sitter')
      .set('Idempotency-Key', 'incident-http-report')
      .send(body);
  const first = await send();
  expect(first.status).toBe(201);
  const caseId = first.body.data.id;
  expect((await send()).body.data).toEqual(first.body.data);
  expect(await col('cases').countDocuments()).toBe(1);
  expect((await col('cases').findOne({ _id: new mongoose.Types.ObjectId(caseId) })).financialHold).toBe(true);
  expect((await incidents.list({ actor: customer, query: { visitId: String(visitId) } })).items).toHaveLength(1);
  expect((await incidents.list({ actor: other, query: {} })).items).toHaveLength(0);
  await expect(execution.verifyEvidence(await col('visits').findOne({ _id: visitId }))).rejects.toMatchObject({
    code: 'INCIDENT_REVIEW_REQUIRED'
  });
  const resolve = (expectedVersion, targetState, key, extra = {}) =>
    incidents.resolve({
      actor: admin,
      caseId,
      expectedVersion,
      targetState,
      summary: 'Checked real situation with owner',
      staffNotes: 'Private synthetic staff note',
      idempotencyKey: key,
      ...extra
    });
  await resolve(0, 'UNDER_REVIEW', 'incident-review');
  await resolve(1, 'RESOLVED', 'incident-resolve');
  expect((await incidents.detail({ actor: customer, caseId })).staffNotes).toBeUndefined();
  await expect(resolve(2, 'CLOSED', 'incident-close-missing')).rejects.toMatchObject({
    code: 'FINANCIAL_REVIEW_REQUIRED'
  });
  await resolve(2, 'CLOSED', 'incident-close-explicit', {
    financialDecision: { decision: 'NO_FINANCIAL_ACTION', reason: 'Owner and Admin confirmed no financial impact' }
  });
  expect((await col('cases').findOne({ _id: new mongoose.Types.ObjectId(caseId) })).financialHold).toBe(false);
  expect(await col('payments').countDocuments()).toBe(0);
  expect(await col('refunds').countDocuments()).toBe(0);
  await execution.verifyEvidence(await col('visits').findOne({ _id: visitId }));
});
test('incident reports and visit task saves serialize; former assignment cannot list protected cases', async () => {
  await fixture();
  const record = await incidents.report({
    actor: sitter,
    visitId: String(visitId),
    expectedVersion: 0,
    severity: 'MEDIUM',
    urgency: 'ROUTINE',
    category: 'SAFETY',
    description: 'Synthetic observation',
    idempotencyKey: 'incident-original'
  });
  const next = actor('PET_SITTER');
  await col('users').insertOne({ _id: new mongoose.Types.ObjectId(next.userId), state: 'ACTIVE', roles: next.roles });
  await col('visits').updateOne(
    { _id: visitId },
    { $set: { sitterId: new mongoose.Types.ObjectId(next.userId) }, $inc: { version: 1 } }
  );
  expect((await incidents.list({ actor: sitter, query: {} })).items).toHaveLength(0);
  await expect(incidents.detail({ actor: sitter, caseId: record.id })).rejects.toMatchObject({ status: 404 });
  expect((await incidents.list({ actor: next, query: {} })).items).toHaveLength(1);
});

test('incident authentication applies only to incident paths and leaves public/provider routes reachable', async () => {
  expect((await request(app).get('/public-probe')).body).toEqual({ public: true });
});
test('multi-pet evidence binding cannot complete another pet photo requirement', async () => {
  await fixture({ twoPets: true });
  await task('arrival');
  await task('arrival', 1, { taskKey: taskKey('arrival', 1) });
  const general = await image('1');
  await finance.checkIn({
    actor: sitter,
    visitId: String(visitId),
    expectedVersion: 2,
    idempotencyKey: 'multi-checkin',
    mediaId: general
  });
  const left = await image('2'),
    right = await image('3');
  await task('ears', 3, { status: 'IN_PROGRESS', mediaId: left, photoSlotId: 'left-ear' });
  await task('ears', 4, { mediaId: right, photoSlotId: 'right-ear' });
  await expect(
    task('ears', 5, { taskKey: taskKey('ears', 1), status: 'IN_PROGRESS', mediaId: left, photoSlotId: 'left-ear' })
  ).rejects.toMatchObject({ code: 'EVIDENCE_ALREADY_USED' });
  const read = await execution.read(sitter, String(visitId));
  expect(read.tasks.find((row) => row.taskKey === taskKey('ears', 1)).evidence).toHaveLength(0);
});
test('reassigned sitter acknowledges handover and keeps former uploader evidence in immutable history', async () => {
  await fixture();
  await start();
  const mediaId = await image('2');
  await task('ears', 2, { status: 'IN_PROGRESS', mediaId, photoSlotId: 'left-ear' });
  const original = await col('visits').findOne({ _id: visitId }),
    next = actor('PET_SITTER');
  await col('users').insertOne({ _id: new mongoose.Types.ObjectId(next.userId), state: 'ACTIVE', roles: next.roles });
  await col('sitterstatuses').insertOne({ userId: new mongoose.Types.ObjectId(next.userId), status: 'ACTIVE' });
  await col('visits').updateOne(
    { _id: visitId },
    {
      $set: {
        sitterId: new mongoose.Types.ObjectId(next.userId),
        handoverRequired: true,
        handoverAccepted: true,
        careAcknowledgement: { sitterId: next.userId, version: workflowHash(original.snapshots.care) }
      },
      $inc: { version: 1 }
    }
  );
  const right = await image('3', next);
  await execution.task(
    next,
    String(visitId),
    { expectedVersion: 4, taskKey: taskKey('ears'), status: 'COMPLETED', mediaId: right, photoSlotId: 'right-ear' },
    'replacement-photo'
  );
  const saved = await col('visits').findOne({ _id: visitId });
  expect(
    saved.workflowResults.find((row) => row.taskKey === taskKey('ears')).evidence.map((photo) => photo.uploadedBy)
  ).toEqual([sitter.userId, next.userId]);
  await execution.verifyEvidence(saved);
  expect(
    await createVisitEvidenceAccess({ connection })({
      actor: next,
      image: await col('privateimages').findOne({ _id: mediaId })
    })
  ).toBe(true);
  expect(
    await col('employeescheduleevents').countDocuments({
      type: 'VisitWorkflowTaskSaved',
      'detail.result.evidence.uploadedBy': sitter.userId
    })
  ).toBeGreaterThan(0);
});
test('cancelled Visit, invalid MIME and unsafe skip cannot write progress or bind media', async () => {
  await fixture();
  await start();
  const mediaId = await image('2');
  await col('privateimages').updateOne({ _id: mediaId }, { $set: { contentType: 'text/plain' } });
  await expect(task('ears', 2, { status: 'IN_PROGRESS', mediaId, photoSlotId: 'left-ear' })).rejects.toMatchObject({
    code: 'EVIDENCE_NOT_READY'
  });
  await expect(task('ears', 2, { status: 'SKIPPED', skipReason: 'No photo' })).rejects.toMatchObject({
    code: 'WORKFLOW_SKIP_FORBIDDEN'
  });
  await col('visits').updateOne({ _id: visitId }, { $set: { state: 'CANCELLED' }, $inc: { version: 1 } });
  await expect(task('ears', 3, { status: 'IN_PROGRESS' })).rejects.toMatchObject({ status: 403 });
});

test('open incident without task progress produces a usable operational board reason', async () => {
  const visit = await fixture();
  expect(reasonsOfVisit({ ...visit, incidentOpen: true }, +at)).toEqual([
    { code: 'WORKFLOW_BLOCKED', late: true, ms: 0 }
  ]);
});

test('operator provisioning dry-run creates nothing, apply is additive development-only and rerun is idempotent', async () => {
  const run = promisify(execFile),
    database = 'workflow_provision_dev';
  const env = { ...process.env, NODE_ENV: 'test', MONGO_URI: replica.getUri(), MONGO_DB: database };
  const invoke = (args = [], extra = {}) =>
    run(process.execPath, ['scripts/migrations/service-workflow-storage.js', ...args], {
      cwd: process.cwd(),
      env: { ...env, ...extra },
      timeout: 20000
    });
  const db = connection.useDb(database).db;
  expect(JSON.parse((await invoke()).stdout)).toMatchObject({ state: 'DRY_RUN', exists: false, backfill: false });
  expect(await db.listCollections({}, { nameOnly: true }).toArray()).toHaveLength(0);
  expect((await invoke(['--apply'])).stdout).toContain('APPLIED');
  expect((await invoke(['--apply'])).stdout).toContain('APPLIED');
  expect(await db.collection('serviceworkflowversions').countDocuments()).toBe(0);
  expect(
    (await db.collection('serviceworkflowversions').listIndexes().toArray()).some(
      (index) => index.unique && index.key.serviceId === 1 && index.key.revision === -1
    )
  ).toBe(true);
  await expect(invoke(['--apply'], { MONGO_DB: 'workflow_provision_notdev' })).rejects.toMatchObject({ code: 1 });
  expect(
    await connection.useDb('workflow_provision_notdev').db.listCollections({}, { nameOnly: true }).toArray()
  ).toHaveLength(0);
});

test('incident resolution retry remains idempotent when the server clock advances', async () => {
  await fixture();
  const reported = await incidents.report({
    actor: sitter,
    visitId: String(visitId),
    severity: 'MEDIUM',
    description: 'Synthetic observation',
    idempotencyKey: 'time-report'
  });
  const body = {
    actor: admin,
    caseId: reported.id,
    expectedVersion: 0,
    targetState: 'UNDER_REVIEW',
    summary: 'Checking safely',
    idempotencyKey: 'time-review'
  };
  const first = await incidents.resolve(body);
  at = new Date(+at + 10000);
  expect(await incidents.resolve(body)).toEqual(first);
  expect((await col('cases').findOne({ _id: new mongoose.Types.ObjectId(reported.id) })).version).toBe(1);
});

test('Incident adapter registers only the selected compensation profile stores', async () => {
  for (const compensationModel of ['EMPLOYEE', 'LEGACY_PARTNER']) {
    const isolated = mongoose.createConnection();
    try {
      createMongoIncidentRepository({ connection: isolated, finance: {}, compensationModel });
      if (compensationModel === 'EMPLOYEE') expect(isolated.models.Earning).toBeUndefined();
      else expect(isolated.models.PayrollServiceCredit).toBeUndefined();
    } finally {
      await isolated.close();
    }
  }
});
