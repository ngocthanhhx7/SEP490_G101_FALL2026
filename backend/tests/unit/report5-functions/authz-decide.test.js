import { test, expect, jest } from '@jest/globals';
import { createAuthorizationService } from '../../../src/services/authorization.service.js';

// AUTHZ-01: chỉ gọi decide thật; policy/loadResource/audit là dependency giả.
// Policy mẫu phản ánh đúng các dòng SRS I.4.4 được ghi ở từng ca.
// Không kiểm tra audit lỗi, ID sai, cấu hình factory hay lỗi kho dữ liệu.
const NOW = Date.parse('2026-11-10T03:00:00Z');
const USER_ID = '710000000000000000000001';
const OTHER_ID = '710000000000000000000002';
const RESOURCE_ID = '720000000000000000000001';

function actor(role, userId = USER_ID) {
  return { userId, roles: [role], state: 'ACTIVE' };
}

function createFixture() {
  const resource = { _id: RESOURCE_ID, customerId: USER_ID, assignedSitterId: USER_ID, state: 'ACTIVE' };
  const ownBooking = jest.fn(({ actor: user, resource: record }) => user.userId === record.customerId);
  const assignedVisit = jest.fn(({ actor: user, resource: record }) => user.userId === record.assignedSitterId);
  const staffBooking = jest.fn(() => true);
  const manageUsers = jest.fn(() => true);
  const ownPet = jest.fn(({ actor: user, resource: record }) => user.userId === record.customerId);
  const loadResource = jest.fn().mockResolvedValue(resource);
  const audit = jest.fn().mockResolvedValue(undefined);
  const { decide } = createAuthorizationService({ loadResource, audit, clock: () => NOW,
    policies: [
      { resource: 'booking', action: 'READ', roles: ['CUSTOMER'], authorize: ownBooking },
      { resource: 'booking', action: 'READ', roles: ['STAFF'], authorize: staffBooking },
      { resource: 'visit', action: 'READ', roles: ['PET_SITTER'], authorize: assignedVisit },
      { resource: 'user', action: 'DECIDE', roles: ['ADMIN'], authorize: manageUsers },
      { resource: 'pet', action: 'UPDATE', roles: ['CUSTOMER'], authorize: ownPet },
    ] });
  const input = { actor: actor('CUSTOMER'), action: 'READ', resourceType: 'booking', resourceId: RESOURCE_ID };
  return { decide, input, resource, ownBooking, assignedVisit, staffBooking, manageUsers, ownPet };
}

async function expectAllowed(f, policy) {
  const result = await f.decide(f.input);
  expect(result).toEqual({ allowed: true, resource: f.resource });
  expect(result.resource).toBe(f.resource);
  expect(policy).toHaveBeenCalledTimes(1);
  expect(policy).toHaveBeenCalledWith(expect.objectContaining({
    actor: f.input.actor, resource: f.resource, action: f.input.action,
  }));
}

async function expectDenied(f, code = 'FORBIDDEN', status = 403) {
  await expect(f.decide(f.input)).rejects.toMatchObject({
    name: 'AppError', status, code,
    message: code === 'UNAUTHENTICATED' ? 'Authentication required' : 'Action is not permitted',
  });
}

// SRS: I.4.4 Booking — View, chú thích 5; GBR-02.
test("AUTHZ-01-UTCID01 [N] Customer được xem booking của mình", async () => {
  const f = createFixture();

  await expectAllowed(f, f.ownBooking);
});

// SRS: I.4.4 Booking — View, chú thích 5; GBR-02.
test("AUTHZ-01-UTCID02 [A] Customer không được xem booking của người khác", async () => {
  const f = createFixture();
  f.resource.customerId = OTHER_ID;

  await expectDenied(f);
  expect(f.ownBooking).toHaveBeenCalledTimes(1);
});

// SRS: UC-36; I.4.4 Visit — View; chú thích 1; GBR-02.
test("AUTHZ-01-UTCID03 [N] Pet Sitter được xem visit đã phân công cho mình", async () => {
  const f = createFixture();
  f.input.actor = actor('PET_SITTER');
  f.input.resourceType = 'visit';

  await expectAllowed(f, f.assignedVisit);
});

// SRS: UC-36; I.4.4 Visit — View; chú thích 1; GBR-02.
test("AUTHZ-01-UTCID04 [A] Pet Sitter không được xem visit phân công cho người khác", async () => {
  const f = createFixture();
  f.input.actor = actor('PET_SITTER');
  f.input.resourceType = 'visit';
  f.resource.assignedSitterId = OTHER_ID;

  await expectDenied(f);
  expect(f.assignedVisit).toHaveBeenCalledTimes(1);
});

// SRS: I.4.4 Booking — View (Staff Full); UC-32; GBR-02.
test("AUTHZ-01-UTCID05 [N] Staff được xem booking theo Permission Matrix", async () => {
  const f = createFixture();
  f.input.actor = actor('STAFF');

  await expectAllowed(f, f.staffBooking);
});

// SRS: GBR-03; I.4.3 Admin inherits Staff; I.4.4 Booking — View.
test("AUTHZ-01-UTCID06 [N] Admin kế thừa quyền Staff khi xem booking", async () => {
  const f = createFixture();
  f.input.actor = actor('ADMIN');

  await expectAllowed(f, f.staffBooking);
});

// SRS: UC-10; I.4.4 User account — Manage user accounts (Admin Full); GBR-02.
test("AUTHZ-01-UTCID07 [N] Admin được quyết định quản lý tài khoản", async () => {
  const f = createFixture();
  f.input.actor = actor('ADMIN');
  f.input.resourceType = 'user';
  f.input.action = 'DECIDE';

  await expectAllowed(f, f.manageUsers);
});

// SRS: UC-10; I.4.4 User account — Manage user accounts (Admin only); GBR-02.
test("AUTHZ-01-UTCID08 [A] Customer không được thực hiện quyền quản lý tài khoản của Admin", async () => {
  const f = createFixture();
  f.input.actor = actor('CUSTOMER');
  f.input.resourceType = 'user';
  f.input.action = 'DECIDE';

  await expectDenied(f);
  expect(f.manageUsers).not.toHaveBeenCalled();
});

// SRS: UC-10; I.4.4 User account — Manage user accounts (Admin only); GBR-02.
test("AUTHZ-01-UTCID09 [A] Staff không được thực hiện quyền quản lý tài khoản của Admin", async () => {
  const f = createFixture();
  f.input.actor = actor('STAFF');
  f.input.resourceType = 'user';
  f.input.action = 'DECIDE';

  await expectDenied(f);
  expect(f.manageUsers).not.toHaveBeenCalled();
});

// SRS: I.4.4 Pet profile — Create/edit (Customer Full); GBR-02.
test("AUTHZ-01-UTCID10 [N] Customer được cập nhật pet của mình", async () => {
  const f = createFixture();
  f.input.resourceType = 'pet';
  f.input.action = 'UPDATE';

  await expectAllowed(f, f.ownPet);
});

// SRS: I.4.4 Pet profile — Create/edit (Staff No); GBR-02.
test("AUTHZ-01-UTCID11 [A] Staff không được cập nhật pet thay Customer", async () => {
  const f = createFixture();
  f.input.actor = actor('STAFF');
  f.input.resourceType = 'pet';
  f.input.action = 'UPDATE';

  await expectDenied(f);
  expect(f.ownPet).not.toHaveBeenCalled();
});

// SRS: GBR-01; III.1.4 Authorization.
test("AUTHZ-01-UTCID12 [A] Chưa đăng nhập: không cho phép thao tác riêng tư", async () => {
  const f = createFixture();
  f.input.actor = null;

  await expectDenied(f, 'UNAUTHENTICATED', 401);
});

// SRS: GBR-04; III.1.4 Authorization; MSG17.
test("AUTHZ-01-UTCID13 [A] Tài khoản Customer đã khóa: từ chối thao tác dù là dữ liệu của mình", async () => {
  const f = createFixture();
  f.input.actor.state = 'LOCKED';

  await expectDenied(f, 'UNAUTHENTICATED', 401);
});

// SRS: I.4.4 Booking — View (Sale Staff No); III.1.4 Authorization; MSG15.
// DEF_AUTH_ROLE_01: giữ kỳ vọng theo SRS dù code hiện chưa hỗ trợ Sale Staff.
test("AUTHZ-01-UTCID14 [A] Sale Staff đã đăng nhập nhưng không có quyền xem booking: trả lỗi từ chối quyền", async () => {
  const f = createFixture();
  f.input.actor = actor('SALE_STAFF');

  await expectDenied(f);
});
