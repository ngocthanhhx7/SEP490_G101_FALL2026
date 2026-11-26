import { test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { normalizeCustomerDisplayName } from '../../../src/services/customer-registration.service.js';

// REG-01: đúng 34 UTCID trong sheet REG-01_normalizeCustomerDisplay.
// Một test = một lần gọi normalizeCustomerDisplayName. Không test factory/service khác.
// Kỳ vọng tên 2–50 chữ cái/dấu cách lấy từ SRS MSG12; giữ nguyên ca lỗi của sheet.

// Sheet yêu cầu không ghi console; kiểm tra sau mỗi ca, kể cả ca Failed.
let consoleSpies = [];
beforeEach(() => {
  consoleSpies = ['log', 'warn', 'error', 'info', 'debug']
    .map(method => jest.spyOn(console, method).mockImplementation(() => {}));
});
afterEach(() => {
  const counts = consoleSpies.map(spy => spy.mock.calls.length);
  consoleSpies.forEach(spy => spy.mockRestore());
  expect(counts).toEqual([0, 0, 0, 0, 0]);
});

function expectInvalidName(value) {
  expect(() => normalizeCustomerDisplayName(value)).toThrow(expect.objectContaining({
    name: 'AppError', status: 422, code: 'VALIDATION_FAILED',
    message: 'Registration details are invalid',
  }));
}

test("REG-01-UTCID01 [N] Giữ nguyên tên tiếng Việt hợp lệ", () => {
  const actual = normalizeCustomerDisplayName("Nguyễn Văn An");
  expect(actual).toBe("Nguyễn Văn An");
});

test("REG-01-UTCID02 [N] Giữ nguyên tên ASCII hợp lệ", () => {
  const actual = normalizeCustomerDisplayName("Nguyen Van An");
  expect(actual).toBe("Nguyen Van An");
});

test("REG-01-UTCID03 [N] Bỏ khoảng trắng đầu và cuối", () => {
  const actual = normalizeCustomerDisplayName("  Nguyễn Văn An  ");
  expect(actual).toBe("Nguyễn Văn An");
});

test("REG-01-UTCID04 [N] Gộp nhiều dấu cách liên tiếp", () => {
  const actual = normalizeCustomerDisplayName("Nguyễn   Văn  An");
  expect(actual).toBe("Nguyễn Văn An");
});

test("REG-01-UTCID05 [N] Chuẩn hóa tab và xuống dòng ở giữa tên", () => {
  const actual = normalizeCustomerDisplayName("Nguyễn\tVăn\nAn");
  expect(actual).toBe("Nguyễn Văn An");
});

test("REG-01-UTCID06 [B] Từ chối tên rỗng tại biên 0 ký tự", () => {
  expectInvalidName("");
});

test("REG-01-UTCID07 [A] Từ chối chuỗi chỉ có dấu cách", () => {
  expectInvalidName("   ");
});

test("REG-01-UTCID08 [A] Từ chối tham số undefined", () => {
  expectInvalidName(undefined);
});

test("REG-01-UTCID09 [A] Từ chối tham số null", () => {
  expectInvalidName(null);
});

test("REG-01-UTCID10 [A] Từ chối kiểu number", () => {
  expectInvalidName(123);
});

test("REG-01-UTCID11 [A] Từ chối kiểu boolean", () => {
  expectInvalidName(true);
});

test("REG-01-UTCID12 [A] Từ chối kiểu array", () => {
  expectInvalidName(["An"]);
});

test("REG-01-UTCID13 [A] Từ chối kiểu object", () => {
  expectInvalidName({ name: "An" });
});

// Sheet ghi DEF_NAME_01: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID14 [B] Từ chối tên 1 ký tự theo MSG12", () => {
  expectInvalidName("A");
});

test("REG-01-UTCID15 [B] Chấp nhận đúng biên dưới 2 ký tự", () => {
  const actual = normalizeCustomerDisplayName("An");
  expect(actual).toBe("An");
});

test("REG-01-UTCID16 [B] Chấp nhận tên 49 ký tự", () => {
  const actual = normalizeCustomerDisplayName("A".repeat(49));
  expect(actual).toBe("A".repeat(49));
});

test("REG-01-UTCID17 [B] Chấp nhận đúng biên trên 50 ký tự", () => {
  const actual = normalizeCustomerDisplayName("A".repeat(50));
  expect(actual).toBe("A".repeat(50));
});

// Sheet ghi DEF_NAME_02: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID18 [B] Từ chối 51 ký tự vượt biên SRS", () => {
  expectInvalidName("A".repeat(51));
});

// Sheet ghi DEF_NAME_02: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID19 [B] Từ chối 100 ký tự dù còn trong guard của code", () => {
  expectInvalidName("A".repeat(100));
});

test("REG-01-UTCID20 [B] Từ chối 101 ký tự vượt guard hiện tại", () => {
  expectInvalidName("A".repeat(101));
});

test("REG-01-UTCID21 [B] Áp dụng biên 50 sau khi trim", () => {
  const actual = normalizeCustomerDisplayName("  " + "A".repeat(50) + "  ");
  expect(actual).toBe("A".repeat(50));
});

// Sheet ghi DEF_NAME_02: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID22 [B] Từ chối 51 ký tự sau khi trim", () => {
  expectInvalidName(" " + "A".repeat(51) + " ");
});

// Sheet ghi DEF_NAME_03: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID23 [A] Từ chối tên chứa chữ số", () => {
  expectInvalidName("An123");
});

// Sheet ghi DEF_NAME_03: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID24 [A] Từ chối tên chứa ký hiệu @", () => {
  expectInvalidName("An@");
});

// Sheet ghi DEF_NAME_03: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID25 [A] Từ chối tên chứa emoji", () => {
  expectInvalidName("An🐾");
});

test("REG-01-UTCID26 [A] Từ chối ký tự điều khiển NUL", () => {
  expectInvalidName("An\u0000Nguyễn");
});

test("REG-01-UTCID27 [A] Từ chối ký tự điều khiển DEL", () => {
  expectInvalidName("AnNguyễn");
});

test("REG-01-UTCID28 [A] Từ chối ký tự điều khiển U+001F", () => {
  expectInvalidName("An\u001fNguyễn");
});

// Sheet ghi DEF_NAME_01: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID29 [B] Từ chối tên chỉ còn 1 ký tự sau trim", () => {
  expectInvalidName(" A ");
});

test("REG-01-UTCID30 [N] Chuẩn hóa non-breaking space thành dấu cách", () => {
  const actual = normalizeCustomerDisplayName("Nguyễn\u00a0Văn An");
  expect(actual).toBe("Nguyễn Văn An");
});

// Sheet ghi DEF_NAME_03: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID31 [A] Từ chối dấu gạch nối theo tập ký tự MSG12", () => {
  expectInvalidName("An-Nguyen");
});

// Sheet ghi DEF_NAME_03: giữ kỳ vọng SRS, không đổi theo code hiện tại.

test("REG-01-UTCID32 [A] Từ chối zero-width space không phải chữ/dấu cách", () => {
  expectInvalidName("An\u200bNguyễn");
});

test("REG-01-UTCID33 [A] Từ chối chuỗi chỉ gồm tab, CR và LF", () => {
  expectInvalidName("\t\r\n");
});

test("REG-01-UTCID34 [N] Giữ nguyên chữ Đ và dấu tiếng Việt", () => {
  const actual = normalizeCustomerDisplayName("Đặng Văn Hải");
  expect(actual).toBe("Đặng Văn Hải");
});
