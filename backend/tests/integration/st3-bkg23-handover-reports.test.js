import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import sharp from 'sharp';
import { employeeSchedulingRuntimeModule } from '../../src/routes/employee-scheduling.routes.js';
import { privateImageModule } from '../../src/routes/private-image.routes.js';
import { errorHandler, notFound, requestId } from '../../src/middlewares/http.js';
import { requireCsrf, requireSession } from '../../src/middlewares/session.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { privateImageModels } from '../../src/models/private-image.model.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { reasonsOfVisit } from '../../src/services/employee-scheduling/needs-action.service.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';
import { createPrivateImageService } from '../../src/services/private-image.service.js';
import { workflowHash } from '../../src/services/care/workflow-snapshot.service.js';

const oid = () => new mongoose.Types.ObjectId();
const nowMs = Date.parse('2026-11-28T03:00:00Z');
const clock = () => nowMs;
const windows = Array.from({ length: 7 }, (_, index) => ({
  weekday: index + 1,
  startLocalTime: '00:00',
  endLocalTime: '23:59'
}));
const HOME_COORDS = [105.847, 21.018];
const actor = (role, name) => ({ userId: String(oid()), displayName: name, state: 'ACTIVE', roles: [role], authEpoch: 0 });
const staff = actor('STAFF', 'Nhân viên điều phối');
const customer = actor('CUSTOMER', 'Khách hàng thử');

let replica, connection, scheduling, payroll, app, mediaStore, privateImages, pngBytes;
const serviceId = oid();

async function createSitter(name) {
  const sitter = actor('PET_SITTER', name);
  const sitterOid = new mongoose.Types.ObjectId(sitter.userId);
  await connection.collection('users').insertOne({
    _id: sitterOid,
    displayName: name,
    state: 'ACTIVE',
    roles: ['PET_SITTER'],
    authEpoch: 0,
    synthetic: false
  });
  await connection.collection('sitterstatuses').insertOne({ userId: sitterOid, status: 'ACTIVE' });
  await payroll.EmploymentContract.create({
    employeeId: sitterOid,
    version: 1,
    employmentType: 'PART_TIME',
    salaryBasis: 'GROSS',
    monthlyBaseVnd: 3000000,
    payCycle: 'MONTHLY',
    weeklyMinutes: 2400,
    signedAt: new Date(nowMs - 7 * 86400000),
    effectiveAt: new Date(nowMs - 7 * 86400000),
    contractReference: `HD-${sitter.userId}`,
    workplaceRegion: 1,
    workplaceReference: 'Hà Nội',
    verifiedBy: new mongoose.Types.ObjectId(staff.userId),
    recordedAt: new Date(nowMs - 7 * 86400000)
  });
  const dates = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
  await scheduling.repository.models.EmployeeAvailability.create({
    _id: sitter.userId,
    zone: 'Asia/Ho_Chi_Minh',
    workingWindows: windows,
    areas: ['DISTRICT_HAI_BA_TRUNG'],
    dayOffDates: [],
    state: 'ACTIVE',
    version: 1,
    effectiveFrom: dates[0]
  });
  await scheduling.repository.models.EmployeeAvailabilityRevision.create({
    sitterId: sitter.userId,
    effectiveFrom: dates[0],
    workingWindows: windows,
    version: 1
  });
  await connection.collection('aisitterprofiles').insertOne({
    userId: sitterOid,
    active: true,
    serviceIds: [serviceId],
    species: ['DOG'],
    maxPets: 3,
    maxWeightKg: 30,
    allowedTraits: [],
    dayOffDates: [],
    starts: dates.map(localDate => ({
      localDate,
      point: { type: 'Point', coordinates: HOME_COORDS },
      availableFrom: new Date(`${localDate}T00:00:00+07:00`),
      availableUntil: new Date(`${localDate}T23:59:00+07:00`)
    }))
  });
  return sitter;
}

async function seedBoundPhoto({ ownerId, visitId, kind }) {
  const uploaded = await privateImages.upload({
    actor: { userId: ownerId, state: 'ACTIVE', roles: ['PET_SITTER'], synthetic: false },
    body: pngBytes,
    contentType: 'image/png',
    idempotencyKey: `img-${oid()}-${oid()}`
  });
  const stored = await connection.collection('privateimages').findOne({ _id: uploaded.id });
  await connection.collection('privateimages').updateOne(
    { _id: uploaded.id },
    { $set: { careVisitId: String(visitId), careKind: kind } }
  );
  await connection.collection('caremediabindings').insertOne({
    _id: uploaded.id,
    visitId: String(visitId),
    ownerId: String(ownerId),
    kind,
    contentDigest: stored.contentDigest,
    createdAt: new Date(nowMs)
  });
  return { mediaId: uploaded.id, contentDigest: stored.contentDigest };
}

const headersFor = (user, key) => ({
  'x-test-actor': user.userId,
  'X-CSRF-Token': 'synthetic-csrf',
  Host: 'localhost',
  Origin: 'http://localhost',
  ...(key ? { 'Idempotency-Key': key } : {})
});

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_st3_bkg23' }).asPromise();
  await provisionFinanceSources(connection);
  await provisionEmployeeScheduling(connection);
  payroll = payrollModels(connection);
  for (const model of [...Object.values(payroll), ...Object.values(privateImageModels(connection))]) {
    await model.createCollection().catch(() => {});
    await model.createIndexes().catch(() => {});
  }
  for (const person of [staff, customer]) {
    await connection.collection('users').insertOne({
      _id: new mongoose.Types.ObjectId(person.userId),
      displayName: person.displayName,
      state: 'ACTIVE',
      roles: person.roles,
      authEpoch: 0,
      synthetic: false
    });
  }
  const sessionService = {
    async authenticate(req) {
      const userId = req.get('x-test-actor');
      if (!userId) return null;
      const row = await connection.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
      return row ? { ...row, userId, expiresAt: nowMs + 60000 } : null;
    },
    verifyCsrf: async (_actor, token) => token === 'synthetic-csrf'
  };
  scheduling = employeeSchedulingRuntimeModule({
    connection,
    config: { auth: { enabled: true } },
    clock,
    sessionService,
    env: { EMPLOYEE_SCHEDULING_ENABLED: 'true', EMPLOYEE_DISPATCH_AGENT_ENABLED: 'true' }
  });
  mediaStore = new Map();
  const media = {
    upload: async value => mediaStore.set(value.storageRef, { body: Buffer.from(value.body), contentType: value.contentType }),
    read: async value => mediaStore.get(value.storageRef)
  };
  const secret = 'synthetic-st3-bkg23-media-secret-32-chars';
  privateImages = createPrivateImageService({ connection, media, secret, maxImagesPerUser: 20 });
  const imageRoute = privateImageModule({
    connection,
    media,
    secret,
    maxImagesPerUser: 20,
    requireAuthenticated: requireSession(sessionService, { clock }),
    csrf: requireCsrf(sessionService),
    clock
  });
  for (const model of Object.values(connection.models)) {
    await model.createCollection().catch(() => {});
    await model.createIndexes().catch(() => {});
  }
  pngBytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#2d7a5b' } }).png().toBuffer();

  app = express();
  app.use(express.json(), requestId);
  app.use(imageRoute.mount, imageRoute.router);
  app.use(scheduling.mount, scheduling.router);
  app.use(notFound, errorHandler(() => {}));
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('ST-BKG-23 withdrawal re-offer and handover earlier care reports', () => {
  test('GBR-21 early withdrawal on visit 2 of an IN_PROGRESS booking re-offers to 5 other sitters with handover', async () => {
    const sitters = [];
    for (let i = 1; i <= 6; i++) sitters.push(await createSitter(`Sitter Reoffer ${i}`));
    const sitterA = sitters[0];
    const bookingId = oid();
    const visit1Id = oid();
    const visit2Id = oid();
    const petSnapshot = [{ id: String(oid()), name: 'Milo', species: 'DOG', weightKg: 5, traits: [] }];
    const baseSnapshot = {
      serviceName: 'Chăm sóc tại nhà',
      serviceAddress: '15 Trần Nhân Tông, Hai Bà Trưng, Hà Nội',
      point: { type: 'Point', coordinates: HOME_COORDS },
      pets: petSnapshot,
      checklistItemIds: ['pet-condition'],
      checklistItems: [{ itemId: 'pet-condition', label: 'Kiểm tra thú cưng' }],
      care: { schemaVersion: 1, capturedAt: new Date(nowMs - 86400000), privateAccessNotes: 'CODE-1', pets: petSnapshot }
    };
    await connection.collection('bookings').insertOne({
      _id: bookingId,
      customerId: new mongoose.Types.ObjectId(customer.userId),
      state: 'IN_PROGRESS',
      carePlanState: 'APPROVED',
      paymentMode: 'PREPAY',
      paymentState: 'PAID',
      paymentSnapshot: { amountVnd: 300000, currency: 'VND' },
      visitIds: [visit1Id, visit2Id],
      version: 1
    });
    await connection.collection('payments').insertOne({
      _id: oid(),
      bookingId,
      state: 'VERIFIED',
      receiptMoney: { amountVnd: 300000, currency: 'VND' }
    });
    await connection.collection('visits').insertMany([
      {
        _id: visit1Id,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(sitterA.userId),
        state: 'COMPLETED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs - 4 * 3600000),
        endAt: new Date(nowMs - 3 * 3600000),
        checkInAt: new Date(nowMs - 4 * 3600000),
        checkOutAt: new Date(nowMs - 3 * 3600000),
        version: 3,
        snapshots: baseSnapshot
      },
      {
        _id: visit2Id,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(sitterA.userId),
        state: 'ASSIGNED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs + 20 * 3600000),
        endAt: new Date(nowMs + 21 * 3600000),
        assignedAt: new Date(nowMs - 2 * 3600000),
        checkInAt: null,
        version: 2,
        snapshots: baseSnapshot
      }
    ]);

    const res = await request(app)
      .post(`/api/v1/employee-scheduling/visits/${visit2Id}/withdrawals`)
      .set(headersFor(sitterA, 'st3-bkg23-early-wd'))
      .send({ expectedVersion: 2, expectedMode: 'EARLY', reasonCode: 'ILLNESS', note: 'Ốm đột xuất' })
      .expect(200);

    expect(res.body.data).toMatchObject({ visitId: String(visit2Id), mode: 'EARLY', version: 3 });
    const stored = await connection.collection('visits').findOne({ _id: visit2Id });
    expect(stored).toMatchObject({
      state: 'SCHEDULED',
      sitterId: null,
      handoverRequired: true,
      handoverAccepted: false,
      handoverNote: { reasonCode: 'ILLNESS' }
    });
    expect(stored.dispatchReview).toBeUndefined();
    const pendingOffers = await scheduling.repository.models.EmployeeVisitOffer
      .find({ visitId: visit2Id, state: 'PENDING' })
      .lean();
    expect(pendingOffers).toHaveLength(5);
    expect(pendingOffers.map(offer => offer.sitterId).sort())
      .toEqual(sitters.slice(1).map(item => item.userId).sort());

    await scheduling.repository.models.EmployeeAvailability.deleteMany({
      _id: { $in: sitters.map(item => item.userId) }
    });
  });

  test('GBR-21 requeueWithdrawal records dispatchReview for Needs action when a non-409 error stops re-offering', async () => {
    const sitterA = await createSitter('Sitter Err A');
    const bookingId = oid();
    const visitId = oid();
    const startAt = new Date(nowMs + 20 * 3600000);
    await connection.collection('bookings').insertOne({
      _id: bookingId,
      customerId: new mongoose.Types.ObjectId(customer.userId),
      state: 'DISPATCH_PENDING',
      carePlanState: 'APPROVED',
      paymentMode: 'POSTPAY',
      paymentState: 'UNPAID',
      visitIds: [visitId],
      version: 1
    });
    await connection.collection('visits').insertOne({
      _id: visitId,
      bookingId,
      customerId: new mongoose.Types.ObjectId(customer.userId),
      serviceId,
      sitterId: null,
      state: 'SCHEDULED',
      location: 'HOME',
      areaCode: 'DISTRICT_HAI_BA_TRUNG',
      startAt,
      endAt: new Date(startAt.getTime() + 3600000),
      handoverRequired: true,
      handoverAccepted: false,
      withdrawalDispatch: { sitterId: new mongoose.Types.ObjectId(sitterA.userId) },
      version: 3,
      snapshots: {
        serviceName: 'Chăm sóc tại nhà',
        serviceAddress: '15 Trần Nhân Tông',
        pets: [{ id: String(oid()), name: 'Milo', species: 'DOG', weightKg: 5, traits: [] }]
      }
    });

    const spy = jest.spyOn(scheduling.dispatch, 'invite').mockRejectedValueOnce(new Error('synthetic_transient_500'));
    try {
      await expect(scheduling.dispatch.requeueWithdrawal(String(visitId), 3)).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }

    const stored = await connection.collection('visits').findOne({ _id: visitId });
    expect(stored.dispatchReview).toMatchObject({ code: 'STAFF_REVIEW_REQUIRED' });
    expect(stored.dispatchReview.retryAt).toBeInstanceOf(Date);
    expect(reasonsOfVisit(stored, nowMs).map(reason => reason.code)).toContain('NO_SITTER_TO_OFFER');
    expect(await connection.collection('notifications').countDocuments({
      eventType: 'DispatchReviewRequired',
      recipientId: staff.userId,
      'metadata.visitId': String(visitId)
    })).toBe(1);

    await scheduling.repository.models.EmployeeAvailability.deleteMany({ _id: sitterA.userId });
  });

  test('UC-41 / UC-45 Permission Matrix note 19 scopes earlier care reports and photos strictly to the pending handover replacement', async () => {
    const previousSitter = await createSitter('Lê Văn Minh');
    const replacement = await createSitter('Nguyễn Thị Lan');
    const otherSitter = await createSitter('Phạm Quốc Bảo');

    const bookingId = oid();
    const otherBookingId = oid();
    const v1LegacyId = oid();
    const v1bWorkflowId = oid();
    const v1cNotDoneId = oid();
    const v2HandoverId = oid();
    const v3LaterDoneId = oid();
    const vOrdinaryId = oid();
    const vOtherBookingDoneId = oid();

    const checkInPhoto = await seedBoundPhoto({ ownerId: previousSitter.userId, visitId: v1LegacyId, kind: 'CHECK_IN' });
    const checkOutPhoto = await seedBoundPhoto({ ownerId: previousSitter.userId, visitId: v1LegacyId, kind: 'CHECK_OUT' });
    const wfVisiblePhoto = await seedBoundPhoto({ ownerId: previousSitter.userId, visitId: v1bWorkflowId, kind: 'WF:step-feed:visit:slot-bowl' });
    const wfHiddenPhoto = await seedBoundPhoto({ ownerId: previousSitter.userId, visitId: v1bWorkflowId, kind: 'WF:step-internal:visit:slot-int' });

    const petObj = { id: String(oid()), name: 'Milo', species: 'DOG', weightKg: 5, traits: [] };
    const wfDefinition = {
      title: 'Quy trình chăm sóc tại nhà',
      steps: [
        {
          stepId: 'step-feed',
          phase: 'EXECUTION',
          scope: 'VISIT',
          title: 'Cho ăn đúng khẩu phần',
          required: true,
          canSkip: false,
          customerVisible: true,
          locations: ['HOME'],
          species: ['DOG'],
          fields: [],
          photoSlots: [{ photoSlotId: 'slot-bowl', title: 'Ảnh bát ăn', minPhotos: 1, maxPhotos: 2 }]
        },
        {
          stepId: 'step-internal',
          phase: 'EXECUTION',
          scope: 'VISIT',
          title: 'Ghi chú nội bộ ẩn với khách',
          required: false,
          canSkip: true,
          customerVisible: false,
          locations: ['HOME'],
          species: ['DOG'],
          fields: [],
          photoSlots: [{ photoSlotId: 'slot-int', title: 'Ảnh nội bộ', minPhotos: 0, maxPhotos: 1 }]
        }
      ]
    };
    const workflowSnapshot = { revision: 2, hash: workflowHash(wfDefinition), definition: wfDefinition };

    await connection.collection('bookings').insertMany([
      {
        _id: bookingId,
        bookingCode: 'BK-2301',
        customerId: new mongoose.Types.ObjectId(customer.userId),
        state: 'IN_PROGRESS',
        carePlanState: 'APPROVED',
        paymentMode: 'PREPAY',
        paymentState: 'PAID',
        visitIds: [v1LegacyId, v1bWorkflowId, v1cNotDoneId, v2HandoverId, v3LaterDoneId, vOrdinaryId],
        checkoutSnapshot: { consentAt: new Date(nowMs - 5 * 86400000) }
      },
      {
        _id: otherBookingId,
        bookingCode: 'BK-OTHER',
        customerId: new mongoose.Types.ObjectId(customer.userId),
        state: 'IN_PROGRESS',
        carePlanState: 'APPROVED',
        visitIds: [vOtherBookingDoneId]
      }
    ]);

    const careSnap = note => ({
      schemaVersion: 1,
      capturedAt: new Date(nowMs - 5 * 86400000),
      privateAccessNotes: note,
      pets: [{ ...petObj, careProfile: { feeding: { status: 'KNOWN', value: 'Ăn 2 bữa hạt' } } }]
    });

    await connection.collection('visits').insertMany([
      {
        _id: v1LegacyId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(previousSitter.userId),
        state: 'COMPLETED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs - 26 * 3600000),
        endAt: new Date(nowMs - 25 * 3600000),
        checkInAt: new Date(nowMs - 26 * 3600000 + 120000),
        checkOutAt: new Date(nowMs - 25 * 3600000 - 60000),
        customerNote: 'Milo ăn ngon miệng và uống đủ nước.',
        checklist: [
          { itemId: 'feed', status: 'DONE' },
          { itemId: 'walk', status: 'SKIPPED', reason: 'Trời mưa to' }
        ],
        evidenceRefs: [
          { kind: 'CHECK_IN', mediaId: checkInPhoto.mediaId },
          { kind: 'CHECK_OUT', mediaId: checkOutPhoto.mediaId }
        ],
        version: 4,
        snapshots: {
          serviceName: 'Chăm sóc tại nhà',
          serviceAddress: '15 Trần Nhân Tông',
          pets: [petObj],
          checklistItemIds: ['feed', 'walk'],
          checklistItems: [
            { itemId: 'feed', label: 'Cho ăn và thay nước' },
            { itemId: 'walk', label: 'Đi dạo nhẹ 15 phút' }
          ],
          care: careSnap('SECRET_DOOR_CODE_V1')
        }
      },
      {
        _id: v1bWorkflowId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(previousSitter.userId),
        state: 'STAFF_CLOSED',
        closureVerification: { outcome: 'SERVICE_PERFORMED' },
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs - 14 * 3600000),
        endAt: new Date(nowMs - 13 * 3600000),
        checkInAt: new Date(nowMs - 14 * 3600000),
        checkOutAt: new Date(nowMs - 13 * 3600000),
        customerNote: 'Milo ngoan suốt buổi.',
        workflowResults: [
          {
            taskKey: 'step-feed:visit',
            status: 'COMPLETED',
            note: 'Ăn hết bát',
            updatedAt: new Date(nowMs - 13.5 * 3600000),
            evidence: [{
              mediaId: wfVisiblePhoto.mediaId,
              kind: 'WF:step-feed:visit:slot-bowl',
              photoSlotId: 'slot-bowl',
              uploadedBy: previousSitter.userId,
              contentDigest: wfVisiblePhoto.contentDigest,
              receivedAt: new Date(nowMs - 13.5 * 3600000)
            }]
          },
          {
            taskKey: 'step-internal:visit',
            status: 'COMPLETED',
            note: 'INTERNAL_ONLY_SECRET_NOTE',
            updatedAt: new Date(nowMs - 13.4 * 3600000),
            evidence: [{
              mediaId: wfHiddenPhoto.mediaId,
              kind: 'WF:step-internal:visit:slot-int',
              photoSlotId: 'slot-int',
              uploadedBy: previousSitter.userId,
              contentDigest: wfHiddenPhoto.contentDigest,
              receivedAt: new Date(nowMs - 13.4 * 3600000)
            }]
          }
        ],
        evidenceRefs: [],
        version: 4,
        snapshots: {
          serviceName: 'Chăm sóc tại nhà',
          serviceAddress: '15 Trần Nhân Tông',
          pets: [petObj],
          workflow: workflowSnapshot,
          care: careSnap('SECRET_DOOR_CODE_V1B')
        }
      },
      {
        _id: v1cNotDoneId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(previousSitter.userId),
        state: 'ASSIGNED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs - 2 * 3600000),
        endAt: new Date(nowMs - 1 * 3600000),
        version: 1,
        snapshots: { serviceName: 'Chăm sóc tại nhà', pets: [petObj], care: careSnap('SECRET_DOOR_V1C') }
      },
      {
        _id: v2HandoverId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(replacement.userId),
        state: 'ASSIGNED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs + 20 * 3600000),
        endAt: new Date(nowMs + 21 * 3600000),
        assignedAt: new Date(nowMs - 1800000),
        checkInAt: null,
        handoverRequired: true,
        handoverAccepted: false,
        handoverNote: { previousSitterId: new mongoose.Types.ObjectId(previousSitter.userId), reasonCode: 'ILLNESS', flaggedAt: new Date(nowMs - 3600000) },
        version: 3,
        snapshots: {
          serviceName: 'Chăm sóc tại nhà',
          serviceAddress: '15 Trần Nhân Tông',
          pets: [petObj],
          checklistItems: [{ itemId: 'feed', label: 'Cho ăn và thay nước' }],
          care: careSnap('SECRET_DOOR_CODE_V2')
        }
      },
      {
        _id: v3LaterDoneId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(previousSitter.userId),
        state: 'COMPLETED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs + 44 * 3600000),
        endAt: new Date(nowMs + 45 * 3600000),
        version: 2,
        snapshots: { serviceName: 'Chăm sóc tại nhà', pets: [petObj], care: careSnap('SECRET_DOOR_V3') }
      },
      {
        _id: vOrdinaryId,
        bookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(replacement.userId),
        state: 'ASSIGNED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs + 30 * 3600000),
        endAt: new Date(nowMs + 31 * 3600000),
        checkInAt: null,
        handoverRequired: false,
        version: 1,
        snapshots: { serviceName: 'Chăm sóc tại nhà', pets: [petObj], care: careSnap('SECRET_DOOR_ORD') }
      },
      {
        _id: vOtherBookingDoneId,
        bookingId: otherBookingId,
        customerId: new mongoose.Types.ObjectId(customer.userId),
        serviceId,
        sitterId: new mongoose.Types.ObjectId(previousSitter.userId),
        state: 'COMPLETED',
        location: 'HOME',
        areaCode: 'DISTRICT_HAI_BA_TRUNG',
        startAt: new Date(nowMs - 20 * 3600000),
        endAt: new Date(nowMs - 19 * 3600000),
        version: 2,
        snapshots: { serviceName: 'Chăm sóc tại nhà', pets: [petObj], care: careSnap('SECRET_DOOR_OTHER') }
      }
    ]);

    const handoverPath = `/api/v1/employee-scheduling/visits/${v2HandoverId}/handover`;
    const reportPath = targetId => `${handoverPath}/reports/${targetId}`;

    // 1. Handover summary lists earlier completed visits with visitId
    const handoverRes = await request(app).get(handoverPath).set(headersFor(replacement)).expect(200);
    expect(handoverRes.body.data.reports).toHaveLength(2);
    expect(handoverRes.body.data.reports.map(item => item.visitId)).toEqual([String(v1LegacyId), String(v1bWorkflowId)]);

    // 2. Replacement reads legacy Care Report and photos BEFORE confirming handover
    const legacyRes = await request(app).get(reportPath(v1LegacyId)).set(headersFor(replacement)).expect(200);
    expect(legacyRes.body.data).toMatchObject({
      id: String(v1LegacyId),
      sitterName: 'Lê Văn Minh',
      customerNote: 'Milo ăn ngon miệng và uống đủ nước.',
      checklist: [
        { itemId: 'feed', label: 'Cho ăn và thay nước', status: 'DONE' },
        { itemId: 'walk', label: 'Đi dạo nhẹ 15 phút', status: 'SKIPPED', reason: 'Trời mưa to' }
      ],
      evidence: [
        { kind: 'CHECK_IN', mediaId: checkInPhoto.mediaId },
        { kind: 'CHECK_OUT', mediaId: checkOutPhoto.mediaId }
      ]
    });
    expect(legacyRes.text).not.toMatch(/privateAccessNotes|SECRET_DOOR_CODE/);

    await request(app).get(`/api/v1/private-images/${checkInPhoto.mediaId}/content`).set(headersFor(replacement)).expect(200);
    await request(app).get(`/api/v1/private-images/${checkOutPhoto.mediaId}/content`).set(headersFor(replacement)).expect(200);

    // 3. Replacement reads workflow Care Report (only customerVisible steps & photos)
    const wfRes = await request(app).get(reportPath(v1bWorkflowId)).set(headersFor(replacement)).expect(200);
    expect(wfRes.body.data.workflow.tasks.map(task => task.taskKey)).toEqual(['step-feed:visit']);
    expect(wfRes.text).not.toMatch(/INTERNAL_ONLY_SECRET_NOTE|SECRET_DOOR_CODE|privateAccessNotes/);
    await request(app).get(`/api/v1/private-images/${wfVisiblePhoto.mediaId}/content`).set(headersFor(replacement)).expect(200);
    await request(app).get(`/api/v1/private-images/${wfHiddenPhoto.mediaId}/content`).set(headersFor(replacement)).expect(404);

    // 4. Unauthorized / out-of-scope targets rejected
    await request(app).get(reportPath(v1LegacyId)).set(headersFor(otherSitter)).expect(404);
    await request(app).get(`/api/v1/private-images/${checkInPhoto.mediaId}/content`).set(headersFor(otherSitter)).expect(404);
    await request(app).get(reportPath(v1LegacyId)).set(headersFor(customer)).expect(403);
    await request(app).get(reportPath(v1cNotDoneId)).set(headersFor(replacement)).expect(404);
    await request(app).get(reportPath(v3LaterDoneId)).set(headersFor(replacement)).expect(404);
    await request(app).get(reportPath(vOtherBookingDoneId)).set(headersFor(replacement)).expect(404);
    await request(app).get(reportPath(v2HandoverId)).set(headersFor(replacement)).expect(404);
    await request(app).get(`/api/v1/employee-scheduling/visits/${vOrdinaryId}/handover/reports/${v1LegacyId}`)
      .set(headersFor(replacement)).expect(404);

    // 5. After confirming handover -> denied for both report and photos (Permission Matrix note 19)
    const confirmBody = {
      expectedVersion: handoverRes.body.data.version,
      careVersion: handoverRes.body.data.care.version,
      acknowledged: true
    };
    await request(app)
      .post(`/api/v1/employee-scheduling/visits/${v2HandoverId}/handover-confirmations`)
      .set(headersFor(replacement, 'st3-bkg23-confirm-handover'))
      .send(confirmBody)
      .expect(200);

    await request(app).get(reportPath(v1LegacyId)).set(headersFor(replacement)).expect(404);
    await request(app).get(`/api/v1/private-images/${checkInPhoto.mediaId}/content`).set(headersFor(replacement)).expect(404);
    await request(app).get(`/api/v1/private-images/${wfVisiblePhoto.mediaId}/content`).set(headersFor(replacement)).expect(404);

    // 6. Pending handover again -> if sitter is removed or already checked in -> denied for both report and photos
    await connection.collection('visits').updateOne(
      { _id: v2HandoverId },
      { $set: { handoverAccepted: false, checkInAt: new Date(nowMs) } }
    );
    await request(app).get(reportPath(v1LegacyId)).set(headersFor(replacement)).expect(404);
    await request(app).get(`/api/v1/private-images/${checkInPhoto.mediaId}/content`).set(headersFor(replacement)).expect(404);

    await connection.collection('visits').updateOne(
      { _id: v2HandoverId },
      { $set: { checkInAt: null, sitterId: new mongoose.Types.ObjectId(otherSitter.userId) } }
    );
    await request(app).get(reportPath(v1LegacyId)).set(headersFor(replacement)).expect(404);
    await request(app).get(`/api/v1/private-images/${checkInPhoto.mediaId}/content`).set(headersFor(replacement)).expect(404);

    await scheduling.repository.models.EmployeeAvailability.deleteMany({
      _id: { $in: [previousSitter.userId, replacement.userId, otherSitter.userId] }
    });
  });
});
