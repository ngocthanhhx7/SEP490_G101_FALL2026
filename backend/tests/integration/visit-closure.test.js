import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createVisitClosureService } from '../../src/services/employee-scheduling/visit-closure.service.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { visitCompletion } from '../../src/services/complaints/complaint-lifecycle.js';
import { payrollModels } from '../../src/models/payroll.model.js';
import { createCommissionSources } from '../../src/services/payroll/commission-source.service.js';

const oid = () => new mongoose.Types.ObjectId();
const END = Date.parse('2026-11-04T06:30:00Z');
const HOUR = 3600000;
let replica, connection, service, now;
const col = name => connection.db.collection(name);
const person = role => ({ _id: oid(), state: 'ACTIVE', roles: [role], displayName: role, authEpoch: 0 });
const actorOf = user => ({ userId: String(user._id), state: 'ACTIVE', roles: user.roles, authEpoch: 0 });
const staff = person('STAFF'), admin = person('ADMIN'), customerUser = person('CUSTOMER'), sitterUser = person('PET_SITTER');
const key = value => `synthetic-closure-${String(value).replace(/[^A-Za-z0-9]+/g, "-")}`;
let counter = 0;

async function seedVisit({ photo = true, state = 'IN_PROGRESS', checkedOut = false, endAt = END, checkIn = true, code = true } = {}) {
  const visitId = oid(), bookingId = oid(), mediaId = (++counter).toString(16).padStart(64, 'a');
  await col('bookings').insertOne({ _id: bookingId, customerId: customerUser._id, version: 0, state: 'IN_PROGRESS', ...(code ? { bookingCode: 'BK-0033' } : {}), visitIds: [visitId] });
  await col('visits').insertOne({ _id: visitId, bookingId, customerId: customerUser._id, sitterId: sitterUser._id, state, version: 4,
    areaCode: 'DISTRICT_CAU_GIAY', startAt: new Date(endAt - 30 * 60000), endAt: new Date(endAt),
    ...(checkIn ? { checkInAt: new Date(endAt - 28 * 60000) } : {}), ...(checkedOut ? { checkOutAt: new Date(endAt) } : {}),
    evidenceRefs: photo ? [{ kind: 'CHECK_IN', mediaId }] : [], snapshots: { serviceName: 'Dắt chó đi dạo', employeeServiceNetVnd: 100000 } });
  if (photo) await col('privateimages').insertOne({ _id: mediaId, state: 'READY', careKind: 'CHECK_IN', ownerId: sitterUser._id, careVisitId: String(visitId) });
  return String(visitId);
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_visit_closure' }).asPromise();
  await provisionEmployeeScheduling(connection);
  for (const model of Object.values(payrollModels(connection))) { await model.createCollection(); await model.createIndexes(); }
  await col('users').insertMany([staff, admin, customerUser, sitterUser]);
  const repository = { models: employeeSchedulingModels(connection), col, uow: createUnitOfWork(connection) };
  service = createVisitClosureService({ repository, clock: () => now });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(() => { now = END + 2 * HOUR + 10 * 60000; });

describe('closing a visit that was not checked out (GBR-24)', () => {
  test('a visit with a check-in photo becomes STAFF_CLOSED with who, when, why and the photo flag', async () => {
    const visitId = await seedVisit();
    const result = await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: '  Người chăm sóc quên check-out, đã gọi xác nhận lúc 08:40.  ' }, key('main'));
    expect(result).toMatchObject({ visitId, state: 'STAFF_CLOSED', version: 5, hasCheckInPhoto: true });
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    expect(saved).toMatchObject({ state: 'STAFF_CLOSED', version: 5, hasCheckInPhoto: true,
      closure: { byUserId: String(staff._id), reason: 'Người chăm sóc quên check-out, đã gọi xác nhận lúc 08:40.', hasCheckInPhoto: true } });
    expect(saved.closedAt.getTime()).toBe(now);
    expect(saved.closure.at.getTime()).toBe(now);
    expect(saved.checkOutAt).toBeUndefined();
    expect(await connection.collection('employeescheduleevents').findOne({ type: 'VisitStaffClosed', visitId }))
      .toMatchObject({ actorId: String(staff._id), sitterId: String(sitterUser._id) });
  });

  test('closure keeps complaints available and finishes the parent operationally without pretending service is financially verified', async () => {
    const visitId = await seedVisit();
    await service.close(actorOf(admin), visitId, { expectedVersion: 4, reason: 'Đã gọi người chăm sóc.' }, key('complaint'));
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    const completion = visitCompletion(saved);
    expect(completion.done).toBe(true);
    expect(new Date(completion.at).getTime()).toBe(now);
    expect(await col('bookings').findOne({ _id: saved.bookingId })).toMatchObject({ state: 'CLOSED', completionReviewState: 'PENDING' });
    expect(await col('payrollservicecredits').countDocuments({ bookingId: saved.bookingId })).toBe(0);
  });

  test.each([
    ['missing', undefined], ['empty', ''], ['blank', '   '], ['not a string', 7], ['over 1000 characters', 'a'.repeat(1001)]
  ])('rejects a %s reason with VALIDATION_FAILED and no change', async (_name, reason) => {
    const visitId = await seedVisit();
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, ...(reason === undefined ? {} : { reason }) }, key(`reason-${_name}`)))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).state).toBe('IN_PROGRESS');
  });

  test('is allowed exactly 2 hours after the end and refused one millisecond earlier', async () => {
    const visitId = await seedVisit();
    now = END + 2 * HOUR - 1;
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Sớm' }, key('early')))
      .rejects.toMatchObject({ status: 409, code: 'CLOSE_NOT_ALLOWED_YET' });
    await expect(service.details(actorOf(staff), visitId)).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    now = END + 2 * HOUR;
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Đúng mốc' }, key('boundary')))
      .resolves.toMatchObject({ state: 'STAFF_CLOSED' });
  });

  test.each([
    ['checked out', { checkedOut: true, state: 'COMPLETED' }],
    ['cancelled', { state: 'CANCELLED', checkIn: false }],
    ['already closed', { state: 'STAFF_CLOSED' }],
    ['not checked in', { state: 'ASSIGNED', checkIn: false }]
  ])('refuses a visit that is %s with 409 INVALID_STATE', async (name, options) => {
    const visitId = await seedVisit(options);
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Không hợp lệ' }, key(`state-${name}`)))
      .rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).version).toBe(4);
  });

  test('refuses a stale version and an unknown visit', async () => {
    const visitId = await seedVisit();
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 3, reason: 'Cũ' }, key('stale')))
      .rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
    await expect(service.close(actorOf(staff), String(oid()), { expectedVersion: 0, reason: 'Không có' }, key('unknown')))
      .rejects.toMatchObject({ status: 404 });
  });

  test('missing check-in photo still requires factual review, without inventing cancellation, zero charges or zero wages', async () => {
    const visitId = await seedVisit({ photo: false });
    const result = await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: '  Không ảnh, đã gọi người chăm sóc.  ' }, key('nophoto'));
    expect(result).toMatchObject({ visitId, state: 'STAFF_CLOSED', version: 5, hasCheckInPhoto: false, reviewState: 'PENDING' });
    expect(result.chargeAmount).toBeUndefined();
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    expect(saved).toMatchObject({ state: 'STAFF_CLOSED', version: 5,
      closure: { byUserId: String(staff._id), reason: 'Không ảnh, đã gọi người chăm sóc.', hasCheckInPhoto: false } });
    expect(saved.cancellation).toBeUndefined();
    expect(saved.closedAt.getTime()).toBe(now);
    expect(saved.checkOutAt).toBeUndefined();
    expect(await col('employeescheduleevents').findOne({ type: 'VisitStaffClosed', visitId }))
      .toMatchObject({ actorId: String(staff._id), detail: { outcome: 'STAFF_CLOSED', hasCheckInPhoto: false, version: 5 } });
    expect((await col('bookings').findOne({ _id: saved.bookingId })).state).toBe('CLOSED');
  });

  test('unverified closure without a photo creates no payable credit', async () => {
    const visitId = await seedVisit({ photo: false });
    await service.close(actorOf(admin), visitId, { expectedVersion: 4, reason: 'Không ảnh' }, key('nophoto-consumers'));
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    const completion = visitCompletion(saved);
    expect(completion.done).toBe(false);
    expect(new Date(completion.at).getTime()).toBe(now);
    expect(await col('payrollservicecredits').countDocuments({ bookingId: saved.bookingId })).toBe(0);
  });

  test('an image owned by someone else or bound to another visit does not count as the check-in photo', async () => {
    const visitId = await seedVisit();
    await col('privateimages').updateMany({ careVisitId: visitId }, { $set: { ownerId: oid() } });
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Ảnh của người khác' }, key('foreign-photo')))
      .resolves.toMatchObject({ state: 'STAFF_CLOSED', hasCheckInPhoto: false, reviewState: 'PENDING' });
  });

  test('two staff closing at the same time: exactly one succeeds', async () => {
    const visitId = await seedVisit();
    const attempts = await Promise.allSettled([
      service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Staff một' }, key('race-a')),
      service.close(actorOf(admin), visitId, { expectedVersion: 4, reason: 'Admin' }, key('race-b'))
    ]);
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const loser = attempts.find(item => item.status === 'rejected');
    expect(loser.reason).toMatchObject({ status: 409 });
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).version).toBe(5);
    expect(await col('employeescheduleevents').countDocuments({ type: 'VisitStaffClosed', visitId })).toBe(1);
  });

  test('the same Idempotency-Key replays the same result and a changed body is a conflict', async () => {
    const visitId = await seedVisit();
    const body = { expectedVersion: 4, reason: 'Gửi lặp' };
    const first = await service.close(actorOf(staff), visitId, body, key('replay'));
    now += 5 * 60000;
    await expect(service.close(actorOf(staff), visitId, body, key('replay'))).resolves.toEqual(first);
    await expect(service.close(actorOf(staff), visitId, { ...body, reason: 'Khác' }, key('replay')))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_CONFLICT' });
    expect(await col('employeescheduleevents').countDocuments({ type: 'VisitStaffClosed', visitId })).toBe(1);
  });

  test('requires a valid Idempotency-Key', async () => {
    const visitId = await seedVisit();
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Thiếu khoá' }, undefined))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test.each([['customer', customerUser], ['pet sitter', sitterUser]])('a %s cannot close or list', async (_name, user) => {
    const visitId = await seedVisit();
    await expect(service.close(actorOf(user), visitId, { expectedVersion: 4, reason: 'Không đủ quyền' }, key(`role-${_name}`)))
      .rejects.toMatchObject({ status: 403 });
    await expect(service.needsAction(actorOf(user))).rejects.toMatchObject({ status: 403 });
    await expect(service.details(actorOf(user), visitId)).rejects.toMatchObject({ status: 403 });
  });

  test('a suspended staff account cannot close', async () => {
    const visitId = await seedVisit();
    const suspended = person('STAFF');
    await col('users').insertOne({ ...suspended, state: 'SUSPENDED' });
    await expect(service.close(actorOf(suspended), visitId, { expectedVersion: 4, reason: 'Bị khoá' }, key('suspended')))
      .rejects.toMatchObject({ status: 403 });
  });
});

describe('Admin factual verification and payroll integration', () => {
  const body = extra => ({ expectedVersion: 5, reason: 'Đối chiếu khách và báo cáo', outcome: 'SERVICE_PERFORMED',
    evidenceReference: 'synthetic-review-record-001', actualEndedAt: new Date(END + 5 * 60000).toISOString(), reportsComplete: false, ...extra });
  async function closed() {
    const visitId = await seedVisit({ photo: false });
    await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Chờ đối chiếu' }, key(`verify-close-${visitId}`));
    return visitId;
  }
  test('only Admin verifies actual end; retry produces one immutable credit and no fake checkout', async () => {
    const visitId = await closed(), input = body();
    await expect(service.verify(actorOf(staff), visitId, input, key('verify-role'))).rejects.toMatchObject({ status: 403 });
    const first = await service.verify(actorOf(admin), visitId, input, key('verify-once'));
    expect(first).toMatchObject({ visitId, state: 'STAFF_CLOSED', version: 6, reviewState: 'VERIFIED' });
    expect(await service.verify(actorOf(admin), visitId, input, key('verify-once'))).toEqual(first);
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    expect(saved.checkOutAt).toBeUndefined(); expect(saved.completedAt).toBeUndefined();
    expect(saved.closureVerification).toMatchObject({ byUserId: String(admin._id), reportsComplete: false });
    expect(visitCompletion(saved).done).toBe(true);
    const credits = await col('payrollservicecredits').find({ visitId: saved._id }).toArray();
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ serviceNetVnd: 100000, careMinutes: 33, reportsComplete: false, sourceVersion: 6 });
    expect(+credits[0].completedAt).toBe(END + 5 * 60000);
    expect(await col('bookings').findOne({ _id: saved.bookingId })).toMatchObject({ state: 'CLOSED', completionReviewState: 'VERIFIED' });
    expect((await service.needsAction(actorOf(admin))).items.some(row => row.id === visitId)).toBe(false);
    await expect(service.verify(actorOf(admin), visitId, body({ reportsComplete: true }), key('verify-once')))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  test('no service is a factual conclusion, never a fabricated free charge or refund', async () => {
    const visitId = await closed();
    const input = { expectedVersion: 5, reason: 'Khách xác nhận không thực hiện', outcome: 'NO_SERVICE', evidenceReference: 'synthetic-customer-call' };
    await service.verify(actorOf(admin), visitId, input, key('verify-no-service'));
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    expect(saved.state).toBe('STAFF_CLOSED'); expect(saved.cancellation).toBeUndefined();
    expect(saved.completionAttention.code).toBe('FINANCIAL_RECONCILIATION_REQUIRED');
    expect(visitCompletion(saved).done).toBe(false);
    expect(await col('payrollservicecredits').countDocuments({ visitId: saved._id })).toBe(0);
    expect(await col('refunds').countDocuments({ bookingId: saved.bookingId })).toBe(0);
  });
  test.each([
    { actualEndedAt: new Date(END - HOUR).toISOString() }, { actualEndedAt: new Date(END + 4 * HOUR).toISOString() },
    { evidenceReference: ' ' }, { reportsComplete: undefined }
  ])('rejects invalid actual facts without releasing a credit: %j', async extra => {
    const visitId = await closed();
    await expect(service.verify(actorOf(admin), visitId, body(extra), key(`verify-invalid-${visitId}`))).rejects.toMatchObject({ status: 422 });
    expect((await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) })).version).toBe(5);
  });
  test('conflicting concurrent conclusions commit exactly one outcome', async () => {
    const visitId = await closed();
    const results = await Promise.allSettled([
      service.verify(actorOf(admin), visitId, body(), key('verify-race-yes')),
      service.verify(actorOf(admin), visitId, { expectedVersion: 5, reason: 'Không thực hiện', outcome: 'NO_SERVICE', evidenceReference: 'synthetic-race' }, key('verify-race-no'))
    ]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(await col('employeescheduleevents').countDocuments({ type: 'VisitClosureVerified', visitId })).toBe(1);
  });
  test('mixed completed/no-service booking holds commission for financial reconciliation', async () => {
    const visitId = await closed();
    const row = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) }), sibling = { ...row, _id: oid(), state: 'COMPLETED',
      completedAt: new Date(END), checkOutAt: new Date(END) };
    delete sibling.closure; delete sibling.completionAttention;
    await col('visits').insertOne(sibling);
    await col('bookings').updateOne({ _id: row.bookingId }, { $push: { visitIds: sibling._id }, $set: { state: 'IN_PROGRESS' } });
    await service.verify(actorOf(admin), visitId, { expectedVersion: 5, reason: 'Không có dịch vụ', outcome: 'NO_SERVICE', evidenceReference: 'synthetic-mixed' }, key('verify-mixed'));
    expect(await col('bookings').findOne({ _id: row.bookingId })).toMatchObject({ state: 'CLOSED', completionReviewState: 'FINANCIAL_RECONCILIATION_REQUIRED' });
    expect(await col('payrollservicecredits').countDocuments({ visitId: sibling._id })).toBe(1);
    const held = await createCommissionSources({ connection }).heldBookings([{ bookingId: row.bookingId }]);
    expect(held.has(String(row.bookingId))).toBe(true);
  });
});

describe('needs-action list for visits not checked out', () => {
  test('lists only checked-in visits 2 hours past their end, oldest first, with the dialog fields', async () => {
    await col('visits').deleteMany({});
    const older = await seedVisit({ endAt: END - HOUR }), listed = await seedVisit(), noPhoto = await seedVisit({ photo: false, endAt: END + 5 * 60000 });
    await seedVisit({ endAt: END + 40 * 60000 });
    await seedVisit({ checkedOut: true, state: 'COMPLETED' });
    await seedVisit({ state: 'ASSIGNED', checkIn: false });
    const result = await service.needsAction(actorOf(staff));
    expect(result.items.map(item => item.id)).toEqual([older, listed, noPhoto]);
    expect(result.items[1]).toMatchObject({ bookingCode: 'BK-0033', customerName: 'CUSTOMER', sitterName: 'PET_SITTER', reasonCode: 'NOT_CHECKED_OUT',
      hasCheckInPhoto: true, version: 4, serviceName: 'Dắt chó đi dạo', overdueMs: 2 * HOUR + 10 * 60000 });
    expect(result.items[2].hasCheckInPhoto).toBe(false);
    expect(result.hasMore).toBe(false);
  });

  test('a booking without a booking code is listed with a null code and its id, so the screen can show the end of the id', async () => {
    await col('visits').deleteMany({});
    const visitId = await seedVisit({ code: false });
    const visit = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    const [item] = (await service.needsAction(actorOf(staff))).items;
    expect(item).toMatchObject({ id: visitId, bookingCode: null, bookingId: String(visit.bookingId) });
    expect(await service.details(actorOf(staff), visitId)).toMatchObject({ bookingCode: null, bookingId: String(visit.bookingId) });
  });

  test('the visit end time is the boundary: a visit ending 2 hours ago exactly is listed, one millisecond later is not', async () => {
    await col('visits').deleteMany({});
    const exact = await seedVisit({ endAt: now - 2 * HOUR }), later = await seedVisit({ endAt: now - 2 * HOUR + 1 });
    const ids = (await service.needsAction(actorOf(admin))).items.map(item => item.id);
    expect(ids).toContain(exact);
    expect(ids).not.toContain(later);
  });

  test('a closed visit stays visible as pending verification instead of disappearing', async () => {
    await col('visits').deleteMany({});
    const visitId = await seedVisit();
    await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Đóng' }, key('leave-list'));
    expect((await service.needsAction(actorOf(staff))).items).toEqual([expect.objectContaining({ id: visitId, reasonCode: 'COMPLETION_VERIFICATION_PENDING' })]);
  });
});
