import { test, expect, jest } from '@jest/globals';
import { requireRoles } from '../../../src/middlewares/session.js';

// AUTH-MW-02: mỗi test gọi requireRoles và middleware trả về của chính hàm đó.
// req.auth được dựng sẵn; không gọi requireSession hoặc hàm xác thực khác.
function createFixture(actorRole, requiredRole) {
  return { req: { auth: { userId: '710000000000000000000001', roles: [actorRole], state: 'ACTIVE' } },
    res: {}, next: jest.fn(), requiredRole };
}

function expectAccepted(f) {
  const middleware = requireRoles(f.requiredRole);
  expect(middleware(f.req, f.res, f.next)).toBeUndefined();
  expect(f.next).toHaveBeenCalledTimes(1);
  expect(f.next).toHaveBeenCalledWith();
}

function expectRejected(f, code = 'FORBIDDEN', status = 403) {
  const middleware = requireRoles(f.requiredRole);
  expect(middleware(f.req, f.res, f.next)).toBeUndefined();
  expect(f.next).toHaveBeenCalledTimes(1);
  const error = f.next.mock.calls[0][0];
  expect(error).toMatchObject({ name: 'AppError', status, code,
    message: code === 'UNAUTHENTICATED' ? 'Authentication required' : 'Action is not permitted' });
}

// SRS: I.4.4 Pet profile — Create/edit; GBR-02.
test("AUTH-MW-02-UTCID01 [N] Customer cập nhật pet: được qua cổng Customer", () => {
  const f = createFixture('CUSTOMER', 'CUSTOMER');

  expectAccepted(f);
});

// SRS: I.4.4 Visit — Check in/out; GBR-02.
test("AUTH-MW-02-UTCID02 [N] Pet Sitter xử lý visit: được qua cổng Pet Sitter", () => {
  const f = createFixture('PET_SITTER', 'PET_SITTER');

  expectAccepted(f);
});

// SRS: I.4.4 Booking — View; GBR-02.
test("AUTH-MW-02-UTCID03 [N] Staff xem booking: được qua cổng Staff", () => {
  const f = createFixture('STAFF', 'STAFF');

  expectAccepted(f);
});

// SRS: UC-10; I.4.4 User account — Manage; GBR-02.
test("AUTH-MW-02-UTCID04 [N] Admin quản lý tài khoản: được qua cổng Admin", () => {
  const f = createFixture('ADMIN', 'ADMIN');

  expectAccepted(f);
});

// SRS: GBR-03; I.4.3 Admin inherits Staff.
test("AUTH-MW-02-UTCID05 [N] Admin được kế thừa cổng quyền Staff", () => {
  const f = createFixture('ADMIN', 'STAFF');

  expectAccepted(f);
});

// SRS: I.4.4 Product order — Prepare/hand over/deliver; GBR-02.
// DEF_AUTH_ROLE_01: giữ kỳ vọng theo SRS dù code hiện chưa hỗ trợ Sale Staff.
test("AUTH-MW-02-UTCID06 [N] Sale Staff xử lý đơn hàng: được qua cổng Sale Staff", () => {
  const f = createFixture('SALE_STAFF', 'SALE_STAFF');

  expectAccepted(f);
});

// SRS: I.4.3 Admin inherits Sale Staff; I.4.4 Product order.
// DEF_AUTH_ROLE_01: giữ kỳ vọng theo SRS dù code hiện chưa hỗ trợ Sale Staff.
test("AUTH-MW-02-UTCID07 [N] Admin được kế thừa cổng quyền Sale Staff", () => {
  const f = createFixture('ADMIN', 'SALE_STAFF');

  expectAccepted(f);
});

// SRS: I.4.4 Booking — View; Customer Restricted, Staff Full; GBR-02.
test("AUTH-MW-02-UTCID08 [A] Customer không được qua cổng Staff để xem mọi booking", () => {
  const f = createFixture('CUSTOMER', 'STAFF');

  expectRejected(f);
});

// SRS: UC-10; I.4.4 User account — Manage (Staff No); GBR-02.
test("AUTH-MW-02-UTCID09 [A] Staff không được qua cổng quản lý tài khoản của Admin", () => {
  const f = createFixture('STAFF', 'ADMIN');

  expectRejected(f);
});

// SRS: I.4.4 Pet profile — Create/edit (Staff No); GBR-02.
test("AUTH-MW-02-UTCID10 [A] Staff không được qua cổng Customer để sửa pet", () => {
  const f = createFixture('STAFF', 'CUSTOMER');

  expectRejected(f);
});

// SRS: I.4.4 Pet profile — Create/edit (Pet Sitter No); GBR-02.
test("AUTH-MW-02-UTCID11 [A] Pet Sitter không được qua cổng Customer để sửa pet", () => {
  const f = createFixture('PET_SITTER', 'CUSTOMER');

  expectRejected(f);
});

// SRS: GBR-01; III.1.4 Authorization.
test("AUTH-MW-02-UTCID12 [A] Chưa có req.auth: trả lỗi yêu cầu đăng nhập", () => {
  const f = createFixture('CUSTOMER', 'STAFF');
  delete f.req.auth;

  expectRejected(f, 'UNAUTHENTICATED', 401);
});
