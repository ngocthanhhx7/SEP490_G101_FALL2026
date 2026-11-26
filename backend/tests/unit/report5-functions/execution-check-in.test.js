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


// SRS: UC-42 Normal Flow; GBR-16
test("EXEC-VISIT-02-UTCID01 [B] Đúng 30 phút trước được check-in với ảnh", async () => {
  const f = fixture({ clock: '09:30' });
  expect(await f.service.checkIn(f.input)).toMatchObject({ visitId: VISIT, state: 'IN_PROGRESS', version: 1 });
  expect(f.state().visits[0].checkInAt).toEqual(at('09:30'));
  expect(f.state().visits[0].evidenceRefs).toContainEqual({ kind: 'CHECK_IN', mediaId: MEDIA });
  expect(f.notify).toHaveBeenCalledWith(expect.objectContaining({ customerId: '555555555555555555555555', operation: 'CHECK_IN' }), expect.any(Object));
});

// SRS: UC-42 Alternative Step2; GBR-16; MSG29
test("EXEC-VISIT-02-UTCID02 [A] Sớm hơn 30 phút không lưu check-in", async () => {
  const f = fixture({ clock: "09:29" });
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'CHECK_IN_TOO_EARLY', status: 409 });
  expect(f.writes).toEqual([]); expect(f.notify).not.toHaveBeenCalled();
});

// SRS: UC-42 bước3–5; GBR-16
test("EXEC-VISIT-02-UTCID03 [A] Không có ảnh thì không check-in", async () => {
  const f = fixture(); delete f.input.mediaId;
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 422 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-42 Preconditions; GBR-02/16
test("EXEC-VISIT-02-UTCID04 [A] Sitter khác không được check-in", async () => {
  const f = fixture({ foreign: true });
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-41; UC-42 Preconditions
test("EXEC-VISIT-02-UTCID05 [A] Replacement chưa xác nhận handover không check-in", async () => {
  const f = fixture(); f.state().visits[0].handoverRequired = true; f.state().visits[0].handoverAccepted = false;
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'HANDOVER_REQUIRED', status: 409 });
  expect(f.writes).toEqual([]);
});

// SRS: GBR-23; UC-36; III.11.1.2 Visit Details
// DEF_EXEC_INSTRUCTION_ACK: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("EXEC-VISIT-02-UTCID06 [A] Chưa đọc phiên bản instructions mới thì không check-in", async () => {
  const f = fixture();
  // Contract probe: target hiện không nhận/đọc version ack; đây không phải field API đã có.
  f.state().visits[0].currentInstructionVersion = 2; f.state().visits[0].acknowledgedInstructionVersion = 1;
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ status: 409 });
  expect(f.state().visits[0].checkInAt).toBeUndefined();
});

// SRS: GBR-01
test("EXEC-VISIT-02-UTCID07 [A] Anonymous không được check-in", async () => {
  const f = fixture(); f.input.actor = null;
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  expect(f.writes).toEqual([]);
});

// SRS: UC-42 Preconditions: not checked in
test("EXEC-VISIT-02-UTCID08 [A] Visit đã check-in không được check-in lần nữa", async () => {
  const f = fixture({ started: true });
  await expect(f.service.checkIn(f.input)).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  expect(f.writes).toEqual([]);
});
