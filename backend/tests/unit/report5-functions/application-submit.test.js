import { test, expect, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createSitterApplicationService } from '../../../src/services/sitter-application.service.js';
const APP = '111111111111111111111111';
const SITTER = '333333333333333333333333';
const KEY = 'synthetic-application-key-01';
const NOW = new Date('2026-11-15T03:00:00.000Z');
const SECRET = 'synthetic-application-lookup-secret-32-bytes';
function input() {
  return { displayName: 'Nguyễn An', contactChannel: 'EMAIL', contactValue: 'applicant@example.test',
    dateOfBirth: '2000-11-15', identityNumber: '012345678901', experience: 'Có hai năm chăm sóc chó mèo',
    requestedServices: ['Chăm sóc tại nhà'], workAreas: ['Khu vực tổng hợp'], documents: [
      { documentId: 'front-synthetic', documentType: 'IDENTITY_FRONT', storageRef: 'synthetic_front_storage_01' },
      { documentId: 'back-synthetic', documentType: 'IDENTITY_BACK', storageRef: 'synthetic_back_storage_01' },
      { documentId: 'portrait-synthetic', documentType: 'PORTRAIT', storageRef: 'synthetic_portrait_storage_01' }
    ] };
}
// Copy ObjectId thành string để model double giữ được ngữ nghĩa id qua transaction.
function copy(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.getTime === 'function') return new Date(value.getTime());
  if (value._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(copy);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
}
function fixture({ applicationState = 'INTERVIEW', sitterStatus = 'ACTIVE', pending = false,
  duplicateIdentity = false, cooldown = false, accountContact = false, assignedVisit = false } = {}) {
  const body = input();
  const identityKey = createHmac('sha256', SECRET).update('applicant-identity\0' + body.identityNumber).digest('hex');
  let committed = { applicants: [{ _id: APP, displayName: body.displayName,
    contactChannel: 'EMAIL', contactCiphertext: pending ? body.contactValue : 'other-applicant@example.test',
    contactLookupKey: pending ? 'lookup:EMAIL:' + body.contactValue : 'lookup:EMAIL:other-applicant@example.test',
    activePendingContactKey: pending ? 'lookup:EMAIL:' + body.contactValue : null,
    identityLookupKey: duplicateIdentity || cooldown ? identityKey : 'unrelated-identity',
    activePendingIdentityKey: duplicateIdentity ? identityKey : null,
    state: cooldown ? 'REJECTED' : applicationState, rejectedAt: cooldown ? new Date(NOW.getTime() - 29 * 86400000) : null, reapplyAt: cooldown ? new Date(NOW.getTime() + 86400000) : null,
    version: 0, ownerUserId: null, ageEligible: true, privateDocuments: body.documents,
    experience: body.experience, requestedServices: body.requestedServices, workAreas: body.workAreas,
    provisionedUserId: applicationState === 'APPROVED' ? SITTER : null, createdAt: NOW, updatedAt: NOW }],
    users: accountContact ? [{ _id: SITTER, state: 'ACTIVE', roles: ['CUSTOMER'] }]
      : applicationState === 'APPROVED' ? [{ _id: SITTER, state: 'ACTIVE', roles: ['PET_SITTER'] }] : [],
    statuses: applicationState === 'APPROVED' ? [{ userId: SITTER, status: sitterStatus, version: 0 }] : [], audits: [], mail: [], notifications: [],
    contacts: accountContact ? [{ channel: 'EMAIL', canonicalCiphertext: body.contactValue,
      lookupKey: 'lookup:EMAIL:' + body.contactValue, userId: SITTER, state: 'VERIFIED' }] : [],
    visits: assignedVisit ? [{ _id: 'visit-synthetic', state: 'ASSIGNED', sitterId: SITTER, handoverRequired: false }] : [] };
  function matches(row, filter) {
    return !!row && Object.entries(filter).every(([key, value]) => {
      if (key === '$or') return value.some(item => matches(row, item));
      if (key === '$and') return value.every(item => matches(row, item));
      const current = row[key];
      if (value && typeof value === 'object' && !value._bsontype && typeof value.getTime !== 'function') {
        if ('$in' in value) return value.$in.some(item => String(item) === String(current));
        if ('$ne' in value) return String(current) !== String(value.$ne);
        if ('$gt' in value) return current > value.$gt;
        if ('$exists' in value) return (current !== undefined) === value.$exists;
      }
      return value === null ? current === null || current === undefined : String(current) === String(value);
    });
  }
  function query(read, initial) {
    let session = initial;
    const q = { session: value => { session = value; return q; }, select: () => q, sort: () => q, limit: () => q,
      lean: async () => copy(read(session?.state ?? committed)),
      then: (resolve, reject) => q.lean().then(resolve, reject) };
    return q;
  }
  function model(collection) {
    return {
      findOne: filter => query(state => state[collection].find(row => matches(row, filter)) ?? null),
      find: filter => query(state => state[collection].filter(row => matches(row, filter))),
      exists: filter => query(state => state[collection].some(row => matches(row, filter))),
      updateOne: async () => ({ matchedCount: 0 }),
      findOneAndUpdate: jest.fn((filter, update, options) => query(state => {
        const row = state[collection].find(item => matches(item, filter));
        if (!row) return null;
        Object.assign(row, copy(update.$set ?? {}));
        for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = (row[key] ?? 0) + value;
        for (const key of Object.keys(update.$unset ?? {})) delete row[key];
        return row;
      }, options?.session)),
      create: jest.fn(async (rows, { session }) => {
        const created = rows.map(row => ({ _id: collection === 'users' ? SITTER : '444444444444444444444444',
          createdAt: NOW, updatedAt: NOW, ...copy(row) }));
        session.state[collection].push(...created);
        return copy(created);
      })
    };
  }
  const Applicant = model('applicants'), User = model('users'), Audit = model('audits'), SitterStatus = model('statuses');
  const connection = { models: { Contact: model('contacts'), OtpChallenge: {}, OtpThrottle: {}, AuthSession: {} }, transaction: async callback => {
    const session = { state: copy(committed) };
    const result = await callback(session);
    committed = session.state;
    return result;
  }, db: { collection: name => ({
    findOne: async (filter, { session } = {}) => (session?.state ?? committed)[name]?.find(row => matches(row, filter)) ?? null,
    updateOne: async (filter, update, { session }) => {
      session.state[name].push(copy(update.$setOnInsert));
      return { upsertedCount: 1 };
    }
  }) } };
  const applicationMail = { enqueue: jest.fn(async (application, session) => session.state.mail.push(copy(application))) };
  const employmentDocuments = { activate: jest.fn(async () => undefined) };
  const privateMedia = { verifyApplicantDocuments: jest.fn(async ({ documents }) => copy(documents)) };
  const contactCrypto = { lookup: (channel, value) => ({ lookupKey: 'lookup:' + channel + ':' + value,
    canonicalValue: value }), encrypt: value => value, decrypt: value => value };
  const target = createSitterApplicationService({ connection, Applicant, User, Audit, DownloadQuota: {}, SitterStatus,
    contactCrypto, privateMedia, lookupSecret: SECRET, cursorSecret: SECRET, applicationMail,
    employmentDocuments, clock: () => NOW.getTime() }).submit;
  return { submit: target, state: () => committed, Applicant, User, Audit, SitterStatus, applicationMail };
}

// SRS: UC-16; P16/P46 hợp đồng nộp hồ sơ một kênh liên hệ EMAIL không tự tạo tài khoản User.
test("APPLICATION-01-UTCID01 [N] Nộp hồ sơ kênh EMAIL hợp lệ không tạo tài khoản", async () => {
  const f = fixture();
  const body = { ...input(), contactChannel: 'EMAIL', contactValue: 'applicant@example.test' };
  const actual = await f.submit({ body, idempotencyKey: KEY });
  expect(actual.state).toBe('PENDING');
  expect(actual.applicationCode).toBeTruthy();
  expect(f.User.create).not.toHaveBeenCalled();
});

// SRS: UC-16; P16/P46 hợp đồng nộp hồ sơ một kênh liên hệ PHONE không tự tạo tài khoản User.
test("APPLICATION-01-UTCID02 [N] Nộp hồ sơ kênh PHONE hợp lệ không tạo tài khoản", async () => {
  const f = fixture();
  const body = { ...input(), contactChannel: 'PHONE', contactValue: '+84912345678' };
  const actual = await f.submit({ body, idempotencyKey: KEY });
  expect(actual.state).toBe('PENDING');
  expect(actual.applicationCode).toBeTruthy();
  expect(f.User.create).not.toHaveBeenCalled();
});

// SRS: UC-16, GBR-25/28: hồ sơ mới nhận cả email và số điện thoại, chưa tạo User.
test("APPLICATION-01-UTCID03 [N] Nộp hồ sơ có đủ email và số điện thoại, chưa tạo tài khoản", async () => {
  const f = fixture();
  const body = { ...input(), email: 'applicant@example.test', phone: '0912345678' };
  await expect(f.submit({ body, idempotencyKey: KEY })).resolves.toMatchObject({ state: 'PENDING' });
  expect(f.state().applicants.at(-1)).toMatchObject({ contactChannel: 'EMAIL',
    contactLookupKey: 'lookup:EMAIL:applicant@example.test', phoneLookupKey: 'lookup:PHONE:+84912345678' });
  expect(f.User.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; MSG39, tuổi tại ngày nộp.
test("APPLICATION-01-UTCID04 [B] Chưa đủ 18 tuổi trước sinh nhật một ngày bị chặn", async () => {
  const f = fixture();
  const body = input();
  body.dateOfBirth = '2008-11-16';
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'AGE_REQUIREMENT_NOT_MET' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; MSG01.
test("APPLICATION-01-UTCID05 [A] Thiếu họ tên bị chặn", async () => {
  const f = fixture();
  const body = input();
  delete body.displayName;
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; MSG01.
test("APPLICATION-01-UTCID06 [A] Thiếu số giấy tờ bị chặn", async () => {
  const f = fixture();
  const body = input();
  delete body.identityNumber;
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; Service areas required.
test("APPLICATION-01-UTCID07 [A] Không chọn khu vực phục vụ bị chặn", async () => {
  const f = fixture();
  const body = input();
  body.workAreas = [];
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; Experience required.
test("APPLICATION-01-UTCID08 [A] Mô tả kinh nghiệm rỗng bị chặn", async () => {
  const f = fixture();
  const body = input();
  body.experience = '';
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; Portrait required.
test("APPLICATION-01-UTCID09 [A] Thiếu ảnh chân dung bị chặn", async () => {
  const f = fixture();
  const body = input();
  body.documents = body.documents.filter(row => row.documentType !== 'PORTRAIT');
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; Identity both sides.
test("APPLICATION-01-UTCID10 [A] Thiếu mặt sau CCCD bị chặn", async () => {
  const f = fixture();
  const body = input();
  body.documents = body.documents.filter(row => row.documentType !== 'IDENTITY_BACK');
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28.
test("APPLICATION-01-UTCID11 [A] Đã có application Pending cùng email không nộp thêm", async () => {
  const f = fixture({ pending: true, applicationState: 'PENDING' });
  const body = input();
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ code: 'APPLICATION_ALREADY_PENDING' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28.
test("APPLICATION-01-UTCID12 [A] Đã có application Pending cùng giấy tờ không nộp thêm", async () => {
  const f = fixture({ duplicateIdentity: true, applicationState: 'PENDING' });
  const body = input();
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ code: 'APPLICATION_ALREADY_PENDING' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28.
test("APPLICATION-01-UTCID13 [A] Bị từ chối chưa qua 30 ngày không nộp lại", async () => {
  const f = fixture({ cooldown: true });
  const body = input();
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toMatchObject({ code: 'REAPPLY_NOT_AVAILABLE' });
  expect(f.Applicant.create).not.toHaveBeenCalled();
});

// SRS: UC-16; III.5.1.1 Application Form; GBR-25/28; GBR-05; MSG40.
// DEF_APPLICATION_ACCOUNT_CONTACT: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("APPLICATION-01-UTCID14 [A] Contact đã thuộc account không được dùng ứng tuyển", async () => {
  const f = fixture({ accountContact: true });
  const body = input();
  await expect(f.submit({ body, idempotencyKey: KEY })).rejects.toBeDefined();
  expect(f.Applicant.create).not.toHaveBeenCalled();
});
