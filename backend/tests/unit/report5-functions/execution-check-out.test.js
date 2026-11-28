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
    deleteOne: async (filter, { session }) => {
      const rows = session.data[name] ?? [];
      const index = rows.findIndex(row => matches(row, filter));
      if (index === -1) return { deletedCount: 0 };
      rows.splice(index, 1);
      writes.push(name);
      return { deletedCount: 1 };
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
    state: 'READY', contentDigest: 'c'.repeat(64), byteLength: 1024 }], commands: [], events: [], bindings: [], employeevisittravels: [{ _id: `dog-walk:${VISIT}` }] });
  db.connection.storage = { FinanceSourceCommand: db.model('commands'), FinanceSourceEvent: db.model('events'), CareMediaBinding: db.model('bindings') };
  db.connection.sitterStatus = { findOne: filter => ({ session() { return this; }, lean: async () =>
    !suspended && String(filter.userId) === SITTER.userId && filter.status === 'ACTIVE' ? { status: 'ACTIVE' } : null }) };
  db.connection.notify = jest.fn(async () => undefined);
  return { ...db, notify: db.connection.notify, service: createBookingFinanceSourceService({ connection: db.connection, clock: () => at(clock) }),
    input: { actor: SITTER, visitId: VISIT, expectedVersion: 0, idempotencyKey: 'synthetic-execution', mediaId: MEDIA } };
}
function done() { return [{ itemId: 'feed', status: 'DONE' }, { itemId: 'water', status: 'DONE' }]; }

// SRS: UC-43 Normal Flow; GBR-16
test("EXEC-VISIT-04-UTCID01 [N] Checklist DONE và ảnh hợp lệ cho phép checkout", async () => {
  const f = fixture({ started: true, clock: '11:00' }); f.state().visits[0].checklist = done();
  f.state().visits[0].customerNote = 'Bé ăn uống bình thường.';
  expect(await f.service.checkOut(f.input)).toMatchObject({ visitId: VISIT, state: 'COMPLETED', version: 1 });
  expect(f.state().visits[0].checkOutAt).toEqual(at('11:00'));
  expect(f.state().visits[0].evidenceRefs).toContainEqual({ kind: 'CHECK_OUT', mediaId: MEDIA });
  expect(f.state().employeevisittravels).toEqual([]);
});

// SRS: UC-43 bước2; GBR-16
test("EXEC-VISIT-04-UTCID02 [N] Task skipped có lý do vẫn checkout được", async () => {
  const f = fixture({ started: true, clock: '11:00' });
  f.state().visits[0].checklist = [{ itemId: 'feed', status: 'SKIPPED', reason: 'Pet không ăn' }, { itemId: 'water', status: 'DONE' }];
  f.state().visits[0].customerNote = 'Bé đã uống nước đầy đủ.';
  expect(await f.service.checkOut(f.input)).toMatchObject({ state: 'COMPLETED' });
});

// SRS: UC-43 Alternative Step2; GBR-16; MSG30
test("EXEC-VISIT-04-UTCID03 [A] Required task chưa làm thì không checkout", async () => {
  const f = fixture({ started: true }); f.state().visits[0].checklist = [{ itemId: "feed", status: "DONE" }];
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({ code: 'CHECKLIST_REQUIRED', status: 409 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-43 bước2; GBR-16
test("EXEC-VISIT-04-UTCID04 [A] Task skipped không có lý do thì không checkout", async () => {
  const f = fixture({ started: true }); f.state().visits[0].checklist = [{ itemId: "feed", status: "SKIPPED", reason: "" }, { itemId: "water", status: "DONE" }];
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({ code: 'CHECKLIST_REQUIRED', status: 409 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-43 bước3–5; GBR-16
test("EXEC-VISIT-04-UTCID05 [A] Thiếu ảnh checkout thì không hoàn thành", async () => {
  const f = fixture({ started: true }); f.state().visits[0].checklist = done(); delete f.input.mediaId;
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-43 Preconditions
test("EXEC-VISIT-04-UTCID06 [A] Chưa check-in thì không checkout", async () => {
  const f = fixture();
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  expect(f.writes).toEqual([]);
});

// SRS: III.14.1.1/2; UC-44; MSG84
// DEF_EXEC_CHECKLIST_PHOTO_GUARD: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("EXEC-VISIT-04-UTCID07 [A] Checklist không có ảnh và không có lý do phải chặn checkout", async () => {
  const f = fixture({ started: true, clock: '11:00' }); f.state().visits[0].checklist = done();
  // Contract probe: không có checklist photo/reason ở bất kỳ evidence row nào của visit.
  f.state().visits[0].checklistPhotoIds = []; f.state().visits[0].evidenceRefs = [];
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({ status: 409 });
  expect(f.state().visits[0].checkOutAt).toBeUndefined();
});

test('ST3-31 blocks check-out when customerNote is empty or whitespace and keeps visit IN_PROGRESS', async () => {
  const f = fixture({ started: true, clock: '11:00' });
  f.state().visits[0].checklist = done();
  await expect(f.service.checkOut(f.input)).rejects.toMatchObject({
    status: 422,
    code: 'VALIDATION_FAILED',
    details: { fieldErrors: { customerNote: 'Trường này là bắt buộc.' } }
  });
  await expect(f.service.checkOut({ ...f.input, idempotencyKey: 'synthetic-execution-ws', customerNote: '   ' })).rejects.toMatchObject({
    status: 422,
    code: 'VALIDATION_FAILED',
    details: { fieldErrors: { customerNote: 'Trường này là bắt buộc.' } }
  });
  expect(f.writes).toEqual([]);
  expect(f.state().visits[0].state).toBe('IN_PROGRESS');
});

test('ST3-31 trims and persists customerNote atomically when provided on check-out', async () => {
  const f = fixture({ started: true, clock: '11:00' });
  f.state().visits[0].checklist = done();
  expect(await f.service.checkOut({ ...f.input, customerNote: '  Bé đã ăn hết khẩu phần.  ' })).toMatchObject({
    visitId: VISIT,
    state: 'COMPLETED',
    version: 1
  });
  expect(f.state().visits[0].customerNote).toBe('Bé đã ăn hết khẩu phần.');
});
