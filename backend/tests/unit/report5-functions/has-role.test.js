import { expect, test } from '@jest/globals';
import { hasRole } from '../../../src/utils/roles.js';

// ROLE-BE-01: gọi trực tiếp hàm thật; không mock hoặc gọi middleware khác.
// Mỗi cổng đại diện cho thao tác trong Permission Matrix; không kiểm tra ownership.
// Guest dùng [] vì không có role. SRS không mô tả đầu vào sai kiểu hoặc đa role.
// Kỳ vọng theo SRS, kể cả SALE_STAFF hiện chưa được runtime hỗ trợ.

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID01 [N] CUSTOMER được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = ["CUSTOMER"];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID02 [A] CUSTOMER không được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = ["CUSTOMER"];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID03 [A] CUSTOMER không được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = ["CUSTOMER"];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Product order — Prepare / hand over / deliver; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID04 [A] CUSTOMER không được qua cổng SALE_STAFF: chuẩn bị/bàn giao/giao đơn hàng", () => {
  const actorRoles = ["CUSTOMER"];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID05 [A] CUSTOMER không được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = ["CUSTOMER"];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID06 [A] PET_SITTER không được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = ["PET_SITTER"];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID07 [N] PET_SITTER được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = ["PET_SITTER"];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID08 [A] PET_SITTER không được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = ["PET_SITTER"];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Product order — Prepare / hand over / deliver; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID09 [A] PET_SITTER không được qua cổng SALE_STAFF: chuẩn bị/bàn giao/giao đơn hàng", () => {
  const actorRoles = ["PET_SITTER"];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID10 [A] PET_SITTER không được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = ["PET_SITTER"];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID11 [A] STAFF không được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = ["STAFF"];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID12 [A] STAFF không được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = ["STAFF"];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID13 [N] STAFF được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = ["STAFF"];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 Product order — Prepare / hand over / deliver; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID14 [A] STAFF không được qua cổng SALE_STAFF: chuẩn bị/bàn giao/giao đơn hàng", () => {
  const actorRoles = ["STAFF"];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID15 [A] STAFF không được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = ["STAFF"];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID16 [A] SALE_STAFF không được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = ["SALE_STAFF"];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID17 [A] SALE_STAFF không được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = ["SALE_STAFF"];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID18 [A] SALE_STAFF không được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = ["SALE_STAFF"];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Product order — Prepare / hand over / deliver; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID19 [N] SALE_STAFF được qua cổng SALE_STAFF: chuẩn bị/bàn giao/giao đơn hàng", () => {
  const actorRoles = ["SALE_STAFF"];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID20 [A] SALE_STAFF không được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = ["SALE_STAFF"];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID21 [A] ADMIN không được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = ["ADMIN"];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID22 [A] ADMIN không được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = ["ADMIN"];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization; GBR-03; I.4.3 Admin inherits Staff.
test("ROLE-BE-01-UTCID23 [N] ADMIN được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = ["ADMIN"];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 Sale Staff Dashboard / Profile: Admin chỉ kế thừa Staff, không tự mang vai trò cá nhân SALE_STAFF trong hasRole.
test("ROLE-BE-01-UTCID24 [A] ADMIN không tự qua cổng vai trò cá nhân SALE_STAFF của hasRole", () => {
  const actorRoles = ["ADMIN"];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization.
test("ROLE-BE-01-UTCID25 [N] ADMIN được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = ["ADMIN"];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(true);
});

// SRS: I.4.4 Pet profile — Create / edit; GBR-02; III.1.4 Authorization; GBR-01.
test("ROLE-BE-01-UTCID26 [A] GUEST không được qua cổng CUSTOMER: tạo/sửa hồ sơ thú cưng", () => {
  const actorRoles = [];
  const requiredRole = "CUSTOMER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Pet sitter profile — Edit own photo, introduction and experience; GBR-02; III.1.4 Authorization; GBR-01.
test("ROLE-BE-01-UTCID27 [A] GUEST không được qua cổng PET_SITTER: sửa ảnh/giới thiệu/kinh nghiệm của Pet Sitter", () => {
  const actorRoles = [];
  const requiredRole = "PET_SITTER";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Day off — Approve / reject; GBR-02; III.1.4 Authorization; GBR-01.
test("ROLE-BE-01-UTCID28 [A] GUEST không được qua cổng STAFF: duyệt/từ chối ngày nghỉ", () => {
  const actorRoles = [];
  const requiredRole = "STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 Product order — Prepare / hand over / deliver; GBR-02; III.1.4 Authorization; GBR-01.
test("ROLE-BE-01-UTCID29 [A] GUEST không được qua cổng SALE_STAFF: chuẩn bị/bàn giao/giao đơn hàng", () => {
  const actorRoles = [];
  const requiredRole = "SALE_STAFF";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});

// SRS: I.4.4 User account — Manage user accounts; UC-10; GBR-02; III.1.4 Authorization; GBR-01.
test("ROLE-BE-01-UTCID30 [A] GUEST không được qua cổng ADMIN: quản lý tài khoản", () => {
  const actorRoles = [];
  const requiredRole = "ADMIN";

  const actual = hasRole(actorRoles, requiredRole);

  expect(actual).toBe(false);
});
