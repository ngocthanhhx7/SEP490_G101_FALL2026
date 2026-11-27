import { test, expect, jest } from '@jest/globals';
import { lockUserAndRevokeSessions } from '../../../src/services/session.service.js';

// SESSION-10: chỉ gọi lockUserAndRevokeSessions thật, không gọi hàm session khác.
// SRS: UC-10; III.3.2.2 User Details; GBR-02/04; IV.2.3 Session end.
// authorize là port quyết định quyền, audit/transaction/models đều giả.
const NOW = Date.parse('2026-11-10T03:00:00Z');
const USER_ID = '500000000000000000000001';
const OTHER_USER_ID = '500000000000000000000002';

function createFixture({ role = 'CUSTOMER' } = {}) {
  const user = { _id: USER_ID, roles: [role], state: 'ACTIVE', version: 2, authEpoch: 0 };
  const sessions = [{ userId: USER_ID, revokedAt: null }, { userId: USER_ID, revokedAt: null },
    { userId: OTHER_USER_ID, revokedAt: null }];
  const userModel = { findOneAndUpdate: jest.fn(async (filter, update) => {
    if (String(filter._id) !== USER_ID || filter.state !== user.state || filter.version !== user.version) return null;
    Object.assign(user, update.$set);
    for (const [key, amount] of Object.entries(update.$inc)) user[key] += amount;
    return user;
  }) };
  const AuthSession = { updateMany: jest.fn(async (filter, update) => {
    const selected = sessions.filter(s => String(s.userId) === String(filter.userId) && s.revokedAt === filter.revokedAt);
    selected.forEach(s => Object.assign(s, update.$set));
    return { modifiedCount: selected.length };
  }) };
  const connection = { transaction: jest.fn(async work => work({ id: 'synthetic-lock-transaction' })) };
  const authorize = jest.fn().mockResolvedValue(true);
  const audit = jest.fn().mockResolvedValue(undefined);
  const input = { connection, userModel, models: { AuthSession }, userId: USER_ID, expectedVersion: 2,
    actor: { userId: OTHER_USER_ID, roles: ['ADMIN'], state: 'ACTIVE' },
    reason: 'Khóa theo quyết định quản trị', authorize, audit, clock: () => NOW };
  return { input, user, sessions, userModel, AuthSession, authorize };
}

async function expectLocked(f) {
  const result = await lockUserAndRevokeSessions(f.input);
  expect(result).toBe(f.user);
  expect(f.user.state).toBe('LOCKED');
  expect(f.sessions[0].revokedAt).toEqual(new Date(NOW));
  expect(f.sessions[1].revokedAt).toEqual(new Date(NOW));
  expect(f.sessions[2].revokedAt).toBeNull();
}

async function expectRejected(f, status, code, message) {
  await expect(lockUserAndRevokeSessions(f.input)).rejects.toMatchObject({ name: 'AppError', status, code, message });
  expect(f.userModel.findOneAndUpdate).not.toHaveBeenCalled();
  expect(f.AuthSession.updateMany).not.toHaveBeenCalled();
  expect(f.user.state).toBe('ACTIVE');
  expect(f.sessions.every(s => s.revokedAt === null)).toBe(true);
}

// SRS: UC-10; III.3.2.2 Lock account; GBR-04.
test("SESSION-10-UTCID01 [N] Admin được phép khóa Customer: khóa tài khoản và kết thúc mọi phiên", async () => {
  const f = createFixture({ role: 'CUSTOMER' });

  await expectLocked(f);
});

// SRS: UC-10; III.3.2.2 Lock account; GBR-04.
test("SESSION-10-UTCID02 [N] Admin được phép khóa Staff: khóa tài khoản và kết thúc mọi phiên", async () => {
  const f = createFixture({ role: 'STAFF' });

  await expectLocked(f);
});

// SRS: UC-10; III.3.2.2 Lock account; GBR-04.
test("SESSION-10-UTCID03 [N] Admin được phép khóa Sale Staff: khóa tài khoản và kết thúc mọi phiên", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });

  await expectLocked(f);
});

// SRS: III.3.2.2 User Details — Reason required to lock/unlock.
test("SESSION-10-UTCID04 [A] Thiếu lý do: không thực hiện khóa tài khoản", async () => {
  const f = createFixture();
  f.input.reason = '';

  await expectRejected(f, 422, 'VALIDATION_FAILED', 'Account lock decision is invalid');
});

// SRS: GBR-01/02; III.3.2.2 User Details (Admin only).
test("SESSION-10-UTCID05 [A] Chưa đăng nhập: không được thực hiện quyết định khóa", async () => {
  const f = createFixture();
  delete f.input.actor;

  await expectRejected(f, 401, 'UNAUTHENTICATED', 'Authentication required');
});

// SRS: GBR-02; Permission Matrix — Manage User Accounts; III.3.2.2 Admin only.
test("SESSION-10-UTCID06 [A] Port từ chối quyền khóa của Staff: không thực hiện thay đổi", async () => {
  const f = createFixture();
  f.input.actor.roles = ['STAFF'];
  f.authorize.mockResolvedValue(false);

  await expectRejected(f, 403, 'FORBIDDEN', 'Action is not permitted');
  expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({ action: 'DECIDE', resourceType: 'user', resourceId: USER_ID }));
});
