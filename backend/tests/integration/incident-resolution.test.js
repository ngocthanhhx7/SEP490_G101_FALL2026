import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import request from 'supertest';
import { financeSourceRuntime } from '../../src/routes/finance-source-runtime.js';
import { errorHandler, notFound, requestId } from '../../src/middlewares/http.js';
import { provisionFinanceSources } from '../../src/services/settlements/source-provisioning.js';

const oid = () => new mongoose.Types.ObjectId();
const customerId = oid();
const sitterId = oid();
const staffId = oid();
const adminId = oid();
const applicationId = oid();
const now = () => Date.parse('2026-11-26T02:00:00Z');

let replica;
let connection;
let app;

const actors = {
  sitter: { userId: String(sitterId), roles: ['PET_SITTER'], state: 'ACTIVE' },
  customer: { userId: String(customerId), roles: ['CUSTOMER'], state: 'ACTIVE' },
  staff: { userId: String(staffId), roles: ['STAFF'], state: 'ACTIVE' },
  admin: { userId: String(adminId), roles: ['ADMIN'], state: 'ACTIVE' }
};

const sessionService = {
  async authenticate(req) {
    const found = actors[req.get('x-test-actor')];
    return found ? { ...found, expiresAt: now() + 60000 } : null;
  },
  verifyCsrf: async () => true
};

function post(actor, path, body, key) {
  return request(app)
    .post(path)
    .set('Host', '127.0.0.1')
    .set('Origin', 'http://127.0.0.1')
    .set('x-test-actor', actor)
    .set('X-CSRF-Token', 'synthetic-csrf')
    .set('Idempotency-Key', key)
    .send(body);
}

async function seedIncident({ paidVnd = 300000, priorRefundVnd = 0, visitNetVnd = 100000 } = {}) {
  const db = connection.db;
  const bookingId = oid();
  const visitId = oid();
  const caseId = oid();
  await db.collection('bookings').insertOne({
    _id: bookingId,
    code: 'BK-INC-01',
    customerId,
    state: 'IN_PROGRESS',
    paymentMode: 'PREPAY',
    paymentState: 'PAID',
    visitIds: [visitId],
    originalVisitCount: 1,
    careVisitCount: 1,
    version: 0
  });
  await db.collection('visits').insertOne({
    _id: visitId,
    bookingId,
    customerId,
    sitterId,
    state: 'IN_PROGRESS',
    version: 0,
    snapshots: {
      serviceName: 'Chăm sóc tại nhà',
      baseVnd: visitNetVnd,
      surchargeVnd: 0,
      discountVnd: 0,
      employeeServiceNetVnd: visitNetVnd
    },
    evidenceRefs: []
  });
  await db.collection('payments').insertOne({
    _id: oid(),
    bookingId,
    state: 'VERIFIED',
    provider: 'PAYOS',
    providerEventId: `evt-${String(bookingId)}`,
    receiptMoney: { currency: 'VND', amountVnd: paidVnd }
  });
  if (priorRefundVnd > 0) {
    await db.collection('refunds').insertOne({
      _id: `cancel:${visitId}:prior`,
      bookingId,
      sourceType: 'BOOKING_CANCELLATION',
      currency: 'VND',
      amountVnd: priorRefundVnd,
      state: 'RECORDED',
      disposition: 'ACCOUNTING_REFUND',
      recordedAt: new Date(now()),
      version: 0
    });
  }
  await db.collection('cases').insertOne({
    _id: caseId,
    id: String(caseId),
    kind: 'INCIDENT',
    visitId: String(visitId),
    bookingId,
    customerId: String(customerId),
    sitterId: String(sitterId),
    category: 'HEALTH_OBSERVATION',
    severity: 'HIGH',
    urgency: 'URGENT',
    description: 'Thú cưng bị trầy nhẹ trong buổi chăm sóc.',
    state: 'OPEN',
    version: 0,
    evidenceRefs: [],
    timeline: [{ type: 'INCIDENT_REPORTED', note: 'Thú cưng bị trầy nhẹ.', occurredAt: new Date(now()).toISOString(), actorId: String(sitterId), actorRole: 'PET_SITTER' }],
    createdAt: new Date(now()).toISOString(),
    openedAt: new Date(now()).toISOString(),
    financialHold: true
  });
  return { bookingId: String(bookingId), visitId: String(visitId), caseId: String(caseId) };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_incident_resolution' }).asPromise();
  await provisionFinanceSources(connection);
  const db = connection.db;
  for (const name of ['notifications', 'employeeschedulecommands', 'employeescheduleevents', 'privateimages', 'sitterapplications']) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).toArray();
    if (!exists.length) await db.createCollection(name);
  }
  await db.collection('users').insertMany([
    { _id: sitterId, displayName: 'Lê Văn Sitter', roles: ['PET_SITTER'], state: 'ACTIVE' },
    { _id: customerId, displayName: 'Nguyễn Thị Khách', roles: ['CUSTOMER'], state: 'ACTIVE' },
    { _id: staffId, displayName: 'Trần Nhân Viên', roles: ['STAFF'], state: 'ACTIVE' },
    { _id: adminId, displayName: 'Phạm Quản Trị', roles: ['ADMIN'], state: 'ACTIVE' }
  ]);
  await db.collection('sitterstatuses').insertOne({ userId: sitterId, status: 'ACTIVE' });
  await db.collection('sitterapplications').insertOne({
    _id: applicationId,
    provisionedUserId: sitterId,
    state: 'APPROVED',
    updatedAt: new Date(now())
  });

  app = express();
  app.use(requestId);
  app.use(express.json());
  const mod = financeSourceRuntime({
    config: { auth: { enabled: true, tokenSecret: 'synthetic-incident-resolution-secret-012345' } },
    connection,
    sessionService,
    clock: now,
    env: { FINANCE_SOURCES_ENABLED: 'true' }
  });
  app.use('/api/v1', mod.router);
  app.use(notFound, errorHandler(() => {}));
}, 600000);

afterAll(async () => {
  await connection?.close();
  await replica?.stop();
}, 30000);

describe('Part B: ST-CAS-12 propose sitter suspension from incident', () => {
  test('Staff sends suspension proposal once (moves OPEN to UNDER_REVIEW, logs timeline, notifies Admin); second attempt and non-Staff are blocked', async () => {
    const { caseId } = await seedIncident();

    await post('customer', `/api/v1/cases/${caseId}/suspension-proposals`, { expectedVersion: 0 }, 'susp-cust-0001').expect(403);
    await post('sitter', `/api/v1/cases/${caseId}/suspension-proposals`, { expectedVersion: 0 }, 'susp-sit-0001').expect(403);

    const ok = await post('staff', `/api/v1/cases/${caseId}/suspension-proposals`, { expectedVersion: 0, reason: 'Vi phạm quy trình chăm sóc' }, 'susp-staff-0001').expect(200);
    expect(ok.body.data).toMatchObject({
      id: caseId,
      state: 'UNDER_REVIEW',
      version: 1,
      suspensionProposal: {
        sitterId: String(sitterId),
        sitterName: 'Lê Văn Sitter',
        applicationId: String(applicationId)
      }
    });
    expect(ok.body.data.timeline.some(row => row.type === 'SUSPENSION_PROPOSED')).toBe(true);

    const adminNotice = await connection.db.collection('notifications').findOne({
      recipientId: String(adminId),
      eventType: 'IncidentSuspensionProposed'
    });
    expect(adminNotice).toMatchObject({
      deepLink: `/admin/sitter-applications/${applicationId}`
    });
    expect(adminNotice.message).toContain('Lê Văn Sitter');

    const second = await post('staff', `/api/v1/cases/${caseId}/suspension-proposals`, { expectedVersion: 1 }, 'susp-staff-0002').expect(409);
    expect(second.body.error.code).toBe('SUSPENSION_ALREADY_PROPOSED');
  });
});

describe('Part C: ST-CAS-04, ST-CAS-05, ST-CAS-06 incident refund proposals and Admin decisions', () => {
  test('ST-CAS-06: amount exceeding remaining booking payment returns MSG44 and saves nothing; missing reason returns MSG01', async () => {
    const { caseId } = await seedIncident({ paidVnd: 300000, priorRefundVnd: 100000 });

    const missingReason = await post('staff', `/api/v1/cases/${caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Hỗ trợ chi phí thú y.',
      chargeVisit: true,
      proposal: { amountVnd: 150000, reason: '   ', evidenceRefs: [] }
    }, 'inc-missing-reason-01').expect(422);
    expect(missingReason.body.error.messageCode).toBe('MSG01');

    const overCap = await post('staff', `/api/v1/cases/${caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Hỗ trợ chi phí thú y.',
      chargeVisit: true,
      proposal: { amountVnd: 250000, reason: 'Hoá đơn khám thú y', evidenceRefs: [] }
    }, 'inc-over-cap-01').expect(422);
    expect(overCap.body.error).toMatchObject({
      code: 'REFUND_CAP_EXCEEDED',
      messageCode: 'MSG44',
      remainingVnd: 200000
    });

    const overByOne = await post('staff', `/api/v1/cases/${caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Hỗ trợ chi phí thú y.',
      chargeVisit: true,
      proposal: { amountVnd: 200001, reason: 'Vượt 1 đồng', evidenceRefs: [] }
    }, 'inc-over-one-01').expect(422);
    expect(overByOne.body.error).toMatchObject({ code: 'REFUND_CAP_EXCEEDED', messageCode: 'MSG44', remainingVnd: 200000 });

    const stored = await connection.db.collection('cases').findOne({ _id: new mongoose.Types.ObjectId(caseId) });
    expect(stored.state).toBe('OPEN');
    expect(stored.version).toBe(0);
    expect(stored.proposal).toBeUndefined();
  });

  test('ST-CAS-04: Staff proposes 200.000 without files (MSG95, stays UNDER_REVIEW); Admin lowers to 150.000 (MSG134, records refund 150.000, resolves incident)', async () => {
    const { caseId, bookingId } = await seedIncident({ paidVnd: 300000, priorRefundVnd: 100000 });

    const proposed = await post('staff', `/api/v1/cases/${caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Paw World hỗ trợ chi phí khám cho thú cưng.',
      chargeVisit: true,
      proposal: { amountVnd: 200000, reason: 'Chi phí khám thú y xác nhận qua điện thoại', evidenceRefs: [] }
    }, 'inc-st-cas-04-propose').expect(200);
    expect(proposed.body.data).toMatchObject({
      state: 'UNDER_REVIEW',
      version: 1,
      messageCode: 'MSG95',
      proposal: { status: 'PENDING', amountVnd: 200000 }
    });

    const list = await request(app)
      .get('/api/v1/complaints/refund-proposals?status=PENDING')
      .set('x-test-actor', 'admin')
      .expect(200);
    expect(list.body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: caseId, kind: 'INCIDENT', proposal: expect.objectContaining({ amountVnd: 200000 }) })
    ]));

    const detail = await request(app)
      .get(`/api/v1/complaints/${caseId}/refund-proposal`)
      .set('x-test-actor', 'admin')
      .expect(200);
    expect(detail.body.data).toMatchObject({
      id: caseId,
      kind: 'INCIDENT',
      billing: { status: 'AVAILABLE', basisAmountVnd: 300000, approvedTotalVnd: 100000, remainingVnd: 200000 }
    });

    const decided = await post('admin', `/api/v1/complaints/${caseId}/refund-decision`, {
      expectedVersion: 1,
      outcome: 'REDUCE',
      amountVnd: 150000
    }, 'inc-st-cas-04-decide').expect(200);
    expect(decided.body.data).toMatchObject({
      state: 'RESOLVED',
      version: 2,
      messageCode: 'MSG134'
    });

    const refundRow = await connection.db.collection('refunds').findOne({
      bookingId: new mongoose.Types.ObjectId(bookingId),
      sourceType: 'INCIDENT',
      incidentId: caseId
    });
    expect(refundRow).toMatchObject({ state: 'RECORDED', amountVnd: 150000 });

    const customerView = await request(app).get(`/api/v1/cases/${caseId}`).set('x-test-actor', 'customer').expect(200);
    expect(customerView.body.data).toMatchObject({
      state: 'RESOLVED',
      customerResult: 'Paw World hỗ trợ chi phí khám cho thú cưng.',
      approvedAmountVnd: 150000
    });

    const staffView = await request(app).get(`/api/v1/cases/${caseId}`).set('x-test-actor', 'staff').expect(200);
    expect(staffView.body.data.moneyDecision).toMatchObject({ outcome: 'REDUCE', amountVnd: 150000 });
  });

  test('ST-CAS-05: Admin rejects proposal with reason (MSG135, no refund recorded, incident Resolved, customer gets result without amount)', async () => {
    const { caseId, bookingId } = await seedIncident({ paidVnd: 300000 });

    await post('staff', `/api/v1/cases/${caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Đã kiểm tra và ghi nhận sự cố.',
      chargeVisit: true,
      proposal: { amountVnd: 120000, reason: 'Đề xuất hỗ trợ', evidenceRefs: [] }
    }, 'inc-st-cas-05-propose').expect(200);

    const rejected = await post('admin', `/api/v1/complaints/${caseId}/refund-decision`, {
      expectedVersion: 1,
      outcome: 'REJECT',
      reason: 'Chưa đủ cơ sở hoàn tiền.'
    }, 'inc-st-cas-05-reject').expect(200);
    expect(rejected.body.data).toMatchObject({ state: 'RESOLVED', version: 2, messageCode: 'MSG135' });

    const refundCount = await connection.db.collection('refunds').countDocuments({
      bookingId: new mongoose.Types.ObjectId(bookingId),
      incidentId: caseId
    });
    expect(refundCount).toBe(0);

    const customerView = await request(app).get(`/api/v1/cases/${caseId}`).set('x-test-actor', 'customer').expect(200);
    expect(customerView.body.data).toMatchObject({
      state: 'RESOLVED',
      customerResult: 'Đã kiểm tra và ghi nhận sự cố.',
      approvedAmountVnd: null
    });
  });

  test('Resolve without amount immediately marks Resolved (MSG96) and notifies customer and sitter; waive visit adds visit price once', async () => {
    const noMoney = await seedIncident({ paidVnd: 200000 });
    const resolved = await post('staff', `/api/v1/cases/${noMoney.caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Đã liên hệ và hướng dẫn xong.',
      chargeVisit: true
    }, 'inc-no-money-01').expect(200);
    expect(resolved.body.data).toMatchObject({ state: 'RESOLVED', messageCode: 'MSG96' });

    const notices = await connection.db.collection('notifications').find({ deepLink: `/cases/${noMoney.caseId}`, eventType: 'IncidentResolved' }).toArray();
    expect(notices.map(n => n.role)).toEqual(expect.arrayContaining(['CUSTOMER', 'PET_SITTER']));

    const waived = await seedIncident({ paidVnd: 300000, visitNetVnd: 110000 });
    const firstWaive = await post('staff', `/api/v1/cases/${waived.caseId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Miễn tiền buổi và hỗ trợ thêm.',
      chargeVisit: false,
      proposal: { amountVnd: 40000, reason: 'Không hoàn tất dịch vụ và hỗ trợ thêm', evidenceRefs: [] }
    }, 'inc-waive-01').expect(200);
    expect(firstWaive.body.data.proposal).toMatchObject({
      amountVnd: 150000,
      waiveVisitCharge: true,
      waivedVisitAmountVnd: 110000,
      extraAmountVnd: 40000
    });

    const secondIncidentId = oid();
    await connection.db.collection('cases').insertOne({
      _id: secondIncidentId,
      id: String(secondIncidentId),
      kind: 'INCIDENT',
      visitId: waived.visitId,
      bookingId: new mongoose.Types.ObjectId(waived.bookingId),
      customerId: String(customerId),
      sitterId: String(sitterId),
      category: 'OTHER',
      severity: 'LOW',
      urgency: 'ROUTINE',
      description: 'Sự cố thứ hai trên cùng buổi.',
      state: 'OPEN',
      version: 0,
      evidenceRefs: [],
      timeline: [],
      createdAt: new Date(now()).toISOString()
    });
    const doubleWaive = await post('staff', `/api/v1/cases/${secondIncidentId}/resolutions`, {
      expectedVersion: 0,
      customerResult: 'Thử miễn tiền buổi lần hai.',
      chargeVisit: false,
      proposal: { reason: 'Trùng buổi', evidenceRefs: [] }
    }, 'inc-waive-02').expect(409);
    expect(doubleWaive.body.error.code).toBe('VISIT_ALREADY_WAIVED');
  });
});
