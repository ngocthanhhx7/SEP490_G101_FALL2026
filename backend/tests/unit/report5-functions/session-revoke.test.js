import { createHmac } from 'node:crypto';
import { test, expect, jest } from '@jest/globals';
import { createSessionService } from '../../../src/services/session.service.js';

// SESSION-05: chỉ test revoke, mỗi UTCID khớp một cột trong SESSION-05_revoke.
// SRS: UC-03; III.1.2.1 Login / Logout; GBR-08.
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
  const { revoke } = createSessionService({ User, models: { AuthSession }, tokenSecret: TOKEN_SECRET,
    csrfSecret: CSRF_SECRET, clock: () => NOW, randomBytesImpl: () => Buffer.alloc(32, 7) });
  return { revoke, state, user, duration, AuthSession,
    mongoSession: { id: 'synthetic-transaction' }, req: { headers: { cookie: `pwc_session=${TOKEN}` } },
    auth: { sessionId: 'synthetic-current-session', userId: USER_ID } };
}

// SRS: UC-03; III.1.2.1 Login / Logout; GBR-08.
test("SESSION-05-UTCID01 [N] Đăng xuất: kết thúc đúng phiên hiện tại", async () => {
  const f = createFixture();

  await expect(f.revoke(f.req)).resolves.toBe(true);
  expect(f.state.sessions[0].revokedAt).toEqual(new Date(NOW));
  expect(f.state.sessions[1].revokedAt).toBeNull();
  expect(f.state.sessions[2].revokedAt).toBeNull();
});

// SRS: UC-03; GBR-08; IV.2.3 Session end.
test("SESSION-05-UTCID02 [A] Phiên đã đăng xuất vẫn giữ trạng thái kết thúc", async () => {
  const f = createFixture();
  const signedOutAt = new Date(NOW - 1000);
  f.state.sessions[0].revokedAt = signedOutAt;

  await expect(f.revoke(f.req)).resolves.toBe(false);
  expect(f.state.sessions[0].revokedAt).toEqual(signedOutAt);
  expect(f.state.sessions[1].revokedAt).toBeNull();
  expect(f.state.sessions[2].revokedAt).toBeNull();
});
