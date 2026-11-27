import { test, expect, jest } from '@jest/globals';
jest.unstable_mockModule('../../../src/models/finance-source.model.js', () => ({ financeSourceModels: c => c.storage }));
jest.unstable_mockModule('../../../src/models/sitter-application.model.js', () => ({ sitterApplicationModels: c => ({ SitterStatus: c.sitterStatus }) }));
jest.unstable_mockModule('../../../src/services/settlements/source-provisioning.js', () => ({ assertFinanceSourceStorage: async () => undefined }));
jest.unstable_mockModule('../../../src/services/payroll/payroll-storage.service.js', () => ({ assertPayrollStorage: async () => undefined }));
jest.unstable_mockModule('../../../src/services/payroll/completion-payroll-source.service.js', () => ({ recordEmployeeServiceCompletion: async () => undefined }));
jest.unstable_mockModule('../../../src/services/notifications/domain-notifications.service.js', () => ({ createDomainNotifications: ({ connection }) => ({ visit: connection.notify }) }));
const { createBookingFinanceSourceService } = await import('../../../src/services/settlements/booking-finance-source.service.js');
const SITTER = { userId: '111111111111111111111111', state: 'ACTIVE', roles: ['PET_SITTER'] };
const VISIT = '222222222222222222222222', BOOKING = '333333333333333333333333';
const MEDIA = 'a'.repeat(64), CHECKLIST_PHOTO = 'b'.repeat(64);
const at = value => new Date('2026-11-18T' + value + ':00+07:00');

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

function fixture({ started = false, clock = '10:00', foreign = false, suspended = false } = {}) {
  const visit = { _id: VISIT, bookingId: BOOKING, sitterId: foreign ? '444444444444444444444444' : SITTER.userId,
    state: started ? 'IN_PROGRESS' : 'ASSIGNED', version: 0, startAt: at('10:00'), endAt: at('11:00'),
    ...(started ? { checkInAt: at('10:00') } : {}), evidenceRefs: [],
    snapshots: { checklistItemIds: ['feed', 'water'], privateAccessNotes: 'SYNTHETIC_PRIVATE', employeeServiceNetVnd: 100000 },
    checklist: [], checklistPhotoIds: [CHECKLIST_PHOTO] };
  const booking = { _id: BOOKING, customerId: '555555555555555555555555', visitIds: [VISIT], originalVisitCount: 1,
    paymentMode: 'POSTPAY', state: started ? 'IN_PROGRESS' : 'ASSIGNED', version: 0 };
  const db = database({ visits: [visit], bookings: [booking], privateimages: [{ _id: MEDIA, ownerId: SITTER.userId,
    state: 'READY', contentDigest: 'c'.repeat(64), byteLength: 1024 }], commands: [], events: [], bindings: [] });
  db.connection.storage = { FinanceSourceCommand: db.model('commands'), FinanceSourceEvent: db.model('events'), CareMediaBinding: db.model('bindings') };
  db.connection.sitterStatus = { findOne: filter => ({ session() { return this; }, lean: async () =>
    !suspended && String(filter.userId) === SITTER.userId && filter.status === 'ACTIVE' ? { status: 'ACTIVE' } : null }) };
  db.connection.notify = jest.fn(async () => undefined);
  return { ...db, notify: db.connection.notify, service: createBookingFinanceSourceService({ connection: db.connection, clock: () => at(clock) }),
    input: { actor: SITTER, visitId: VISIT, expectedVersion: 0, idempotencyKey: 'synthetic-execution', mediaId: MEDIA } };
}


// SRS: UC-36/44; GBR-01/02/04; IV Security: chỉ sitter được giao xem execution; sitter suspended vẫn xem visit cũ.
test("EXEC-VISIT-01-UTCID01 [N] Sitter được giao đọc checklist mà không lộ dữ liệu riêng khác", async () => {
  const f = fixture(), before = JSON.stringify(f.state());
  const actual = await f.service.readVisit(SITTER, VISIT);
  expect(actual).toMatchObject({ visitId: VISIT, state: 'ASSIGNED', checklistItemIds: ['feed', 'water'], checklist: [] });
  expect(actual).not.toHaveProperty('privateAccessNotes');
  expect(JSON.stringify(actual)).not.toContain('SYNTHETIC_PRIVATE');
  expect(JSON.stringify(f.state())).toBe(before); expect(f.writes).toEqual([]);
});

// SRS: GBR-02
test("EXEC-VISIT-01-UTCID02 [A] Sitter khác không được đọc execution", async () => {
  const f = fixture({ foreign: true });
  await expect(f.service.readVisit(SITTER, VISIT)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  expect(f.writes).toEqual([]);
});

// SRS: GBR-01
test("EXEC-VISIT-01-UTCID03 [A] Anonymous không được đọc execution", async () => {
  const f = fixture();
  await expect(f.service.readVisit(null, VISIT)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  expect(f.writes).toEqual([]);
});

// SRS: GBR-02; Permission Matrix
test("EXEC-VISIT-01-UTCID04 [A] Customer không dùng reader dành cho sitter", async () => {
  const f = fixture();
  await expect(f.service.readVisit({ ...SITTER, roles: ["CUSTOMER"] }, VISIT)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(f.writes).toEqual([]);
});

// SRS: GBR-04: suspended sitter vẫn sign in để xem past visits và earnings
// DEF_EXEC_SUSPENDED_HISTORY: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("EXEC-VISIT-01-UTCID05 [N] Sitter suspended vẫn xem được execution của visit cũ", async () => {
  const f = fixture({ started: true, suspended: true, clock: '12:00' });
  f.state().visits[0].state = 'COMPLETED'; f.state().visits[0].checkOutAt = at('11:00');
  f.state().visits[0].completedAt = at('11:00'); f.state().bookings[0].state = 'COMPLETED';
  expect(await f.service.readVisit(SITTER, VISIT)).toMatchObject({ visitId: VISIT, state: 'COMPLETED' });
  expect(f.writes).toEqual([]);
});
