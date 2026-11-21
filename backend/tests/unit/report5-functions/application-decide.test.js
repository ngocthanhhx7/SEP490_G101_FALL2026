import { test, expect, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { createSitterApplicationService } from '../../../src/services/sitter-application.service.js';
const APP = '111111111111111111111111';
const ADMIN = { userId: '222222222222222222222222', roles: ['ADMIN'], state: 'ACTIVE' };
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
  const connection = { transaction: async callback => {
    const session = { state: copy(committed) };
    const result = await callback(session);
    committed = session.state;
    return result;
  }, db: { collection: name => ({ updateOne: async (filter, update, { session }) => {
    session.state[name].push(copy(update.$setOnInsert));
    return { upsertedCount: 1 };
  } }) } };
  const applicationMail = { enqueue: jest.fn(async (application, session) => session.state.mail.push(copy(application))) };
  const employmentDocuments = { activate: jest.fn(async () => undefined) };
  const privateMedia = { verifyApplicantDocuments: jest.fn(async ({ documents }) => copy(documents)) };
  const contactCrypto = { lookup: (channel, value) => ({ lookupKey: 'lookup:' + channel + ':' + value,
    canonicalValue: value }), encrypt: value => value, decrypt: value => value };
  const target = createSitterApplicationService({ connection, Applicant, User, Audit, DownloadQuota: {}, SitterStatus,
    contactCrypto, privateMedia, lookupSecret: SECRET, cursorSecret: SECRET, applicationMail,
    employmentDocuments, clock: () => NOW.getTime() }).decide;
  return { decide: target, state: () => committed, Applicant, User, Audit, SitterStatus, applicationMail };
}

// SRS: UC-18; III.5.2.2; GBR-25/28.
test("APPLICATION-06-UTCID01 [N] Từ chối với lý do trong danh sách và hẹn nộp lại 30 ngày", async () => {
  const f = fixture({ applicationState: 'INTERVIEW' });
  const promise = f.decide({ applicationId: APP, actor: ADMIN, idempotencyKey: KEY, body: { action: 'REJECT', reason: "Not enough experience", expectedVersion: 0 } });
  const actual = await promise;
  expect(actual.state).toBe('REJECTED');
  expect(actual.reapplyAt).toBe(new Date(NOW.getTime() + 30 * 86400000).toISOString());
  expect(f.User.create).not.toHaveBeenCalled();
  expect(f.applicationMail.enqueue).toHaveBeenCalled();
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
// DEF_APPLICATION_REJECT_PENDING: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("APPLICATION-06-UTCID02 [N] Cho Admin từ chối application Pending theo SRS", async () => {
  const f = fixture({ applicationState: 'PENDING' });
  const promise = f.decide({ applicationId: APP, actor: ADMIN, idempotencyKey: KEY, body: { action: 'REJECT', reason: "Documents not valid", expectedVersion: 0 } });
  const actual = await promise;
  expect(actual.state).toBe('REJECTED');
  expect(actual.reapplyAt).toBe(new Date(NOW.getTime() + 30 * 86400000).toISOString());
  expect(f.User.create).not.toHaveBeenCalled();
  expect(f.applicationMail.enqueue).toHaveBeenCalled();
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
test("APPLICATION-06-UTCID03 [A] Từ chối phải có lý do", async () => {
  const f = fixture({});
  const promise = f.decide({ applicationId: APP, actor: ADMIN, idempotencyKey: KEY, body: { action: 'REJECT', reason: "", expectedVersion: 0 } });
  await expect(promise).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
// DEF_APPLICATION_REASON_LIST: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("APPLICATION-06-UTCID04 [A] Không chấp nhận lý do ngoài danh sách SRS", async () => {
  const f = fixture({});
  const promise = f.decide({ applicationId: APP, actor: ADMIN, idempotencyKey: KEY, body: { action: 'REJECT', reason: "Một lý do tự do không thuộc danh sách", expectedVersion: 0 } });
  await expect(promise).rejects.toBeDefined();
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
// DEF_APPLICATION_APPROVAL_CHECKS: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("APPLICATION-06-UTCID05 [A] Không approve khi thiếu checklist và call time/result Passed", async () => {
  const f = fixture({});
  const promise = f.decide({ applicationId: APP, actor: ADMIN, idempotencyKey: KEY, body: { action: 'APPROVE', reason: "Đề nghị duyệt", expectedVersion: 0 } });
  await expect(promise).rejects.toBeDefined();
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
test("APPLICATION-06-UTCID06 [A] Staff không được duyệt hoặc từ chối", async () => {
  const f = fixture({});
  const promise = f.decide({ applicationId: APP, actor: { ...ADMIN, roles: ['STAFF'] }, idempotencyKey: KEY, body: { action: 'REJECT', reason: "Not enough experience", expectedVersion: 0 } });
  await expect(promise).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
});

// SRS: UC-18; III.5.2.2; GBR-25/28.
test("APPLICATION-06-UTCID07 [A] Chưa đăng nhập không được ra quyết định", async () => {
  const f = fixture({});
  const promise = f.decide({ applicationId: APP, actor: null, idempotencyKey: KEY, body: { action: 'REJECT', reason: "Not enough experience", expectedVersion: 0 } });
  await expect(promise).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
});
