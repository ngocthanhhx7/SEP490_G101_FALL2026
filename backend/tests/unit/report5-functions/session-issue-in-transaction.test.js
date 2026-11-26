import { createHmac } from 'node:crypto';
import { test, expect, jest } from '@jest/globals';
import { createSessionService } from '../../../src/services/session.service.js';

// SESSION-01: chỉ test issueInTransaction, mỗi UTCID khớp một cột trong SESSION-01_issueInTransaction.
// SRS: UC-02 Normal Flow 4; GBR-04/08.
// Model và clock giả; không kết nối MongoDB, không gọi HTTP/provider thật.
const NOW = Date.parse('2026-11-10T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const USER_ID = '500000000000000000000001';
const OTHER_USER_ID = '500000000000000000000002';
const TOKEN = Buffer.alloc(32, 7).toString('base64url');
const TOKEN_SECRET = 'synthetic-session-token-secret-'.repeat(2);
const CSRF_SECRET = 'synthetic-session-csrf-secret-'.repeat(2);
const TOKEN_DIGEST = createHmac('sha256', TOKEN_SECRET).update(`session\0${TOKEN}`).digest('hex');

function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === 'expiresAt') return record.expiresAt.getTime() > expected.$gt.getTime();
    return expected === null ? record[key] === null : String(record[key]) === String(expected);
  });
}

function query(read) {
  const q = { select: jest.fn(), lean: jest.fn(async () => read()) };
  q.select.mockReturnValue(q);
  return q;
}

function createFixture({ role = 'CUSTOMER', ageMs = 0 } = {}) {
  // Thời hạn do SRS GBR-08 quy định; không đọc hằng số thời hạn từ code đang test.
  const duration = ['CUSTOMER', 'PET_SITTER'].includes(role) ? 30 * DAY : 12 * HOUR;
  const user = { _id: USER_ID, displayName: 'Nguyễn Văn An', roles: [role], state: 'ACTIVE',
    authEpoch: 0, version: 2, synthetic: false };
  const state = { user, sessions: [
    { _id: '600000000000000000000001', sessionId: 'synthetic-current-session', userId: USER_ID,
      tokenDigest: TOKEN_DIGEST, authEpochAtIssue: 0, expiresAt: new Date(NOW + duration - ageMs), revokedAt: null },
    { _id: '600000000000000000000002', sessionId: 'synthetic-other-device', userId: USER_ID,
      tokenDigest: 'synthetic-other-device-digest', authEpochAtIssue: 0, expiresAt: new Date(NOW + duration), revokedAt: null },
    { _id: '600000000000000000000003', sessionId: 'synthetic-other-user', userId: OTHER_USER_ID,
      tokenDigest: 'synthetic-other-user-digest', authEpochAtIssue: 0, expiresAt: new Date(NOW + duration), revokedAt: null },
  ] };
  const AuthSession = {
    create: jest.fn(async records => { state.sessions.push(...records); return records; }),
    // Fake tôn trọng điều kiện hết hạn, thu hồi và chủ phiên trong query.
    findOne: jest.fn(filter => query(() => state.sessions.find(s => matches(s, filter)) ?? null)),
    updateOne: jest.fn(async (filter, update) => {
      const session = state.sessions.find(s => matches(s, filter));
      if (!session) return { modifiedCount: 0 };
      Object.assign(session, update.$set);
      return { modifiedCount: 1 };
    }),
    updateMany: jest.fn(async (filter, update) => {
      const selected = state.sessions.filter(s => matches(s, filter));
      selected.forEach(s => Object.assign(s, update.$set));
      return { modifiedCount: selected.length };
    }),
  };
  const User = { findById: jest.fn(id => query(() => String(id) === USER_ID ? state.user : null)) };
  const { issueInTransaction } = createSessionService({ User, models: { AuthSession }, tokenSecret: TOKEN_SECRET,
    csrfSecret: CSRF_SECRET, clock: () => NOW, randomBytesImpl: () => Buffer.alloc(32, 7) });
  return { issueInTransaction, state, user, duration, AuthSession,
    mongoSession: { id: 'synthetic-transaction' }, req: { headers: { cookie: `pwc_session=${TOKEN}` } },
    auth: { sessionId: 'synthetic-current-session', userId: USER_ID } };
}

async function expectIssued(f, duration) {
  const issued = await f.issueInTransaction(f.user, f.mongoSession);
  expect(issued).toMatchObject({ expiresAt: NOW + duration, maxAge: duration,
    user: { id: USER_ID, displayName: f.user.displayName, roles: f.user.roles } });
  expect(f.AuthSession.create).toHaveBeenCalledTimes(1);
  expect(f.AuthSession.create).toHaveBeenCalledWith([expect.objectContaining({
    userId: USER_ID, expiresAt: new Date(NOW + duration), revokedAt: null,
  })], { session: f.mongoSession });
}

async function expectLockedUserRejected(f) {
  await expect(f.issueInTransaction(f.user, f.mongoSession)).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required',
  });
  expect(f.AuthSession.create).not.toHaveBeenCalled();
}

// SRS: UC-02 Normal Flow 4; GBR-08.
test("SESSION-01-UTCID01 [N] Cấp phiên Customer đúng 720 giờ theo GBR-08", async () => {
  const f = createFixture({ role: 'CUSTOMER' });

  await expectIssued(f, 720 * HOUR);
});

// SRS: UC-02 Normal Flow 4; GBR-08.
test("SESSION-01-UTCID02 [N] Cấp phiên Pet Sitter đúng 720 giờ theo GBR-08", async () => {
  const f = createFixture({ role: 'PET_SITTER' });

  await expectIssued(f, 720 * HOUR);
});

// SRS: UC-02 Normal Flow 4; GBR-08.
test("SESSION-01-UTCID03 [N] Cấp phiên Staff đúng 12 giờ theo GBR-08", async () => {
  const f = createFixture({ role: 'STAFF' });

  await expectIssued(f, 12 * HOUR);
});

// SRS: UC-02 Normal Flow 4; GBR-08.
// DEF_SESSION_ROLE_01: giữ kỳ vọng SRS; không sửa expected theo giới hạn role hiện tại.
test("SESSION-01-UTCID04 [N] Cấp phiên Sale Staff đúng 12 giờ theo GBR-08", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });

  await expectIssued(f, 12 * HOUR);
});

// SRS: UC-02 Normal Flow 4; GBR-08.
test("SESSION-01-UTCID05 [N] Cấp phiên Admin đúng 12 giờ theo GBR-08", async () => {
  const f = createFixture({ role: 'ADMIN' });

  await expectIssued(f, 12 * HOUR);
});

// SRS: UC-02 Alternative 2.1; GBR-04.
test("SESSION-01-UTCID06 [A] Tài khoản Customer bị khóa: không cấp phiên", async () => {
  const f = createFixture({ role: 'CUSTOMER' });
  f.user.state = 'LOCKED';

  await expectLockedUserRejected(f);
});

// SRS: UC-02 Alternative 2.1; GBR-04.
test("SESSION-01-UTCID07 [A] Tài khoản Staff bị khóa: không cấp phiên", async () => {
  const f = createFixture({ role: 'STAFF' });
  f.user.state = 'LOCKED';

  await expectLockedUserRejected(f);
});

// SRS: UC-02 Alternative 2.1; GBR-04.
test("SESSION-01-UTCID08 [A] Tài khoản Sale Staff bị khóa: không cấp phiên", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });
  f.user.state = 'LOCKED';

  await expectLockedUserRejected(f);
});
