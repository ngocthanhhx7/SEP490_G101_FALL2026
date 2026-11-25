import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createSitterApplicationService } from '../../src/services/sitter-application.service.js';
import { sitterApplicationModels } from '../../src/models/sitter-application.model.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { userModel } from '../../src/models/user.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createVisitEvidenceQuota } from '../../src/services/care/visit-evidence-quota.service.js';
import { createVisitWorkflowService } from '../../src/services/care/visit-workflow.service.js';
import { workflowHash } from '../../src/services/care/workflow-snapshot.service.js';
import { createNeedsActionService } from '../../src/services/employee-scheduling/needs-action.service.js';
import { createEmployeeScheduleRepository } from '../../src/services/employee-scheduling/employee-schedule.repository.js';
import { createBookingFinanceSourceService } from '../../src/services/settlements/booking-finance-source.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { digest } from '../../src/validators/pet-care.validator.js';

const oid = () => new mongoose.Types.ObjectId();
const hashHex = (v) => createHash('sha256').update(v).digest('hex');

const LOOKUP_SECRET = 'synthetic-suspend-lookup-secret-32bytes-ok';
const CURSOR_SECRET = 'synthetic-suspend-cursor-secret-32bytes-ok';
const ENC_KEY = '12345678901234567890123456789012';
const NOW = Date.parse('2026-11-26T04:00:00.000Z');

const wfStep = (stepId, phase) => ({
  stepId,
  title: stepId,
  instructions: 'Follow owner instructions',
  phase,
  scope: 'VISIT',
  inputType: 'CONFIRMATION',
  required: true,
  canSkip: false,
  safetyCritical: false,
  customerVisible: true,
  photoSlots: [],
  species: [],
  locations: [],
  fields: []
});

const workflowDefinition = {
  title: 'Home care workflow',
  steps: [wfStep('arrival', 'CHECK_IN'), wfStep('complete', 'CHECK_OUT')]
};

let replica;
let connection;

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_sitter_suspend_offers' }).asPromise();
  const appModels = sitterApplicationModels(connection);
  const schedModels = employeeSchedulingModels(connection);
  const payModels = payrollModels(connection);
  const User = userModel(connection);
  await provisionFinanceSources(connection);
  await Promise.all([
    User.createIndexes(),
    appModels.SitterApplication.createIndexes(),
    appModels.SitterApplicationAudit.createIndexes(),
    appModels.SitterStatus.createIndexes(),
    schedModels.EmployeeVisitOffer.createIndexes(),
    schedModels.EmployeeScheduleEvent.createIndexes(),
    schedModels.EmployeeScheduleCommand.createIndexes(),
    ...Object.values(payModels).map(async (model) => {
      await model.createCollection();
      await model.createIndexes();
    })
  ]);
});

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
});

beforeEach(async () => {
  for (const { name } of await connection.db.listCollections({}, { nameOnly: true }).toArray()) {
    await connection.db.collection(name).deleteMany({});
  }
});

async function seedApprovedSitter({ email, idSeed, status = 'ACTIVE' }) {
  const appModels = sitterApplicationModels(connection);
  const User = userModel(connection);
  const contactCrypto = createContactCrypto({ lookupSecret: LOOKUP_SECRET, encryptionKey: ENC_KEY });
  const sitterId = oid();
  await User.create({ _id: sitterId, displayName: 'Sitter 06', roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0 });
  const canon = contactCrypto.lookup('EMAIL', email);
  const [application] = await appModels.SitterApplication.create([{
    ownerUserId: sitterId,
    displayName: 'Sitter 06',
    contactChannel: 'EMAIL',
    contactCiphertext: contactCrypto.encrypt(canon.canonicalValue),
    contactLookupKey: canon.lookupKey,
    identityLookupKey: hashHex(`id-${idSeed}`),
    ageEligible: true,
    ageCheckedAt: new Date(NOW - 86400000),
    experience: '2 years of pet care experience.',
    employmentType: 'FULL_TIME',
    requestedServices: ['HOME_CARE'],
    workAreas: ['cau-giay'],
    privateDocuments: [{ documentId: 'doc-1', documentType: 'IDENTITY', storageRef: 'synthetic/doc-1.jpg' }],
    state: 'APPROVED',
    provisionedUserId: sitterId,
    version: 1,
    submissionKeyDigest: hashHex(`sub-key-${idSeed}`),
    submissionPayloadDigest: hashHex(`sub-payload-${idSeed}`)
  }]);
  await appModels.SitterStatus.create({ userId: sitterId, status, changedAt: new Date(NOW - 86400000), version: 0 });
  return { sitterId, application, contactCrypto };
}

function makeApplicationService(contactCrypto, { requeueVisit } = {}) {
  const appModels = sitterApplicationModels(connection);
  return createSitterApplicationService({
    connection,
    Applicant: appModels.SitterApplication,
    User: userModel(connection),
    Audit: appModels.SitterApplicationAudit,
    DownloadQuota: appModels.SitterApplicationDownloadQuota,
    SitterStatus: appModels.SitterStatus,
    contactCrypto,
    privateMedia: { readDocument: async () => null },
    lookupSecret: LOOKUP_SECRET,
    cursorSecret: CURSOR_SECRET,
    employmentDocuments: { activate: async () => {} },
    requeueVisit,
    clock: () => NOW
  });
}

describe('UC-19 / GBR-04 / ST-CAS-12 suspending a pet sitter', () => {
  test('withdraws PENDING offers, releases unstarted ASSIGNED visits with handover flag and requeues them, while leaving IN_PROGRESS visits to finish', async () => {
    const db = connection.db;
    const schedModels = employeeSchedulingModels(connection);
    const User = userModel(connection);

    const adminId = oid();
    const customerId = oid();
    const otherSitterId = oid();
    await User.create([
      { _id: adminId, displayName: 'Admin 01', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0 },
      { _id: customerId, displayName: 'Customer 01', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 },
      { _id: otherSitterId, displayName: 'Sitter 07', roles: ['PET_SITTER'], state: 'ACTIVE', authEpoch: 0, version: 0 }
    ]);
    const { sitterId, application, contactCrypto } = await seedApprovedSitter({ email: 'sitter06.suspend@example.test', idSeed: '06' });
    await sitterApplicationModels(connection).SitterStatus.create({ userId: otherSitterId, status: 'ACTIVE', changedAt: new Date(NOW - 86400000), version: 0 });

    const bookingAssignedId = oid();
    const bookingInProgressId = oid();
    const visitPendingOfferId = oid();
    const visitAssignedId = oid();
    const visitInProgressId = oid();

    await db.collection('bookings').insertMany([
      { _id: bookingAssignedId, code: 'BK-SUS-01', customerId, state: 'ASSIGNED', carePlanState: 'APPROVED', visitIds: [visitAssignedId], version: 1, financeGuardVersion: 0 },
      { _id: bookingInProgressId, code: 'BK-SUS-02', customerId, state: 'IN_PROGRESS', carePlanState: 'APPROVED', visitIds: [visitInProgressId], version: 1, financeGuardVersion: 0 }
    ]);
    await db.collection('visits').insertMany([
      {
        _id: visitAssignedId, bookingId: bookingAssignedId, customerId, sitterId, state: 'ASSIGNED', checkInAt: null,
        assignedAt: new Date(NOW - 3600000), startAt: new Date(NOW + 24 * 3600000), endAt: new Date(NOW + 25 * 3600000),
        areaCode: 'cau-giay', version: 2, snapshots: { serviceName: 'Chăm sóc tại gia', pets: [{ name: 'Milo' }] }
      },
      {
        _id: visitInProgressId, bookingId: bookingInProgressId, customerId, sitterId, state: 'IN_PROGRESS',
        checkInAt: new Date(NOW - 15 * 60000), assignedAt: new Date(NOW - 3600000),
        startAt: new Date(NOW - 15 * 60000), endAt: new Date(NOW + 45 * 60000),
        areaCode: 'cau-giay', version: 3, snapshots: { serviceName: 'Chăm sóc tại gia', pets: [{ name: 'Milo' }] }
      }
    ]);

    const [pendingOffer] = await schedModels.EmployeeVisitOffer.create([{
      visitId: visitPendingOfferId, sitterId: String(sitterId), state: 'PENDING', version: 0,
      offeredAt: new Date(NOW - 600000), deadline: new Date(NOW + 3600000),
      startAt: new Date(NOW + 48 * 3600000), endAt: new Date(NOW + 49 * 3600000),
      serviceName: 'Chăm sóc tại gia', areaCode: 'cau-giay', pets: [{ name: 'Milo' }]
    }]);
    const [otherOffer] = await schedModels.EmployeeVisitOffer.create([{
      visitId: visitPendingOfferId, sitterId: String(otherSitterId), state: 'PENDING', version: 0,
      offeredAt: new Date(NOW - 600000), deadline: new Date(NOW + 3600000),
      startAt: new Date(NOW + 48 * 3600000), endAt: new Date(NOW + 49 * 3600000),
      serviceName: 'Chăm sóc tại gia', areaCode: 'cau-giay', pets: [{ name: 'Milo' }]
    }]);

    const requeueVisit = jest.fn(async () => {});
    const service = makeApplicationService(contactCrypto, { requeueVisit });
    const result = await service.changeSitterStatus({
      applicationId: String(application._id),
      body: { action: 'SUSPEND', reason: 'Vi phạm quy trình chăm sóc từ sự cố ST-CAS-12.', expectedVersion: 0 },
      idempotencyKey: 'suspend-st-cas-12-key-0001',
      actor: { userId: String(adminId), roles: ['ADMIN'], state: 'ACTIVE' }
    });

    expect(result).toMatchObject({ status: 'SUSPENDED', version: 1, replayed: false, withdrawnOfferCount: 1, requeuedVisitCount: 1 });
    expect((await schedModels.EmployeeVisitOffer.findById(pendingOffer._id).lean()).state).toBe('REVOKED');
    expect((await schedModels.EmployeeVisitOffer.findById(otherOffer._id).lean()).state).toBe('PENDING');

    const savedAssigned = await db.collection('visits').findOne({ _id: visitAssignedId });
    expect(savedAssigned).toMatchObject({
      state: 'SCHEDULED', sitterId: null, handoverRequired: true, handoverAccepted: false
    });
    expect(String(savedAssigned.handoverNote.previousSitterId)).toBe(String(sitterId));
    expect(savedAssigned.handoverNote.reasonCode).toBe('SITTER_SUSPENDED');
    expect(String(savedAssigned.withdrawalDispatch.sitterId)).toBe(String(sitterId));
    expect((await db.collection('bookings').findOne({ _id: bookingAssignedId })).state).toBe('DISPATCH_PENDING');
    expect(requeueVisit).toHaveBeenCalledWith(String(visitAssignedId), 3);

    const savedInProgress = await db.collection('visits').findOne({ _id: visitInProgressId });
    expect(savedInProgress.state).toBe('IN_PROGRESS');
    expect(String(savedInProgress.sitterId)).toBe(String(sitterId));
    expect((await User.findById(sitterId).lean()).state).toBe('ACTIVE');
  });

  test('suspended sitter can upload photos and check out own IN_PROGRESS visit, but cannot check in or upload for another ASSIGNED visit or accept offers', async () => {
    const db = connection.db;
    const customerId = oid();
    await userModel(connection).create({ _id: customerId, displayName: 'Customer 02', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 });
    const { sitterId } = await seedApprovedSitter({ email: 'sitter06.wf@example.test', idSeed: 'wf', status: 'SUSPENDED' });
    const sitterActor = { userId: String(sitterId), roles: ['PET_SITTER'], state: 'ACTIVE', expiresAt: NOW + 60000 };

    const petId = oid();
    const care = { schemaVersion: 1, pets: [{ id: String(petId), name: 'Milo', species: 'DOG' }] };
    const wfSnap = { version: 1, hash: workflowHash(workflowDefinition), definition: workflowDefinition };
    const careAck = { sitterId: String(sitterId), version: digest(care), acknowledgedAt: new Date(NOW - 3600000) };

    const bookingInProg = oid();
    const visitInProg = oid();
    const bookingAssigned = oid();
    const visitAssigned = oid();

    const mediaOutId = hashHex('checkout-photo-suspended-001');
    const mediaInId = hashHex('checkin-photo-suspended-001');

    await db.collection('bookings').insertMany([
      { _id: bookingInProg, code: 'BK-WF-1', customerId, state: 'IN_PROGRESS', originalVisitCount: 1, careVisitCount: 1, visitIds: [visitInProg], version: 1, financeGuardVersion: 0 },
      { _id: bookingAssigned, code: 'BK-WF-2', customerId, state: 'ASSIGNED', originalVisitCount: 1, careVisitCount: 1, visitIds: [visitAssigned], version: 1, financeGuardVersion: 0 }
    ]);
    await db.collection('visits').insertMany([
      {
        _id: visitInProg, bookingId: bookingInProg, customerId, sitterId,
        state: 'IN_PROGRESS', checkInAt: new Date(NOW - 20 * 60000), location: 'HOME',
        startAt: new Date(NOW - 20 * 60000), endAt: new Date(NOW + 40 * 60000), version: 2,
        careAcknowledgement: careAck,
        workflowResults: [{ taskKey: 'arrival:visit', stepId: 'arrival', phase: 'CHECK_IN', status: 'COMPLETED', updatedAt: new Date(NOW - 20 * 60000) }],
        snapshots: { serviceName: 'Chăm sóc tại gia', employeeServiceNetVnd: 150000, pets: care.pets, care, workflow: wfSnap }
      },
      {
        _id: visitAssigned, bookingId: bookingAssigned, customerId, sitterId,
        state: 'ASSIGNED', checkInAt: null, location: 'HOME',
        startAt: new Date(NOW + 10 * 60000), endAt: new Date(NOW + 70 * 60000), version: 1,
        careAcknowledgement: careAck,
        workflowResults: [],
        snapshots: { serviceName: 'Chăm sóc tại gia', employeeServiceNetVnd: 150000, pets: care.pets, care, workflow: wfSnap }
      }
    ]);
    await db.collection('privateimages').insertMany([
      { _id: mediaOutId, ownerId: sitterId, state: 'READY', uploadVisitId: String(visitInProg), contentType: 'image/jpeg', contentDigest: mediaOutId, byteLength: 1024 },
      { _id: mediaInId, ownerId: sitterId, state: 'READY', uploadVisitId: String(visitAssigned), contentType: 'image/jpeg', contentDigest: mediaInId, byteLength: 1024 }
    ]);

    const quota = createVisitEvidenceQuota({ connection, clock: () => NOW });
    const workflow = createVisitWorkflowService({ connection, clock: () => NOW });
    const financeSource = createBookingFinanceSourceService({ connection, clock: () => new Date(NOW) });

    // 1. IN_PROGRESS visit: suspended sitter CAN read, upload photos, complete checkout task, and check out
    await expect(financeSource.readVisit(sitterActor, String(visitInProg))).resolves.toMatchObject({ state: 'IN_PROGRESS' });
    await expect(quota({ actor: sitterActor, visitId: String(visitInProg), reserve: false })).resolves.toBeUndefined();
    const taskRes = await workflow.task(
      sitterActor,
      String(visitInProg),
      { taskKey: 'complete:visit', status: 'COMPLETED', values: {}, expectedVersion: 2 },
      'wf-checkout-suspended-001'
    );
    expect(taskRes).toMatchObject({ state: 'IN_PROGRESS', version: 3 });

    const checkedOut = await financeSource.checkOut({
      actor: sitterActor,
      visitId: String(visitInProg),
      expectedVersion: 3,
      idempotencyKey: 'co-suspended-001',
      mediaId: mediaOutId
    });
    expect(checkedOut.state).toBe('COMPLETED');
    expect((await db.collection('visits').findOne({ _id: visitInProg })).state).toBe('COMPLETED');
    expect((await db.collection('bookings').findOne({ _id: bookingInProg })).state).toBe('COMPLETED');
    // Past completed visit remains readable by the suspended sitter
    await expect(financeSource.readVisit(sitterActor, String(visitInProg))).resolves.toMatchObject({ state: 'COMPLETED' });

    // 2. Another ASSIGNED visit (not checked in): suspended sitter CANNOT upload check-in photo, run check-in task, or check in
    await expect(quota({ actor: sitterActor, visitId: String(visitAssigned), reserve: false }))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await expect(workflow.task(
      sitterActor,
      String(visitAssigned),
      { taskKey: 'arrival:visit', status: 'COMPLETED', values: {}, expectedVersion: 1 },
      'wf-checkin-suspended-001'
    )).rejects.toMatchObject({ status: 403, code: 'SITTER_NOT_ACTIVE' });
    await expect(financeSource.checkIn({
      actor: sitterActor,
      visitId: String(visitAssigned),
      expectedVersion: 1,
      idempotencyKey: 'ci-suspended-001',
      mediaId: mediaInId
    })).rejects.toMatchObject({ status: 403, code: 'SITTER_NOT_ACTIVE' });
    expect((await db.collection('visits').findOne({ _id: visitAssigned })).state).toBe('ASSIGNED');

    // 3. Employee scheduling guard blocks suspended sitter from accepting offers
    const repo = createEmployeeScheduleRepository({ connection, clock: () => NOW, coverageAreas: [] });
    await expect(connection.transaction((session) => repo.employeeGuard(String(sitterId), session)))
      .rejects.toMatchObject({ status: 409, code: 'SITTER_NOT_ELIGIBLE' });
  });

  test('when EMPLOYEE_DISPATCH_AGENT_ENABLED=false (no auto requeue), released visit appears immediately in Staff Needs Action without error', async () => {
    const db = connection.db;
    const User = userModel(connection);
    const adminId = oid();
    const staffId = oid();
    const customerId = oid();
    await User.create([
      { _id: adminId, displayName: 'Admin 01', roles: ['ADMIN'], state: 'ACTIVE', authEpoch: 0, version: 0 },
      { _id: staffId, displayName: 'Staff 01', roles: ['STAFF'], state: 'ACTIVE', authEpoch: 0, version: 0 },
      { _id: customerId, displayName: 'Customer 03', roles: ['CUSTOMER'], state: 'ACTIVE', authEpoch: 0, version: 0 }
    ]);
    const { sitterId, application, contactCrypto } = await seedApprovedSitter({ email: 'sitter06.noagent@example.test', idSeed: 'noagent' });

    const bookingId = oid();
    const visitId = oid();
    await db.collection('bookings').insertOne({
      _id: bookingId, code: 'BK-NO-AGENT', customerId, state: 'ASSIGNED',
      carePlanState: 'APPROVED', paymentMode: 'PREPAY', paymentState: 'PAID',
      visitIds: [visitId], version: 1, financeGuardVersion: 0
    });
    // Start > 24h away so it would NOT appear in Needs Action unless dispatchReview is flagged
    await db.collection('visits').insertOne({
      _id: visitId, bookingId, customerId, sitterId, state: 'ASSIGNED', checkInAt: null,
      assignedAt: new Date(NOW - 3600000), startAt: new Date(NOW + 48 * 3600000), endAt: new Date(NOW + 49 * 3600000),
      areaCode: 'cau-giay', version: 1, snapshots: { serviceName: 'Chăm sóc tại gia', pets: [{ name: 'Milo' }] }
    });

    // No requeueVisit supplied -> mirrors EMPLOYEE_DISPATCH_AGENT_ENABLED=false
    const service = makeApplicationService(contactCrypto, { requeueVisit: undefined });
    const res = await service.changeSitterStatus({
      applicationId: String(application._id),
      body: { action: 'SUSPEND', reason: 'Tạm ngưng khi tắt auto dispatch.', expectedVersion: 0 },
      idempotencyKey: 'suspend-no-agent-key-0001',
      actor: { userId: String(adminId), roles: ['ADMIN'], state: 'ACTIVE' }
    });
    expect(res).toMatchObject({ status: 'SUSPENDED', requeuedVisitCount: 1 });

    const saved = await db.collection('visits').findOne({ _id: visitId });
    expect(saved.state).toBe('SCHEDULED');
    expect(saved.sitterId).toBeNull();
    expect(saved.handoverRequired).toBe(true);
    expect(saved.dispatchReview?.code).toBe('STAFF_REVIEW_REQUIRED');

    // Verify visit appears immediately in Staff's Needs Action board
    const repo = createEmployeeScheduleRepository({ connection, clock: () => NOW, coverageAreas: [] });
    const needsAction = createNeedsActionService({ repository: repo, clock: () => NOW, cursorSecret: CURSOR_SECRET });
    const board = await needsAction.list({ userId: String(staffId), roles: ['STAFF'], state: 'ACTIVE' }, { tab: 'needs-action' });
    expect(board.counts.needsAction).toBe(1);
    expect(board.items).toHaveLength(1);
    expect(board.items[0].id).toBe(String(visitId));
    expect(board.items[0].reviewCode).toBe('STAFF_REVIEW_REQUIRED');
    expect(board.items[0].reasons.map((r) => r.code)).toContain('NO_SITTER_TO_OFFER');
  });
});
