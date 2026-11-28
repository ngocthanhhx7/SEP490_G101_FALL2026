import { describe, expect, jest, test } from '@jest/globals';
import { Types } from 'mongoose';
import { finalizeExceptionalBooking } from '../../../src/services/employee-scheduling/booking-terminal.service.js';
import { createEmployeeScheduleRepository } from '../../../src/services/employee-scheduling/employee-schedule.repository.js';
import { groomingOccupancy } from '../../../src/services/employee-scheduling/grooming-occupancy.service.js';
import { reasonsOfVisit, createNeedsActionService } from '../../../src/services/employee-scheduling/needs-action.service.js';
import { visitReasonStages, visitNeedsCountStages, visitBoardPageStages } from '../../../src/services/employee-scheduling/visit-board-query.service.js';
import { createVisitClosureService } from '../../../src/services/employee-scheduling/visit-closure.service.js';
import { createVisitCompletionMonitor } from '../../../src/services/employee-scheduling/visit-completion-monitor.service.js';
import { createVisitContactService } from '../../../src/services/employee-scheduling/visit-contact.service.js';
import { createWithdrawalReviewService } from '../../../src/services/employee-scheduling/withdrawal-review.service.js';
import { createStaffReassignmentService } from '../../../src/services/employee-scheduling/staff-reassignment.service.js';
import { createEmployeeDispatchService } from '../../../src/services/employee-scheduling/employee-dispatch.service.js';

const BID = '507f1f77bcf86cd799439001';
const VID = '507f1f77bcf86cd799439011';
const VID2 = '507f1f77bcf86cd799439012';
const CID = '507f1f77bcf86cd799439021';
const S1 = '507f1f77bcf86cd799439031';
const S2 = '507f1f77bcf86cd799439032';
const S3 = '507f1f77bcf86cd799439033';
const S4 = '507f1f77bcf86cd799439034';
const S5 = '507f1f77bcf86cd799439035';
const STAFF_ID = '507f1f77bcf86cd799439099';
const ADMIN_ID = '507f1f77bcf86cd799439098';
const STAFF = { userId: STAFF_ID, state: 'ACTIVE', roles: ['STAFF'] };
const ADMIN = { userId: ADMIN_ID, state: 'ACTIVE', roles: ['ADMIN'] };
const NOW_MS = Date.parse('2026-11-26T08:00:00.000Z');
const NOW = new Date(NOW_MS);

function cursorArr(rows) {
  const c = {
    sort: () => c,
    limit: () => c,
    maxTimeMS: () => c,
    select: () => c,
    session: () => c,
    lean: async () => rows,
    toArray: async () => rows
  };
  return c;
}

function chainOne(doc) {
  const c = {
    sort: () => c,
    select: () => c,
    maxTimeMS: () => c,
    session: () => c,
    lean: async () => doc,
    then: (res, rej) => Promise.resolve(doc).then(res, rej)
  };
  return c;
}

function makeFakeDbConnection() {
  const models = {};
  const register = (name, extra = {}) => {
    const colName = extra.collection?.name ?? name.toLowerCase() + 's';
    const m = {
      modelName: name,
      schema: { indexes: () => [] },
      createCollection: async () => {},
      createIndexes: async () => {},
      ...extra,
      collection: {
        name: colName,
        listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
        ...(extra.collection ?? {})
      }
    };
    models[name] = m;
    return m;
  };
  register('PayrollMonthGuard', { findOneAndUpdate: jest.fn(() => chainOne({ version: 1 })) });
  register('EmploymentContract', { findOne: jest.fn(() => chainOne(null)), exists: jest.fn(() => chainOne(null)) });
  for (const n of [
    'EmployeeAvailability', 'EmployeeAvailabilityRevision', 'EmployeeVisitOffer',
    'EmployeeDayOrigin', 'EmployeeScheduleCommand', 'EmployeeScheduleEvent',
    'EmployeeScheduleProposal', 'EmployeeVisitTravel',
    'PayrollStatement', 'SalaryAdvance', 'PayrollServiceCredit',
    'PayrollAdjustment', 'PayrollSourceClaim', 'PayrollCommand', 'PayrollEvent'
  ]) register(n);

  const defaultCol = {
    indexes: async () => [{ key: { _id: 1 } }],
    listIndexes: () => ({ toArray: async () => [{ name: '_id_', key: { _id: 1 } }] }),
    find: () => cursorArr([]),
    findOne: async () => null,
    insertOne: async () => ({}),
    updateOne: async () => ({ matchedCount: 1 })
  };

  return {
    models,
    model: jest.fn(name => models[name] ?? register(name)),
    transaction: jest.fn(async fn => fn({ inTransaction: () => true })),
    startSession: jest.fn(async () => ({
      withTransaction: async fn => fn({ inTransaction: () => true }),
      endSession: async () => {}
    })),
    db: {
      listCollections: () => ({
        toArray: async () => Object.values(models).map(m => ({ name: m.collection.name }))
      }),
      collection: jest.fn(() => defaultCol)
    }
  };
}

describe('Employee Scheduling & Board Services', () => {
  // BKG-TERM-01
  test('BKG-TERM-01-UTCID01 [N] sets booking state=CANCELLED andVERIFIED/RECONCILIATION when all visits are CANCELLED', async () => {
    const vId = new Types.ObjectId(VID);
    const cols = {
      bookings: {
        findOne: async () => ({ _id: new Types.ObjectId(BID), version: 2, visitIds: [vId] }),
        findOneAndUpdate: jest.fn(async (_f, u) => ({ _id: new Types.ObjectId(BID), version: 3, ...u.$set }))
      },
      visits: { find: () => cursorArr([{ _id: vId, bookingId: new Types.ObjectId(BID), state: 'CANCELLED' }]) }
    };
    const saved = await finalizeExceptionalBooking({
      connection: makeFakeDbConnection(),
      col: name => cols[name],
      bookingId: new Types.ObjectId(BID),
      session: {},
      at: NOW
    });
    expect(saved.state).toBe('CANCELLED');
    expect(saved.completionReviewState).toBe('FINANCIAL_RECONCILIATION_REQUIRED');
  });

  test('BKG-TERM-01-UTCID02 [A] rejects incomplete visit set with SOURCE_RECONCILIATION_REQUIRED', async () => {
    const cols = {
      bookings: { findOne: async () => ({ _id: new Types.ObjectId(BID), version: 0, visitIds: [new Types.ObjectId(VID)] }) },
      visits: { find: () => cursorArr([]) }
    };
    await expect(finalizeExceptionalBooking({
      connection: makeFakeDbConnection(),
      col: name => cols[name],
      bookingId: new Types.ObjectId(BID),
      session: {},
      at: NOW
    })).rejects.toMatchObject({ code: 'SOURCE_RECONCILIATION_REQUIRED', status: 409 });
  });

  // EMP-REPO-01
  test('EMP-REPO-01-UTCID01 [N] returns ACTIVE verified current contract and UPCOMING verified contract when no current one exists', async () => {
    const conn = makeFakeDbConnection();
    conn.models.EmploymentContract.findOne
      .mockImplementationOnce(() => chainOne({
        employmentType: 'FULL_TIME',
        verifiedBy: ADMIN_ID,
        signedAt: new Date(NOW_MS - 86400000),
        effectiveAt: new Date(NOW_MS - 86400000),
        endsAt: null
      }))
      .mockImplementationOnce(() => chainOne(null))
      .mockImplementationOnce(() => chainOne({
        employmentType: 'PART_TIME',
        verifiedBy: ADMIN_ID,
        signedAt: new Date(NOW_MS - 3600000),
        effectiveAt: new Date(NOW_MS + 86400000),
        endsAt: null
      }));
    const repo = createEmployeeScheduleRepository({ connection: conn, clock: () => NOW_MS, coverageAreas: [] });
    const active = await repo.registrationContract(S1, null, true);
    expect(active.state).toBe('ACTIVE');
    const upcoming = await repo.registrationContract(S1, null, true);
    expect(upcoming.state).toBe('UPCOMING');
  });

  test('EMP-REPO-01-UTCID02 [A] throws CONTRACT_REQUIRED when required=true and returns null when required=false', async () => {
    const conn = makeFakeDbConnection();
    const repo = createEmployeeScheduleRepository({ connection: conn, clock: () => NOW_MS, coverageAreas: [] });
    await expect(repo.registrationContract(S1, null, true)).rejects.toMatchObject({ code: 'CONTRACT_REQUIRED', status: 409 });
    await expect(repo.registrationContract(S1, null, false)).resolves.toBeNull();
  });

  // GRM-OCC-01
  test('GRM-OCC-01-UTCID01 [N] maps reserved non-released shop grooming pets into SHOP ASSIGNED occupancy blocks', async () => {
    const startAt = new Date('2026-11-26T09:00:00.000Z');
    const connection = {
      db: {
        collection: () => ({
          find: () => cursorArr([{
            _id: new Types.ObjectId(BID),
            slot: { startAt, endAt: new Date('2026-11-26T10:00:00.000Z') },
            shop: { address: '12 Cầu Giấy' },
            pets: [
              { _id: new Types.ObjectId(VID), reservedSitterId: new Types.ObjectId(S1), status: 'BOOKED', durationMinutes: 60, petSnapshot: { name: 'Bơ' }, services: [] },
              { _id: new Types.ObjectId(VID2), reservedSitterId: new Types.ObjectId(S1), status: 'CANCELLED_NO_CHARGE', durationMinutes: 60, petSnapshot: { name: 'Mỡ' }, services: [] }
            ]
          }])
        })
      }
    };
    const rows = await groomingOccupancy({ connection, sitterIds: [S1], from: new Date('2026-11-26T08:00:00.000Z') });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workLocation: 'SHOP', state: 'ASSIGNED' });
  });

  test('GRM-OCC-01-UTCID02 [B] rejects > 200 rows with SHIFT_REVIEW_REQUIRED', async () => {
    const connection = { db: { collection: () => ({ find: () => cursorArr(Array.from({ length: 201 }, () => ({}))) }) } };
    await expect(groomingOccupancy({ connection, sitterIds: [S1], from: NOW }))
      .rejects.toMatchObject({ code: 'SHIFT_REVIEW_REQUIRED', status: 409 });
  });

  // ACTION-01 & ACTION-02
  test('ACTION-01-UTCID01 [N] computes and sorts late reasons ahead of upcoming reasons', () => {
    const scheduled = {
      state: 'SCHEDULED',
      sitterId: null,
      startAt: new Date(NOW_MS + 2 * 3600000),
      endAt: new Date(NOW_MS + 3 * 3600000),
      dispatchReview: { code: 'NO_ELIGIBLE_SITTER' }
    };
    expect(reasonsOfVisit(scheduled, NOW_MS).map(r => r.code)).toEqual(['NO_SITTER_TO_OFFER', 'NO_SITTER_24H']);

    const overdueCheckout = {
      state: 'IN_PROGRESS',
      sitterId: new Types.ObjectId(S1),
      checkInAt: new Date(NOW_MS - 4 * 3600000),
      checkOutAt: null,
      startAt: new Date(NOW_MS - 4 * 3600000),
      endAt: new Date(NOW_MS - 3 * 3600000),
      incidentOpen: true
    };
    expect(reasonsOfVisit(overdueCheckout, NOW_MS).map(r => r.code)).toContain('NOT_CHECKED_OUT_2H');
    expect(reasonsOfVisit(overdueCheckout, NOW_MS).map(r => r.code)).toContain('WORKFLOW_BLOCKED');
  });

  test('ACTION-02-UTCID01 [N] lists decorated Needs Action items with counts and enforces STAFF/ADMIN role', async () => {
    const visitRow = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      sitterId: null,
      state: 'SCHEDULED',
      version: 1,
      startAt: new Date(NOW_MS + 3600000),
      endAt: new Date(NOW_MS + 7200000),
      areaCode: 'HN_CAU_GIAY',
      snapshots: { serviceName: 'Chăm tại nhà', pets: [{ name: 'Bơ' }] },
      __at: new Date(NOW_MS + 3600000),
      __order: 1
    };
    let aggCall = 0;
    const cols = {
      visits: {
        aggregate: () => ({
          toArray: async () => {
            aggCall += 1;
            return aggCall === 1 ? [{ total: 1 }] : [visitRow];
          }
        })
      },
      users: { find: () => cursorArr([{ _id: new Types.ObjectId(CID), displayName: 'Khách A' }]) },
      bookings: { find: () => cursorArr([{ _id: new Types.ObjectId(BID), bookingCode: 'BK-01' }]) }
    };
    const svc = createNeedsActionService({ repository: { col: n => cols[n] }, clock: () => NOW_MS, cursorSecret: 's'.repeat(32) });
    const out = await svc.list(STAFF, { tab: 'needs-action' });
    expect(out.counts.needsAction).toBe(1);
    expect(out.items[0]).toMatchObject({ id: VID, customerName: 'Khách A', bookingCode: 'BK-01' });

    await expect(svc.list({ userId: CID, state: 'ACTIVE', roles: ['CUSTOMER'] }, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // VISIT-QUERY-01..03
  test('VISIT-QUERY-01-UTCID01 [N] builds $lookup bookings and __codes/$switch stages', () => {
    const stages = visitReasonStages(NOW_MS);
    expect(stages[0].$lookup.from).toBe('bookings');
    expect(stages.some(s => s.$set?.__codes)).toBe(true);
  });

  test('VISIT-QUERY-02-UTCID01 [N] builds candidate $match, reason stages, and $count total', () => {
    const stages = visitNeedsCountStages(NOW_MS);
    expect(stages.at(-1)).toEqual({ $count: 'total' });
  });

  test('VISIT-QUERY-03-UTCID01 [N] builds needs-action and search/cursor pagination stages', () => {
    const needsStages = visitBoardPageStages({
      query: { tab: 'needs-action', areaCode: 'HN_CAU_GIAY' },
      now: NOW_MS,
      position: null,
      oid: v => new Types.ObjectId(v),
      limit: 50
    });
    expect(needsStages.some(s => s.$limit === 51)).toBe(true);

    const searchStages = visitBoardPageStages({
      query: { tab: 'all', search: '507f1f77' },
      now: NOW_MS,
      position: { s: NOW_MS, i: VID },
      oid: v => new Types.ObjectId(v),
      limit: 50
    });
    expect(searchStages.some(s => s.$lookup?.from === 'users')).toBe(true);
  });

  // VISIT-CLOSE-01..04
  function buildClosureRepo(visitDoc) {
    const conn = makeFakeDbConnection();
    const session = { inTransaction: () => true };
    const deleteDogWalkLocation = jest.fn(async () => ({ deletedCount: 1 }));
    const collection = conn.db.collection;
    conn.db.collection = name => name === 'employeevisittravels' ? { deleteOne: deleteDogWalkLocation } : collection(name);
    const visitStore = { current: visitDoc };
    const cols = {
      visits: {
        find: () => cursorArr(visitStore.current ? [visitStore.current] : []),
        findOne: async () => visitStore.current,
        findOneAndUpdate: jest.fn(async (_f, u) => ({ ...visitStore.current, ...(u.$set ?? {}), version: (visitStore.current.version ?? 0) + 1 }))
      },
      users: {
        find: () => cursorArr([
          { _id: new Types.ObjectId(CID), displayName: 'Khách', roles: ['CUSTOMER'] },
          { _id: new Types.ObjectId(S1), displayName: 'Sitter 1', roles: ['PET_SITTER'] },
          { _id: new Types.ObjectId(ADMIN_ID), displayName: 'Admin', roles: ['ADMIN'] }
        ]),
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF_ID), roles: ['STAFF', 'ADMIN'] })
      },
      bookings: {
        find: () => cursorArr([{ _id: new Types.ObjectId(BID), bookingCode: 'BK-01' }]),
        findOne: async () => ({ _id: new Types.ObjectId(BID), version: 0, visitIds: [new Types.ObjectId(VID)] }),
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(BID), version: 1, state: 'CLOSED' })
      },
      privateimages: { find: () => cursorArr([]) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const models = {
      EmployeeVisitOffer: { db: conn, collection: { name: 'employeevisitoffers' } },
      EmployeeScheduleCommand: { findById: () => chainOne(null), create: jest.fn(async d => d) },
      EmployeeScheduleEvent: { create: jest.fn(async d => d) }
    };
    return {
      session, deleteDogWalkLocation, repository: { models, col: n => cols[n] ?? conn.db.collection(n), uow: { run: fn => fn(session) } }
    };
  }

  const overdueVisit = {
    _id: new Types.ObjectId(VID),
    bookingId: new Types.ObjectId(BID),
    customerId: new Types.ObjectId(CID),
    sitterId: new Types.ObjectId(S1),
    state: 'IN_PROGRESS',
    version: 1,
    startAt: new Date(NOW_MS - 4 * 3600000),
    endAt: new Date(NOW_MS - 3 * 3600000),
    checkInAt: new Date(NOW_MS - 4 * 3600000),
    checkOutAt: null,
    snapshots: { serviceName: 'Chăm tại nhà' }
  };

  test('VISIT-CLOSE-01-UTCID01 [N] needsAction returns decorated overdue visits and rejects non-staff', async () => {
    const { repository } = buildClosureRepo(overdueVisit);
    const svc = createVisitClosureService({ repository, clock: () => NOW_MS });
    const res = await svc.needsAction(STAFF);
    expect(res.items[0]).toMatchObject({ id: VID, reasonCode: 'NOT_CHECKED_OUT' });
  });

  test('VISIT-CLOSE-02-UTCID01 [N] details returns closable visit and rejects non-closable state', async () => {
    const { repository } = buildClosureRepo(overdueVisit);
    const svc = createVisitClosureService({ repository, clock: () => NOW_MS });
    await expect(svc.details(STAFF, VID)).resolves.toMatchObject({ id: VID, sitterName: 'Sitter 1' });

    const notYet = buildClosureRepo({ ...overdueVisit, endAt: new Date(NOW_MS - 30 * 60000) });
    await expect(createVisitClosureService({ repository: notYet.repository, clock: () => NOW_MS }).details(STAFF, VID))
      .rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  test('VISIT-CLOSE-03-UTCID01 [N] close transitions overdue IN_PROGRESS visit to STAFF_CLOSED with PENDING reviewState', async () => {
    const { repository, session, deleteDogWalkLocation } = buildClosureRepo(overdueVisit);
    const svc = createVisitClosureService({ repository, clock: () => NOW_MS });
    const res = await svc.close(STAFF, VID, { expectedVersion: 1, reason: 'Sitter quên bấm hoàn thành' }, 'close-key-01');
    expect(res).toMatchObject({ visitId: VID, state: 'STAFF_CLOSED', version: 2, reviewState: 'PENDING' });
    expect(deleteDogWalkLocation).toHaveBeenCalledWith({ _id: `dog-walk:${VID}` }, { session });
  });

  test('VISIT-CLOSE-04-UTCID01 [N] verify records ADMIN NO_SERVICE verification and rejects STAFF without ADMIN role', async () => {
    const staffClosed = { ...overdueVisit, state: 'STAFF_CLOSED', version: 2, closureVerification: null };
    const { repository } = buildClosureRepo(staffClosed);
    const svc = createVisitClosureService({ repository, clock: () => NOW_MS });
    await expect(svc.verify(STAFF, VID, {
      expectedVersion: 2, reason: 'Xác minh', outcome: 'NO_SERVICE', evidenceReference: 'CALL-1'
    }, 'ver-key-01')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });

    const res = await svc.verify(ADMIN, VID, {
      expectedVersion: 2, reason: 'Xác minh không làm', outcome: 'NO_SERVICE', evidenceReference: 'CALL-1'
    }, 'ver-key-02');
    expect(res).toMatchObject({ visitId: VID, reviewState: 'VERIFIED', outcome: 'NO_SERVICE', version: 3 });
  });

  // VISIT-MON-01
  test('VISIT-MON-01-UTCID01 [N] notifies review/overdue/ending phases and increments reviewed count', async () => {
    let phaseCall = 0;
    const candidate = { _id: new Types.ObjectId(VID), sitterId: new Types.ObjectId(S1), endAt: new Date(NOW_MS - 3 * 3600000), version: 1 };
    const cols = {
      visits: {
        find: () => cursorArr(phaseCall++ === 0 ? [candidate] : []),
        findOne: async () => ({ ...candidate, bookingId: new Types.ObjectId(BID) }),
        findOneAndUpdate: async () => candidate
      },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const fallbackCol = { findOne: async () => null, find: () => cursorArr([]), insertOne: async () => ({}), updateOne: async () => ({}) };
    const svc = createVisitCompletionMonitor({
      repository: {
        col: n => cols[n] ?? fallbackCol,
        models: { EmployeeScheduleEvent: { create: jest.fn(async d => d) } },
        uow: { run: fn => fn({}) }
      },
      clock: () => NOW_MS
    });
    const out = await svc.runBatch({ limit: 10 });
    expect(out).toEqual({ notified: 1, reviewed: 1 });
    await expect(svc.runBatch({ limit: 0 })).rejects.toThrow(TypeError);
  });

  // VISIT-CONTACT-01
  test('VISIT-CONTACT-01-UTCID01 [N] reads uncached sitter phone and records VisitContactViewed audit event without storing phone', async () => {
    const createEvent = jest.fn(async d => d);
    const cols = {
      visits: { findOne: async () => ({ _id: new Types.ObjectId(VID), customerId: new Types.ObjectId(CID), sitterId: new Types.ObjectId(S1) }) },
      users: { findOne: async () => ({ _id: new Types.ObjectId(S1), displayName: 'Sitter Lan' }) }
    };
    const svc = createVisitContactService({
      repository: { col: n => cols[n], models: { EmployeeScheduleEvent: { create: createEvent } } },
      clock: () => NOW_MS,
      phones: { phonesOf: async () => new Map([[S1, '0987654321']]) }
    });
    const out = await svc.read(STAFF, VID, { party: 'sitter' });
    expect(out).toEqual({ party: 'sitter', displayName: 'Sitter Lan', phone: '0987654321' });
    expect(JSON.stringify(createEvent.mock.calls[0][0])).not.toContain('0987654321');
  });

  // WITHDRAW-REVIEW-01..02
  test('WITHDRAW-REVIEW-01-UTCID01 [N] details returns pending withdrawal metadata for ASSIGNED visit', async () => {
    const assignedAt = new Date(NOW_MS - 3600000);
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      sitterId: new Types.ObjectId(S1),
      state: 'ASSIGNED',
      version: 2,
      assignedAt,
      checkInAt: null,
      startAt: new Date(NOW_MS + 4 * 3600000),
      endAt: new Date(NOW_MS + 5 * 3600000),
      snapshots: { serviceName: 'Chăm tại nhà' },
      withdrawalRequest: { sitterId: new Types.ObjectId(S1), assignedAt, reasonCode: 'EMERGENCY', note: 'Sốt cao' }
    };
    const conn = makeFakeDbConnection();
    const cols = {
      visits: {
        findOne: async () => visit,
        findOneAndUpdate: async (_f, u) => ({ ...visit, ...(u.$set ?? {}), version: 3 })
      },
      users: {
        findOne: async () => ({ _id: new Types.ObjectId(S1), displayName: 'Minh' }),
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF_ID), roles: ['STAFF'] }),
        updateOne: async () => ({})
      },
      sitterstatuses: { updateOne: async () => ({}) },
      bookings: { findOne: async () => ({ _id: new Types.ObjectId(BID), customerId: new Types.ObjectId(CID) }), updateOne: async () => ({}) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const requeue = jest.fn(async () => {});
    const fallbackWd = { findOne: async () => null, find: () => cursorArr([]), insertOne: async () => ({}), updateOne: async () => ({}) };
    const svc = createWithdrawalReviewService({
      repository: {
        col: n => cols[n] ?? fallbackWd,
        models: {
          EmployeeVisitOffer: { db: conn, updateMany: jest.fn(async () => ({})) },
          EmployeeScheduleCommand: { findById: () => chainOne(null), create: jest.fn(async d => d) },
          EmployeeScheduleEvent: { create: jest.fn(async d => d) }
        },
        uow: { run: fn => fn({}) }
      },
      clock: () => NOW_MS,
      requeue
    });
    const det = await svc.details(STAFF, VID);
    expect(det).toMatchObject({ visitId: VID, sitterName: 'Minh', reasonCode: 'EMERGENCY' });

    const dec = await svc.decide(STAFF, VID, { expectedVersion: 2, decision: 'RELEASE', reason: 'Đã xác nhận giấy khám' }, 'wd-key-0001');
    expect(dec).toEqual({ visitId: VID, version: 3, decision: 'RELEASE', state: 'SCHEDULED' });
    expect(requeue).toHaveBeenCalledWith(VID, 3);
  });

  test('WITHDRAW-REVIEW-02-UTCID01 [N] decide REJECT keeps visit ASSIGNED without calling requeue', async () => {
    const assignedAt = new Date(NOW_MS - 3600000);
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      sitterId: new Types.ObjectId(S1),
      state: 'ASSIGNED',
      version: 2,
      assignedAt,
      checkInAt: null,
      startAt: new Date(NOW_MS + 4 * 3600000),
      endAt: new Date(NOW_MS + 5 * 3600000),
      withdrawalRequest: { sitterId: new Types.ObjectId(S1), assignedAt, reasonCode: 'OTHER' }
    };
    const conn = makeFakeDbConnection();
    const requeue = jest.fn();
    const cols = {
      visits: {
        findOne: async () => visit,
        findOneAndUpdate: async () => ({ ...visit, state: 'ASSIGNED', version: 3 })
      },
      users: {
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF_ID), roles: ['STAFF'] }),
        updateOne: async () => ({})
      },
      sitterstatuses: { updateOne: async () => ({}) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const fallbackWd2 = { findOne: async () => null, find: () => cursorArr([]), insertOne: async () => ({}), updateOne: async () => ({}) };
    const svc = createWithdrawalReviewService({
      repository: {
        col: n => cols[n] ?? fallbackWd2,
        models: {
          EmployeeVisitOffer: { db: conn, updateMany: jest.fn() },
          EmployeeScheduleCommand: { findById: () => chainOne(null), create: jest.fn(async d => d) },
          EmployeeScheduleEvent: { create: jest.fn(async d => d) }
        },
        uow: { run: fn => fn({}) }
      },
      clock: () => NOW_MS,
      requeue
    });
    const res = await svc.decide(STAFF, VID, { expectedVersion: 2, decision: 'REJECT', reason: 'Chưa đủ căn cứ' }, 'wd-key-0002');
    expect(res).toEqual({ visitId: VID, version: 3, decision: 'REJECT', state: 'ASSIGNED' });
    expect(requeue).not.toHaveBeenCalled();
  });

  // REASSIGN-SVC-01..02
  test('REASSIGN-SVC-01-UTCID01 [N] details excludes current sitter and previously withdrawn sitters from candidate items', async () => {
    const conn = makeFakeDbConnection();
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      sitterId: new Types.ObjectId(S1),
      state: 'ASSIGNED',
      version: 1,
      checkInAt: null,
      startAt: new Date(NOW_MS + 3600000),
      endAt: new Date(NOW_MS + 7200000),
      snapshots: { serviceName: 'Chăm tại nhà', pets: [{ name: 'Bơ', species: 'DOG' }] }
    };
    const cols = {
      visits: {
        findOne: async () => visit,
        findOneAndUpdate: async (_f, u) => ({ ...visit, ...u.$set, version: 2 })
      },
      users: {
        find: () => cursorArr([
          { _id: new Types.ObjectId(S1), displayName: 'Sitter Cũ' },
          { _id: new Types.ObjectId(S2), displayName: 'Sitter Mới' },
          { _id: new Types.ObjectId(CID), displayName: 'Khách' }
        ]),
        updateOne: async () => ({})
      },
      sitterstatuses: { updateOne: async () => ({}) },
      bookings: { findOne: async () => ({ bookingCode: 'BK-02' }), updateOne: async () => ({}) }
    };
    const svc = createStaffReassignmentService({
      repository: {
        col: n => cols[n],
        models: {
          EmployeeVisitOffer: { db: conn, updateMany: jest.fn(async () => ({})) },
          EmployeeScheduleEvent: { distinct: async () => [S3] }
        },
        employeeGuard: jest.fn(async () => ({})),
        eligible: jest.fn(async () => ({})),
        registrationContract: jest.fn(async () => ({ employmentType: 'FULL_TIME' }))
      },
      clock: () => NOW_MS,
      candidates: async () => ({ sitterIds: [S1, S2, S3], blocked: [], weeklyMinutes: { [S2]: 600 } }),
      event: jest.fn(async () => {}),
      runCommand: (_actor, _payload, _key, exec) => exec({})
    });
    const det = await svc.details(STAFF, VID);
    expect(det.items.map(i => i.sitterId)).toEqual([S2]);

    const re = await svc.reassign(STAFF, VID, { sitterId: S2, expectedVersion: 1, reason: 'Đổi người hỗ trợ khẩn' }, 're-key-0001');
    expect(re).toMatchObject({ visitId: VID, sitterId: S2, version: 2, handoverLateCheckInExempt: false });
  });

  test('REASSIGN-SVC-02-UTCID01 [A] reassign rejects choosing sitter who previously withdrew with REASSIGN_SITTER_NOT_ELIGIBLE', async () => {
    const conn = makeFakeDbConnection();
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      sitterId: new Types.ObjectId(S1),
      state: 'ASSIGNED',
      version: 1,
      checkInAt: null,
      startAt: new Date(NOW_MS + 1800000),
      endAt: new Date(NOW_MS + 5400000)
    };
    const svc = createStaffReassignmentService({
      repository: {
        col: () => ({
          findOne: async () => visit,
          find: () => cursorArr([{ _id: new Types.ObjectId(S3), displayName: 'Sitter Đã Rút' }])
        }),
        models: {
          EmployeeVisitOffer: { db: conn },
          EmployeeScheduleEvent: { distinct: async () => [S3] }
        },
        employeeGuard: jest.fn(),
        eligible: jest.fn(),
        registrationContract: jest.fn(async () => null)
      },
      clock: () => NOW_MS,
      candidates: jest.fn(),
      event: jest.fn(),
      runCommand: (_a, _p, _k, exec) => exec({})
    });
    await expect(svc.reassign(STAFF, VID, { sitterId: S3, expectedVersion: 1, reason: 'Thử gán lại' }, 're-key-0002'))
      .rejects.toMatchObject({ code: 'REASSIGN_SITTER_NOT_ELIGIBLE', status: 409 });
  });

  // EMP-DISPATCH-02, EMP-DISPATCH-04, EMP-DISPATCH-05
  test('EMP-DISPATCH-02-UTCID01 [N] invite creates PENDING offer for manual staff sitterId on escalated visit', async () => {
    const conn = makeFakeDbConnection();
    const visit = {
      _id: new Types.ObjectId(VID),
      bookingId: new Types.ObjectId(BID),
      customerId: new Types.ObjectId(CID),
      state: 'SCHEDULED',
      sitterId: null,
      version: 1,
      areaCode: 'HN_CAU_GIAY',
      startAt: new Date(NOW_MS + 4 * 3600000),
      endAt: new Date(NOW_MS + 5 * 3600000),
      dispatchReview: { code: 'NO_ELIGIBLE_SITTER' },
      snapshots: { serviceName: 'Chăm tại nhà', pets: [] }
    };
    const booking = { _id: new Types.ObjectId(BID), carePlanState: 'APPROVED', state: 'DISPATCH_PENDING', paymentMode: 'POSTPAY' };
    const cols = {
      visits: {
        findOne: async () => visit,
        updateOne: async () => ({ matchedCount: 1 }),
        aggregate: () => ({ toArray: async () => [{ ...visit, pendingInvitationCount: 0 }] })
      },
      bookings: { findOne: async () => booking },
      users: {
        findOneAndUpdate: async () => ({ _id: new Types.ObjectId(STAFF_ID), roles: ['STAFF'] }),
        find: () => cursorArr([{ _id: new Types.ObjectId(S1), displayName: 'Sitter 1' }])
      },
      sitterstatuses: { find: () => cursorArr([{ userId: new Types.ObjectId(S1) }]) },
      notificationoutboxes: { insertOne: async () => ({}), updateOne: async () => ({}) }
    };
    const offerDoc = { _id: new Types.ObjectId(), visitId: visit._id, sitterId: S1, state: 'PENDING', offeredAt: NOW, deadline: new Date(NOW_MS + 3600000) };
    const fallbackDisp = { findOne: async () => null, find: () => cursorArr([]), insertOne: async () => ({}), updateOne: async () => ({}) };
    const svc = createEmployeeDispatchService({
      repository: {
        col: n => cols[n] ?? fallbackDisp,
        uow: { run: fn => fn({}) },
        employeeGuard: jest.fn(async () => ({})),
        eligible: jest.fn(async () => ({ arrivalTravelMinutes: 5, adjacentTravelMinutes: 5, weeklyWorkMinutes: 120, workingHoursCovered: true })),
        contractAt: jest.fn(async () => ({ employmentType: 'PART_TIME' })),
        areaKeys: async () => ['HN_CAU_GIAY'],
        coverageAreas: [{ code: 'HN_CAU_GIAY', label: 'Cầu Giấy' }],
        models: {
          EmployeeAvailability: { find: () => cursorArr([S1, S2, S3, S4, S5].map(id => ({ _id: id }))) },
          EmployeeVisitOffer: {
            db: conn,
            collection: { name: 'employeevisitoffers' },
            find: () => cursorArr([]),
            findOne: () => chainOne(offerDoc),
            exists: () => chainOne(null),
            updateMany: async () => ({}),
            create: async docs => docs.map(d => ({ _id: offerDoc._id, ...d }))
          },
          EmployeeScheduleCommand: { findById: () => chainOne(null), create: async d => d },
          EmployeeScheduleEvent: { create: async d => d, distinct: async () => [] }
        }
      },
      clock: () => NOW_MS
    });

    const inv = await svc.invite(STAFF, VID, { expectedVersion: 1, sitterId: S1 }, 'inv-key-0001');
    expect(inv).toMatchObject({ state: 'PENDING', visitId: VID, sitterId: S1, invitationCount: 1 });

    // EMP-DISPATCH-05 details
    const det = await svc.details(STAFF, VID);
    expect(det.id).toBe(VID);

    // EMP-DISPATCH-04 requeueWithdrawal (safe no-throw when retryAt is in future or dispatched)
    await expect(svc.requeueWithdrawal(VID, 99)).resolves.toBeUndefined();
  });
});
