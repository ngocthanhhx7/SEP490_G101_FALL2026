import { test, expect } from '@jest/globals';
import { canonicalizeContact } from '../../../src/services/contact-crypto.service.js';

// CONTACT-01: mỗi test khớp một UTCID trong CONTACT-01_canonicalizeContact.
// Chỉ kiểm tra yêu cầu bắt buộc, email được chuẩn hóa và định dạng liên hệ.
// PHONE ở service là E.164: +84912345678 biểu diễn đầu vào SRS 0912345678.
// Không kiểm thử giới hạn E.164/email trong code hoặc thuật toán crypto.
// Quy tắc nhập 10 số bắt đầu bằng 0 thuộc boundary, không áp vào chuỗi E.164.
function expectInvalid(channel, value) {
  expect(() => canonicalizeContact(channel, value)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED', message: 'Contact value is invalid',
  }));
}

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID01 [N] Email hợp lệ: trả đúng email đã chuẩn hóa", () => {
  expect(canonicalizeContact('EMAIL', "contact-owner@example.test")).toBe("contact-owner@example.test");
});

// SRS: SRS III.1.1.1 Email address — normalizes before checking.
test("CONTACT-01-UTCID02 [N] Email có chữ hoa và khoảng trắng ngoài: chuẩn hóa trước khi kiểm tra", () => {
  expect(canonicalizeContact('EMAIL', "  Contact-Owner@Example.Test  ")).toBe("contact-owner@example.test");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID03 [A] Email rỗng: từ chối trường bắt buộc", () => {
  expectInvalid('EMAIL', "");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID04 [A] Thiếu email: từ chối trường bắt buộc", () => {
  expectInvalid('EMAIL', undefined);
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID05 [A] Email không có @: từ chối định dạng sai", () => {
  expectInvalid('EMAIL', "contact-owner.example.test");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID06 [N] Số điện thoại hợp lệ đã chuẩn hóa: giữ giá trị canonical", () => {
  expect(canonicalizeContact('PHONE', "+84912345678")).toBe("+84912345678");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID07 [A] Số điện thoại chứa chữ cái: từ chối", () => {
  expectInvalid('PHONE', "+8491234567x");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID08 [A] Số điện thoại rỗng: từ chối trường bắt buộc", () => {
  expectInvalid('PHONE', "");
});

// SRS: UC-01 Alternative 4; III.1.1.1 Email/Phone; MSG01/02/03.
test("CONTACT-01-UTCID09 [A] Thiếu số điện thoại: từ chối trường bắt buộc", () => {
  expectInvalid('PHONE', undefined);
});
