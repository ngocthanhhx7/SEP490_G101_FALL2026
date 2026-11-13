import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { createNeedsActionService } from '../../src/services/employee-scheduling/needs-action.service.js';
import { provisionEmployeeScheduling } from '../../src/services/employee-scheduling/scheduling-storage.service.js';
import { employeeSchedulingModels } from '../../src/models/employee-scheduling.model.js';

const oid = () => new mongoose.Types.ObjectId();
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-04T01:40:00Z'); // 08:40 on 04/11/2026 in Vietnam
const TODAY_START = Date.parse('2026-11-03T17:00:00Z'); // 00:00 on 04/11/2026 in Vietnam
const SECRET = 'visit-board-cursor-secret-32-bytes!!';
let replica, connection, service, now, counter = 0;
const col = name => connection.db.collection(name);
const person = (role, displayName) => ({ _id: oid(), state: 'ACTIVE', roles: [role], displayName, authEpoch: 0 });
const staff = person('STAFF', 'Đặng Thu Trang'), admin = person('ADMIN', 'Quản trị'), customerUser = person('CUSTOMER', 'Bùi Thanh Tâm'),
  customer2 = person('CUSTOMER', 'Ngô Minh Đức'), sitterUser = person('PET_SITTER', 'Lê Văn Minh'), sitter2 = person('PET_SITTER', 'Phạm Thu Hà');
const actorOf = user => ({ userId: String(user._id), state: 'ACTIVE', roles: user.roles, authEpoch: 0 });
const list = (query = {}, who = staff, svc = service) => svc.list(actorOf(who), query);

// A visit with its booking. The booking meets the dispatch conditions unless `paid` is false.
async function seed({ state = 'SCHEDULED', start, end, sitter = null, customer = customerUser, areaCode = 'DISTRICT_CAU_GIAY', review,
  checkIn = false, checkOut = false, withdrawal = false, withdrawalBy, paid = true, code = `BK-${String(++counter).padStart(4, '0')}` } = {}) {
  const visitId = oid(), bookingId = oid(), startAt = new Date(start), endAt = new Date(end ?? start + 30 * MIN), assignedAt = sitter ? new Date(NOW - DAY) : undefined;
  await col('bookings').insertOne({ _id: bookingId, customerId: customer._id, state: 'DISPATCH_PENDING', carePlanState: 'APPROVED', paymentMode: paid ? 'POSTPAY' : 'PREPAY',
    paymentState: paid ? 'UNPAID' : 'UNPAID', ...(code ? { bookingCode: code } : {}), visitIds: [visitId] });
  await col('visits').insertOne({ _id: visitId, bookingId, customerId: customer._id, sitterId: sitter?._id ?? null, state, version: 3, areaCode, startAt, endAt,
    ...(assignedAt ? { assignedAt } : {}), ...(review ? { dispatchReview: { code: review, at: new Date(NOW - HOUR) } } : {}),
    ...(checkIn ? { checkInAt: new Date(startAt.getTime() + 2 * MIN) } : {}), ...(checkOut ? { checkOutAt: endAt } : {}),
    ...(withdrawal ? { withdrawalRequest: { sitterId: (withdrawalBy ?? sitter)._id, assignedAt, reasonCode: 'SICK', at: new Date(NOW - HOUR) } } : {}),
    snapshots: { serviceName: 'Dắt chó đi dạo' } });
  return { visitId: String(visitId), bookingId: String(bookingId) };
}
const codesOf = item => item.reasons.map(reason => reason.code);

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_needs_action' }).asPromise();
  await provisionEmployeeScheduling(connection);
  await col('users').insertMany([staff, admin, customerUser, customer2, sitterUser, sitter2]);
  service = createNeedsActionService({ repository: { models: employeeSchedulingModels(connection), col }, clock: () => now, cursorSecret: SECRET });
}, 600000);
afterAll(async () => { await connection?.close(); await replica?.stop(); }, 30000);
beforeEach(async () => {
  now = NOW;
  await Promise.all([col('visits').deleteMany({}), col('bookings').deleteMany({})]);
  await col('users').deleteMany({ displayName: /^Trùng Tên/u });
});

describe('Needs action reasons (R3 10.1.1)', () => {
  test('every reason with a data source lists its visit, most urgent first: late, then the least time left', async () => {
    const r1 = await seed({ start: NOW + 3 * DAY, review: 'NO_ELIGIBLE_SITTER' });
    const r2 = await seed({ start: NOW + 19 * HOUR });
    const r3 = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 35 * MIN });
    const r4 = await seed({ state: 'ASSIGNED', sitter: sitter2, start: NOW + 5 * HOUR, withdrawal: true });
    const r6 = await seed({ state: 'IN_PROGRESS', sitter: sitterUser, start: NOW - 160 * MIN, checkIn: true });
    const result = await list();
    expect(result.items.map(item => item.id)).toEqual([r6, r3, r4, r2, r1].map(entry => entry.visitId));
    expect(result.items.map(item => item.reasons[0])).toEqual([
      { code: 'NOT_CHECKED_OUT_2H', late: true, ms: 130 * MIN }, { code: 'NOT_CHECKED_IN_30M', late: true, ms: 35 * MIN },
      { code: 'WITHDRAWAL_UNDER_12H', late: false, ms: 5 * HOUR }, { code: 'NO_SITTER_24H', late: false, ms: 19 * HOUR },
      { code: 'NO_SITTER_TO_OFFER', late: false, ms: 3 * DAY }]);
    expect(result.counts).toEqual({ needsAction: 5, needsActionLimited: false });
    expect(result.items[0]).toMatchObject({ bookingCode: expect.stringMatching(/^BK-/u), customerName: 'Bùi Thanh Tâm', sitterName: 'Lê Văn Minh', serviceName: 'Dắt chó đi dạo' });
    expect(result.hasMore).toBe(false);
  });

  test.each([
    ['no pet sitter exactly 24 hours before the start', { start: NOW + DAY }, true],
    ['no pet sitter one millisecond more than 24 hours before the start', { start: NOW + DAY + 1 }, false],
    ['not checked in exactly 30 minutes after the start', { state: 'ASSIGNED', sitter: sitterUser, start: NOW - 30 * MIN }, true],
    ['not checked in one millisecond before 30 minutes', { state: 'ASSIGNED', sitter: sitterUser, start: NOW - 30 * MIN + 1 }, false],
    ['not checked out exactly 2 hours after the end', { state: 'IN_PROGRESS', sitter: sitterUser, start: NOW - 2 * HOUR - 30 * MIN, checkIn: true }, true],
    ['not checked out one millisecond before 2 hours', { state: 'IN_PROGRESS', sitter: sitterUser, start: NOW - 2 * HOUR - 30 * MIN + 1, checkIn: true }, false]
  ])('boundary: %s', async (_name, options, listed) => {
    const { visitId } = await seed(options);
    expect((await list()).items.map(item => item.id)).toEqual(listed ? [visitId] : []);
  });

  test.each([
    ['an assigned visit that already checked in', { state: 'ASSIGNED', sitter: sitterUser, start: NOW - HOUR, checkIn: true }],
    ['an unassigned visit more than 24 hours away without a review', { start: NOW + 30 * HOUR }],
    ['a visit that was checked out', { state: 'IN_PROGRESS', sitter: sitterUser, start: NOW - 4 * HOUR, checkIn: true, checkOut: true }],
    ['a completed visit', { state: 'COMPLETED', sitter: sitterUser, start: NOW - 5 * HOUR, checkIn: true, checkOut: true }],
    ['a visit whose booking is prepaid and unpaid', { start: NOW + 5 * HOUR, paid: false }],
    ['a withdrawal request left by an earlier pet sitter', { state: 'ASSIGNED', sitter: sitterUser, start: NOW + 5 * HOUR, withdrawal: true, withdrawalBy: sitter2 }]
  ])('does not list %s', async (_name, options) => {
    await seed(options);
    expect(await list()).toMatchObject({ items: [], counts: { needsAction: 0 } });
  });

  test('one row per visit keeps every reason; filtering by a secondary reason still finds it', async () => {
    const both = await seed({ start: NOW + 2 * HOUR, review: 'STAFF_REVIEW_REQUIRED' });
    const lateWithdrawal = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 35 * MIN, withdrawal: true });
    const all = await list();
    expect(all.items.map(item => [item.id, codesOf(item)])).toEqual([
      [lateWithdrawal.visitId, ['NOT_CHECKED_IN_30M', 'WITHDRAWAL_UNDER_12H']], [both.visitId, ['NO_SITTER_TO_OFFER', 'NO_SITTER_24H']]]);
    expect((await list({ reason: 'NO_SITTER_24H' })).items.map(item => item.id)).toEqual([both.visitId]);
    expect((await list({ reason: 'WITHDRAWAL_UNDER_12H' })).items.map(item => item.id)).toEqual([lateWithdrawal.visitId]);
    expect((await list({ reason: 'NOT_CHECKED_OUT_2H' })).items).toEqual([]);
  });

  test('a visit whose start was reached without a pet sitter is listed as late under "no pet sitter", not "nobody left to offer"', async () => {
    const { visitId } = await seed({ start: NOW - 10 * MIN, review: 'SHIFT_START_REACHED' });
    const [item] = (await list()).items;
    expect(item).toMatchObject({ id: visitId, reviewCode: 'SHIFT_START_REACHED' });
    expect(item.reasons).toEqual([{ code: 'NO_SITTER_24H', late: true, ms: 10 * MIN }]);
  });

  test('counts describe the whole list and do not change with the search or the filters', async () => {
    await seed({ start: NOW + 2 * HOUR, areaCode: 'DISTRICT_CAU_GIAY', customer: customerUser });
    await seed({ start: NOW + 3 * HOUR, areaCode: 'DISTRICT_DONG_DA', customer: customer2 });
    await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 40 * MIN, areaCode: 'DISTRICT_DONG_DA', customer: customer2 });
    expect((await list()).counts.needsAction).toBe(3);
    for (const query of [{ areaCode: 'DISTRICT_DONG_DA' }, { reason: 'NOT_CHECKED_IN_30M' }, { search: 'Ngô Minh' }, { search: 'khong co ai' }]) {
      expect((await list(query)).counts).toEqual({ needsAction: 3, needsActionLimited: false });
    }
    expect((await list({ areaCode: 'DISTRICT_DONG_DA' })).items).toHaveLength(2);
    expect((await list({ areaCode: 'DISTRICT_DONG_DA', reason: 'NO_SITTER_24H' })).items).toHaveLength(1);
  });

  test('search finds a visit by customer, pet sitter, booking code and the end of the booking id', async () => {
    const a = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 40 * MIN, customer: customerUser, code: 'BK-0051' });
    const b = await seed({ start: NOW + 2 * HOUR, customer: customer2, code: null });
    const ids = async search => (await list({ search })).items.map(item => item.id);
    expect(await ids('thanh tâm')).toEqual([a.visitId]);
    expect(await ids('lê văn')).toEqual([a.visitId]);
    expect(await ids('bk-0051')).toEqual([a.visitId]);
    expect(await ids(b.bookingId.slice(-6))).toEqual([b.visitId]);
    expect(await ids(b.bookingId)).toEqual([b.visitId]);
    expect(await ids('không có')).toEqual([]);
    expect((await list({ search: 'thanh tâm' })).items[0].bookingId).toBe(a.bookingId);
  });

  test('a reason that reaches the read limit is counted as "at least" and flagged', async () => {
    const bookingId = oid();
    await col('bookings').insertOne({ _id: bookingId, customerId: customerUser._id, state: 'DISPATCH_PENDING', carePlanState: 'APPROVED', paymentMode: 'POSTPAY' });
    await col('visits').insertMany(Array.from({ length: 501 }, (_, index) => ({ _id: oid(), bookingId, customerId: customerUser._id, sitterId: null, state: 'SCHEDULED',
      version: 0, areaCode: 'DISTRICT_CAU_GIAY', startAt: new Date(NOW + HOUR + index * MIN), endAt: new Date(NOW + 2 * HOUR + index * MIN), snapshots: { serviceName: 'x' } })));
    const result = await list();
    expect(result.counts).toEqual({ needsAction: 500, needsActionLimited: true });
    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  test('only Staff and Admin can read; every other role gets 403', async () => {
    await expect(list({}, admin)).resolves.toMatchObject({ tab: 'needs-action' });
    for (const user of [customerUser, sitterUser]) await expect(list({}, user)).rejects.toMatchObject({ status: 403 });
    await expect(service.list({ ...actorOf(staff), state: 'LOCKED' }, {})).rejects.toMatchObject({ status: 403 });
  });

  test.each([
    [{ tab: 'weekly' }], [{ search: 'a' }], [{ search: 'x'.repeat(51) }], [{ reason: 'DEBT' }], [{ areaCode: 'cau giay' }], [{ cursor: 'abc' }], [{ unknown: '1' }], [{ search: ['a', 'b'] }]
  ])('rejects the invalid query %j with 422', async query => {
    await expect(list(query)).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });
});

describe('All visits', () => {
  async function seedToday(count) {
    const ids = [];
    for (let index = 0; index < count; index++) ids.push((await seed({ state: 'ASSIGNED', sitter: sitterUser, start: TODAY_START + index * MIN })).visitId);
    return ids;
  }

  test('starts at 00:00 today in time order and pages with a cursor without repeating or skipping a visit', async () => {
    const yesterday = await seed({ state: 'COMPLETED', sitter: sitterUser, start: TODAY_START - HOUR });
    const ids = await seedToday(55);
    const first = await list({ tab: 'all' });
    expect(first.items.map(item => item.id)).toEqual(ids.slice(0, 50));
    // The same visits are also late (not checked in), and the count of the other tab does not depend on the page.
    expect(first).toMatchObject({ hasMore: true, limited: false, counts: { needsAction: 55 } });
    const second = await list({ tab: 'all', cursor: first.nextCursor });
    expect(second.items.map(item => item.id)).toEqual(ids.slice(50));
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });
    expect([...first.items, ...second.items].map(item => item.id)).not.toContain(yesterday.visitId);
    expect(first.items[0]).toMatchObject({ sitterName: 'Lê Văn Minh', state: 'ASSIGNED', customerName: 'Bùi Thanh Tâm' });
  });

  test('a cursor only works for the same user and the same search, filters and tab', async () => {
    await seedToday(51);
    const { nextCursor } = await list({ tab: 'all' });
    await expect(list({ tab: 'all', cursor: nextCursor }, admin)).rejects.toMatchObject({ status: 422 });
    await expect(list({ tab: 'all', areaCode: 'DISTRICT_CAU_GIAY', cursor: nextCursor })).rejects.toMatchObject({ status: 422 });
    await expect(list({ tab: 'all', cursor: `${nextCursor}x` })).rejects.toMatchObject({ status: 422 });
    await expect(list({ tab: 'all', cursor: 'not-a-cursor' })).rejects.toMatchObject({ status: 422 });
  });

  test('a search also finds past visits and lists the newest first', async () => {
    const old = await seed({ state: 'COMPLETED', sitter: sitterUser, start: NOW - 20 * DAY });
    const recent = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW + HOUR });
    const other = await seed({ state: 'ASSIGNED', sitter: sitter2, start: NOW + 2 * HOUR });
    const byName = await list({ tab: 'all', search: 'lê văn minh' });
    expect(byName.items.map(item => item.id)).toEqual([recent.visitId, old.visitId]);
    expect((await list({ tab: 'all', search: 'Phạm Thu' })).items.map(item => item.id)).toEqual([other.visitId]);
    expect((await list({ tab: 'all' })).items.map(item => item.id)).toEqual([recent.visitId, other.visitId]);
  });

  test('a search finds a customer through the booking, a whole booking id and a booking code', async () => {
    const a = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW + HOUR, customer: customer2, code: 'BK-0042' });
    await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW + 2 * HOUR, customer: customerUser });
    const ids = async search => (await list({ tab: 'all', search })).items.map(item => item.id);
    expect(await ids('ngô minh đức')).toEqual([a.visitId]);
    expect(await ids(a.bookingId)).toEqual([a.visitId]);
    expect(await ids('bk-0042')).toEqual([a.visitId]);
    expect(await ids('không ai tên vậy')).toEqual([]);
  });

  test('the service area and the reason filters combine with the search', async () => {
    const late = await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 40 * MIN, areaCode: 'DISTRICT_DONG_DA' });
    await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW + HOUR, areaCode: 'DISTRICT_DONG_DA' });
    await seed({ state: 'ASSIGNED', sitter: sitterUser, start: NOW - 50 * MIN, areaCode: 'DISTRICT_CAU_GIAY' });
    const ids = async query => (await list({ tab: 'all', ...query })).items.map(item => item.id);
    expect(await ids({ areaCode: 'DISTRICT_DONG_DA' })).toHaveLength(2);
    expect(await ids({ reason: 'NOT_CHECKED_IN_30M', areaCode: 'DISTRICT_DONG_DA' })).toEqual([late.visitId]);
    expect(await ids({ reason: 'NOT_CHECKED_IN_30M', search: 'lê văn' })).toHaveLength(2);
    expect(await ids({ reason: 'NO_SITTER_24H', search: 'lê văn' })).toEqual([]);
  });

  test('more than 20 people matching a name limits the search and says so', async () => {
    await col('users').insertMany(Array.from({ length: 21 }, (_, index) => person('CUSTOMER', `Trùng Tên ${index}`)));
    const result = await list({ tab: 'all', search: 'Trùng Tên' });
    expect(result.limited).toBe(true);
  });

  test('a missing cursor secret does not stop the module: lists work, and only a second page answers 503', async () => {
    const bare = createNeedsActionService({ repository: { models: employeeSchedulingModels(connection), col }, clock: () => now });
    await seedToday(3);
    await expect(list({ tab: 'all' }, staff, bare)).resolves.toMatchObject({ hasMore: false });
    await expect(list({}, staff, bare)).resolves.toMatchObject({ tab: 'needs-action' });
    await seedToday(48);
    await expect(list({ tab: 'all' }, staff, bare)).rejects.toMatchObject({ status: 503, code: 'VISIT_BOARD_UNAVAILABLE' });
  });
});
