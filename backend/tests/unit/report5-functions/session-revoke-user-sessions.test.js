import { createHmac } from 'node:crypto';
import { test, expect, jest } from '@jest/globals';
import { createSessionService } from '../../../src/services/session.service.js';

// SESSION-06: chỉ test revokeUserSessions, mỗi UTCID khớp một cột trong SESSION-06_revokeUserSessions.
// SRS: GBR-04; III.1.4 Authorization; IV.2.3 Session end.
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
  const { revokeUserSessions } = createSessionService({ User, models: { AuthSession }, tokenSecret: TOKEN_SECRET,
    csrfSecret: CSRF_SECRET, clock: () => NOW, randomBytesImpl: () => Buffer.alloc(32, 7) });
  return { revokeUserSessions, state, user, duration, AuthSession,
    mongoSession: { id: 'synthetic-transaction' }, req: { headers: { cookie: `pwc_session=${TOKEN}` } },
    auth: { sessionId: 'synthetic-current-session', userId: USER_ID } };
}

// SRS: GBR-04; III.1.4 Authorization.
test("SESSION-06-UTCID01 [N] Một phiên đang mở của tài khoản mục tiêu: thu hồi phiên đó", async () => {
  const f = createFixture();
  f.state.sessions.splice(1, 1);

  await expect(f.revokeUserSessions(USER_ID)).resolves.toBe(1);
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
  expect(f.state.sessions[1].revokedAt).toBeNull();
});

// SRS: GBR-04; III.1.4 Authorization.
test("SESSION-06-UTCID02 [N] Nhiều phiên đang mở: thu hồi tất cả phiên của đúng tài khoản", async () => {
  const f = createFixture();

  await expect(f.revokeUserSessions(USER_ID)).resolves.toBe(2);
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
  expect(f.state.sessions[1].revokedAt).toEqual(new Date(NOW));
  expect(f.state.sessions[2].revokedAt).toBeNull();
});

// SRS: GBR-04 — mọi phiên đang mở của tài khoản bị khóa phải kết thúc.
test("SESSION-06-UTCID03 [B] Không còn phiên mở: không tác động phiên của tài khoản khác", async () => {
  const f = createFixture();
  const earlier = new Date(NOW - 1000);
  f.state.sessions[0].revokedAt = earlier;
  f.state.sessions[1].revokedAt = earlier;

  await expect(f.revokeUserSessions(USER_ID)).resolves.toBe(0);
  expect(f.state.sessions[0].revokedAt).toEqual(earlier);
  expect(f.state.sessions[1].revokedAt).toEqual(earlier);
  expect(f.state.sessions[2].revokedAt).toBeNull();
});
