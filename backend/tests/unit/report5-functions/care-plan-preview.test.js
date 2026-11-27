import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/models/finance-source.model.js', () => ({ financeSourceModels: c => c.storage }));
jest.unstable_mockModule('../../../src/services/settlements/source-provisioning.js', () => ({ assertFinanceSourceStorage: async () => undefined }));
const { createBookingCarePlanService } = await import('../../../src/services/booking-proposals/booking-care-plan.service.js');
const STAFF = { userId: '111111111111111111111111', state: 'ACTIVE', roles: ['STAFF'] };
const ADMIN = { ...STAFF, roles: ['ADMIN'] };
const BOOKING = '222222222222222222222222', VISIT = '333333333333333333333333';
const BODY = { expectedVersion: 0, shiftMinutes: 480 };

function copy(value) {
  if (value instanceof Date) return new Date(value);
  if (value?.toHexString) return value.toHexString();
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
}
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(option => matches(row, option));
    const found = key.split('.').reduce((v, k) => v?.[k], row);
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !value.toHexString) {
      return Object.entries(value).every(([op, arg]) => {
        if (op === '$in') return arg.some(x => String(found) === String(x));
        if (op === '$exists') return (found !== undefined) === arg;
        if (op === '$ne') return String(found) !== String(arg);
        throw new Error('Unsupported fixture operator: ' + op);
      });
    }
    return String(found) === String(value);
  });
}
function apply(row, update) {
  Object.assign(row, copy(update.$set ?? {}));
  for (const [key, amount] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + amount;
  for (const [key, value] of Object.entries(update.$push ?? {})) (row[key] ??= []).push(copy(value));
  return row;
}
function database(seed) {
  let state = copy(seed);
  const writes = [];
  const collection = name => ({
    findOne: async (filter, options = {}) => copy((options.session?.data ?? state)[name]?.find(r => matches(r, filter)) ?? null),
    find: (filter, options = {}) => ({ limit() { return this; }, toArray: async () => copy((options.session?.data ?? state)[name]?.filter(r => matches(r, filter)) ?? []) }),
    updateOne: async (filter, update, options = {}) => {
      const row = (options.session?.data ?? state)[name]?.find(r => matches(r, filter));
      if (!row) return { matchedCount: 0 }; apply(row, update); writes.push(name); return { matchedCount: 1 };
    },
    updateMany: async (filter, update, options = {}) => {
      const rows = (options.session?.data ?? state)[name]?.filter(r => matches(r, filter)) ?? [];
      rows.forEach(row => apply(row, update)); writes.push(name); return { matchedCount: rows.length };
    },
    findOneAndUpdate: async (filter, update, options = {}) => {
      const row = (options.session?.data ?? state)[name]?.find(r => matches(r, filter));
      if (!row) return null; apply(row, update); writes.push(name); return copy(row);
    },
    insertMany: async (rows, options = {}) => { ((options.session?.data ?? state)[name] ??= []).push(...copy(rows)); writes.push(name); }
  });
  const connection = { db: { collection }, transaction: async callback => {
    const session = { data: copy(state) }; const result = await callback(session); state = session.data; return result;
  } };
  function model(name) { return {
    findById: id => { let session; return { session(s) { session = s; return this; }, lean: async () => copy((session?.data ?? state)[name]?.find(r => String(r._id) === String(id)) ?? null) }; },
    create: async (rows, options = {}) => { ((options.session?.data ?? state)[name] ??= []).push(...copy(rows)); writes.push(name); },
    exists: filter => { let session; return { session(s) { session = s; return this; }, then(resolve, reject) { return Promise.resolve((session?.data ?? state)[name]?.some(r => matches(r, filter)) ?? false).then(resolve, reject); } }; }
  }; }
  return { connection, model, writes, state: () => state };
}

function fixture() {
  const booking = { _id: BOOKING, customerId: '444444444444444444444444', version: 0, carePlanState: 'NEEDS_REVIEW',
    state: 'DISPATCH_PENDING', visitIds: [VISIT], paymentSnapshot: { amountVnd: 150000, currency: 'VND' },
    checkoutSnapshot: { policyVersion: 'PWC-CHECKOUT-2026-10-30-v1', customerVisits: [{ _id: VISIT, serviceId: 'service',
      petIds: ['pet'], location: 'HOME', areaCode: 'AREA_A', startAt: '2026-11-18T10:00:00+07:00', endAt: '2026-11-18T11:00:00+07:00',
      snapshots: { boarding: false, serviceName: 'Home visit', employeeServiceNetVnd: 100000, careInstructions: 'Nước uống' } }] } };
  const db = database({ bookings: [booking], visits: [{ _id: VISIT, state: 'SCHEDULED', version: 0 }], commands: [], events: [] });
  db.connection.storage = { FinanceSourceCommand: db.model('commands'), FinanceSourceEvent: db.model('events') };
  return { ...db, service: createBookingCarePlanService({ connection: db.connection, clock: () => Date.parse('2026-11-16T03:00:00Z') }) };
}

// SRS: GBR-01/02/03; UC-25/40; data rule Price snapshot: bảo vệ thao tác nội bộ và giữ lịch/khai báo/giá booking chăm tại nhà.
test("CARE-PLAN-01-UTCID01 [N] Staff xem lịch HOME mà không thay đổi booking", async () => {
  const f = fixture(), before = JSON.stringify(f.state());
  const actual = await f.service.preview(STAFF, BOOKING, BODY);
  expect(actual.shifts).toHaveLength(1); expect(actual.shifts[0]).toMatchObject({ customerVisitId: VISIT, serviceName: 'Home visit' });
  expect(actual.shifts[0].startAt).toEqual(new Date('2026-11-18T10:00:00+07:00'));
  expect(actual.shifts[0].endAt).toEqual(new Date('2026-11-18T11:00:00+07:00'));
  expect(JSON.stringify(f.state())).toBe(before); expect(f.writes).toEqual([]);
});

// SRS: GBR-03; UC-25
test("CARE-PLAN-01-UTCID02 [N] Admin có quyền xem như Staff", async () => {
  const f = fixture();
  expect((await f.service.preview(ADMIN, BOOKING, BODY)).shifts).toHaveLength(1);
  expect(f.writes).toEqual([]);
});

// SRS: GBR-01
test("CARE-PLAN-01-UTCID03 [A] Anonymous không được xem kế hoạch nội bộ", async () => {
  const f = fixture();
  await expect(f.service.preview(null, BOOKING, BODY)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  expect(f.writes).toEqual([]);
});
