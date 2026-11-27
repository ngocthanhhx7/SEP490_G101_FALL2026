import { test, expect, jest } from '@jest/globals';
import { requireSession } from '../../../src/middlewares/session.js';

// AUTH-MW-01: chỉ chạy middleware do requireSession thật tạo ra.
// authenticate là port giả; không gọi authenticate hoặc hàm session thật.
const NOW = Date.parse('2026-11-10T03:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function createFixture({ role = 'CUSTOMER', ageMs = 0 } = {}) {
  const duration = ['CUSTOMER', 'PET_SITTER'].includes(role) ? 30 * DAY : 12 * HOUR;
  const session = { userId: '710000000000000000000001', sessionId: 'synthetic-auth-session',
    state: 'ACTIVE', roles: [role], expiresAt: NOW + duration - ageMs };
  const sessionPort = { authenticate: jest.fn().mockResolvedValue(session) };
  const middleware = requireSession(sessionPort, { clock: () => NOW });
  return { middleware, session, sessionPort, req: {}, res: {}, next: jest.fn() };
}

async function expectAccepted(f) {
  await expect(f.middleware(f.req, f.res, f.next)).resolves.toBeUndefined();
  expect(f.req.auth).toEqual(f.session);
  expect(f.next).toHaveBeenCalledTimes(1);
  expect(f.next).toHaveBeenCalledWith();
}

async function expectRejected(f) {
  await expect(f.middleware(f.req, f.res, f.next)).rejects.toMatchObject({
    name: 'AppError', status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required',
  });
  expect(f.next).not.toHaveBeenCalled();
  expect(f.req).not.toHaveProperty('auth');
}

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("AUTH-MW-01-UTCID01 [N] Phiên Customer hợp lệ: gắn req.auth và cho đi tiếp", async () => {
  const f = createFixture({ role: 'CUSTOMER' });

  await expectAccepted(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("AUTH-MW-01-UTCID02 [N] Phiên Pet Sitter hợp lệ: gắn req.auth và cho đi tiếp", async () => {
  const f = createFixture({ role: 'PET_SITTER' });

  await expectAccepted(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("AUTH-MW-01-UTCID03 [N] Phiên Staff hợp lệ: gắn req.auth và cho đi tiếp", async () => {
  const f = createFixture({ role: 'STAFF' });

  await expectAccepted(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
// DEF_AUTH_ROLE_01: giữ kỳ vọng theo SRS dù code hiện chưa hỗ trợ Sale Staff.
test("AUTH-MW-01-UTCID04 [N] Phiên Sale Staff hợp lệ: gắn req.auth và cho đi tiếp", async () => {
  const f = createFixture({ role: 'SALE_STAFF' });

  await expectAccepted(f);
});

// SRS: UC-02 Normal Flow 4–5; GBR-01/08.
test("AUTH-MW-01-UTCID05 [N] Phiên Admin hợp lệ: gắn req.auth và cho đi tiếp", async () => {
  const f = createFixture({ role: 'ADMIN' });

  await expectAccepted(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID06 [B] Phiên Customer còn 1 ms trước hạn: cho đi tiếp", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY - 1 });

  await expectAccepted(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID07 [B] Phiên Customer đúng mốc hết hạn: chặn truy cập", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY });

  await expectRejected(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID08 [B] Phiên Customer quá hạn 1 ms: chặn truy cập", async () => {
  const f = createFixture({ role: 'CUSTOMER', ageMs: 30 * DAY + 1 });

  await expectRejected(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID09 [B] Phiên Staff còn 1 ms trước hạn: cho đi tiếp", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR - 1 });

  await expectAccepted(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID10 [B] Phiên Staff đúng mốc hết hạn: chặn truy cập", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR });

  await expectRejected(f);
});

// SRS: GBR-08; UC-02 Alternative 4.1; III.1.4 Authorization; MSG16.
test("AUTH-MW-01-UTCID11 [B] Phiên Staff quá hạn 1 ms: chặn truy cập", async () => {
  const f = createFixture({ role: 'STAFF', ageMs: 12 * HOUR + 1 });

  await expectRejected(f);
});

// SRS: GBR-01/08; UC-03; III.1.4 Authorization.
test("AUTH-MW-01-UTCID12 [A] Không có phiên hợp lệ: chặn truy cập trang hoặc API riêng tư", async () => {
  const f = createFixture();
  f.sessionPort.authenticate.mockResolvedValue(null);

  await expectRejected(f);
});

// SRS: GBR-04; III.1.4 Authorization; MSG17.
test("AUTH-MW-01-UTCID13 [A] Tài khoản đã khóa: chặn truy cập dù principal còn hạn", async () => {
  const f = createFixture();
  f.session.state = 'LOCKED';

  await expectRejected(f);
});
