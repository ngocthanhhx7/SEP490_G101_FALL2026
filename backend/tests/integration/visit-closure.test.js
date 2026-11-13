import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createVisitClosureService } from '../../src/services/employee-scheduling/visit-closure.service.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';
import { createUnitOfWork } from '../../src/services/unit-of-work.service.js';
import { visitCompletion } from '../../src/services/complaints/complaint-lifecycle.js';
import { projectEarnings } from '../../src/services/dashboards/earnings.service.js';

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

async function seedVisit({ photo = true, state = 'IN_PROGRESS', checkedOut = false, endAt = END, checkIn = true } = {}) {
  const visitId = oid(), bookingId = oid(), mediaId = (++counter).toString(16).padStart(64, 'a');
  await col('bookings').insertOne({ _id: bookingId, customerId: customerUser._id, state: 'IN_PROGRESS', bookingCode: 'BK-0033', visitIds: [visitId] });
  await col('visits').insertOne({ _id: visitId, bookingId, customerId: customerUser._id, sitterId: sitterUser._id, state, version: 4,
    areaCode: 'DISTRICT_CAU_GIAY', startAt: new Date(endAt - 30 * 60000), endAt: new Date(endAt),
    ...(checkIn ? { checkInAt: new Date(endAt - 28 * 60000) } : {}), ...(checkedOut ? { checkOutAt: new Date(endAt) } : {}),
    evidenceRefs: photo ? [{ kind: 'CHECK_IN', mediaId }] : [], snapshots: { serviceName: 'Dắt chó đi dạo' } });
  if (photo) await col('privateimages').insertOne({ _id: mediaId, state: 'READY', careKind: 'CHECK_IN', ownerId: sitterUser._id, careVisitId: String(visitId) });
  return String(visitId);
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_visit_closure' }).asPromise();
  await provisionEmployeeScheduling(connection);
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

  test('the closed visit counts as done for the complaint module and keeps the booking untouched', async () => {
    const visitId = await seedVisit();
    await service.close(actorOf(admin), visitId, { expectedVersion: 4, reason: 'Đã gọi người chăm sóc.' }, key('complaint'));
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    const completion = visitCompletion(saved);
    expect(completion.done).toBe(true);
    expect(new Date(completion.at).getTime()).toBe(now);
    expect((await col('bookings').findOne({ _id: saved.bookingId })).state).toBe('IN_PROGRESS');
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

  test('without a check-in photo the visit is CANCELLED at no charge with who, when and why', async () => {
    const visitId = await seedVisit({ photo: false });
    const result = await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: '  Không ảnh, đã gọi người chăm sóc.  ' }, key('nophoto'));
    expect(result).toMatchObject({ visitId, state: 'CANCELLED', version: 5, hasCheckInPhoto: false, chargeAmount: 0 });
    expect(result.cancelledAt.getTime()).toBe(now);
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    expect(saved).toMatchObject({ state: 'CANCELLED', version: 5,
      cancellation: { byUserId: String(staff._id), reason: 'Không ảnh, đã gọi người chăm sóc.', chargeAmount: 0 } });
    expect(saved.cancelledAt.getTime()).toBe(now);
    expect(saved.cancellation.at.getTime()).toBe(now);
    expect(saved.closedAt).toBeUndefined();
    expect(saved.closure).toBeUndefined();
    expect(saved.checkOutAt).toBeUndefined();
    expect(await col('employeescheduleevents').findOne({ type: 'VisitStaffClosed', visitId }))
      .toMatchObject({ actorId: String(staff._id), detail: { outcome: 'CANCELLED', hasCheckInPhoto: false, version: 5 } });
    expect((await col('bookings').findOne({ _id: saved.bookingId })).state).toBe('IN_PROGRESS');
  });

  test('a cancelled visit is not done for complaints and earns nothing', async () => {
    const visitId = await seedVisit({ photo: false });
    await service.close(actorOf(admin), visitId, { expectedVersion: 4, reason: 'Không ảnh' }, key('nophoto-consumers'));
    const saved = await col('visits').findOne({ _id: new mongoose.Types.ObjectId(visitId) });
    const completion = visitCompletion(saved);
    expect(completion.done).toBe(false);
    expect(new Date(completion.at).getTime()).toBe(now);
    const earnings = projectEarnings({ items: [{ id: visitId, visitId, sitterId: String(sitterUser._id), visitState: saved.state }] }, { userId: String(sitterUser._id) });
    expect(earnings.items).toEqual([]);
    expect(earnings.metrics.every(metric => metric.value === 0)).toBe(true);
  });

  test('an image owned by someone else or bound to another visit does not count as the check-in photo', async () => {
    const visitId = await seedVisit();
    await col('privateimages').updateMany({ careVisitId: visitId }, { $set: { ownerId: oid() } });
    await expect(service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Ảnh của người khác' }, key('foreign-photo')))
      .resolves.toMatchObject({ state: 'CANCELLED', hasCheckInPhoto: false, chargeAmount: 0 });
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

  test('the visit end time is the boundary: a visit ending 2 hours ago exactly is listed, one millisecond later is not', async () => {
    await col('visits').deleteMany({});
    const exact = await seedVisit({ endAt: now - 2 * HOUR }), later = await seedVisit({ endAt: now - 2 * HOUR + 1 });
    const ids = (await service.needsAction(actorOf(admin))).items.map(item => item.id);
    expect(ids).toContain(exact);
    expect(ids).not.toContain(later);
  });

  test('a closed visit leaves the list', async () => {
    await col('visits').deleteMany({});
    const visitId = await seedVisit();
    await service.close(actorOf(staff), visitId, { expectedVersion: 4, reason: 'Đóng' }, key('leave-list'));
    expect((await service.needsAction(actorOf(staff))).items).toEqual([]);
  });
});
