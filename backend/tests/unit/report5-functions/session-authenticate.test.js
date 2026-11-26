import { createHmac } from 'node:crypto';
import { test, expect, jest } from '@jest/globals';
import { createSessionService } from '../../../src/services/session.service.js';

// SESSION-02: chỉ test authenticate, mỗi UTCID khớp một cột trong SESSION-02_authenticate.
// SRS: UC-02; UC-03; GBR-01/04/08; IV.2.3 Session end.
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
  const { authenticate } = createSessionService({ User, models: { AuthSession }, tokenSecret: TOKEN_SECRET,
    csrfSecret: CSRF_SECRET, clock: () => NOW, randomBytesImpl: () => Buffer.alloc(32, 7) });
  return { authenticate, state, user, duration, AuthSession,
    mongoSession: { id: 'synthetic-transaction' }, req: { headers: { cookie: `pwc_session=${TOKEN}` } },
    auth: { sessionId: 'synthetic-current-session', userId: USER_ID } };
}

async function expectAuthenticated(f) {
  await expect(f.authenticate(f.req)).resolves.toEqual({ userId: USER_ID,
    sessionId: 'synthetic-current-session', state: 'ACTIVE', roles: f.user.roles,
    expiresAt: f.state.sessions[0].expiresAt.getTime() });
}

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("SESSION-02-UTCID01 [N] Phiên Customer còn hạn: trả thông tin xác thực", async () => {
  const f = createFixture({ role: 'CUSTOMER' });

  await expectAuthenticated(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("SESSION-02-UTCID02 [N] Phiên Pet Sitter còn hạn: trả thông tin xác thực", async () => {
  const f = createFixture({ role: 'PET_SITTER' });

  await expectAuthenticated(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("SESSION-02-UTCID03 [N] Phiên Staff còn hạn: trả thông tin xác thực", async () => {
  const f = createFixture({ role: 'STAFF' });

  await expectAuthenticated(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
// DEF_SESSION_ROLE_01: giữ kỳ vọng SRS; không sửa expected theo giới hạn role hiện tại.
test("SESSION-02-UTCID04 [N] Phiên Sale Staff còn hạn: trả thông tin xác thực", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });

  await expectAuthenticated(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("SESSION-02-UTCID05 [N] Phiên Admin còn hạn: trả thông tin xác thực", async () => {
  const f = createFixture({ role: 'ADMIN' });

  await expectAuthenticated(f);
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID06 [B] Phiên Customer còn 1 ms trước hạn: vẫn xác thực", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY - 1 });

  await expectAuthenticated(f);
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID07 [B] Phiên Customer đúng thời điểm hết hạn: không xác thực", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY });

  await expect(f.authenticate(f.req)).resolves.toBeNull();
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID08 [B] Phiên Customer quá hạn 1 ms: không xác thực", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY + 1 });

  await expect(f.authenticate(f.req)).resolves.toBeNull();
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID09 [B] Phiên Staff còn 1 ms trước hạn: vẫn xác thực", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR - 1 });

  await expectAuthenticated(f);
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID10 [B] Phiên Staff đúng thời điểm hết hạn: không xác thực", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR });

  await expect(f.authenticate(f.req)).resolves.toBeNull();
});

// SRS: UC-02 Alternative 4.1; GBR-08; MSG16.
test("SESSION-02-UTCID11 [B] Phiên Staff quá hạn 1 ms: không xác thực", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR + 1 });

  await expect(f.authenticate(f.req)).resolves.toBeNull();
});

// SRS: GBR-01; III.1.4 Authorization.
test("SESSION-02-UTCID12 [A] Chưa đăng nhập: không có phiên để xác thực", async () => {
  const f = createFixture();

  await expect(f.authenticate({ headers: {} })).resolves.toBeNull();
});

// SRS: UC-03; GBR-08; IV.2.3 Session end.
test("SESSION-02-UTCID13 [A] Phiên đã đăng xuất: không còn xác thực được", async () => {
  const f = createFixture();
  f.state.sessions[0].revokedAt = new Date(NOW - 1000);

  await expect(f.authenticate(f.req)).resolves.toBeNull();
});

// SRS: GBR-04; IV.2.3 Session end; MSG17.
test("SESSION-02-UTCID14 [A] Phiên còn hạn nhưng Customer đã bị khóa: từ chối ngay", async () => {
  const f = createFixture({ role: 'CUSTOMER' });
  f.user.state = 'LOCKED';

  await expect(f.authenticate(f.req)).resolves.toBeNull();
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
});

// SRS: GBR-04; IV.2.3 Session end; MSG17.
test("SESSION-02-UTCID15 [A] Phiên còn hạn nhưng Staff đã bị khóa: từ chối ngay", async () => {
  const f = createFixture({ role: 'STAFF' });
  f.user.state = 'LOCKED';

  await expect(f.authenticate(f.req)).resolves.toBeNull();
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
});

// SRS: GBR-04; IV.2.3 Session end; MSG17.
test("SESSION-02-UTCID16 [A] Phiên còn hạn nhưng Sale Staff đã bị khóa: từ chối ngay", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });
  f.user.state = 'LOCKED';

  await expect(f.authenticate(f.req)).resolves.toBeNull();
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
});
