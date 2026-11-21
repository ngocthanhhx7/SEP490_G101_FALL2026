import { test, expect } from '@jest/globals';
import { normalizePrivateAccessNotes } from '../../../src/services/customer-address.service.js';

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-02-UTCID01 [N] Giữ ghi chú cách mở cổng", () => {
  const value = "Mã cổng thử nghiệm: 2468";
  const actual = normalizePrivateAccessNotes(value);
  expect(actual).toBe("Mã cổng thử nghiệm: 2468");
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-02-UTCID02 [N] Giữ hướng dẫn vị trí chìa khóa và chuông", () => {
  const value = "Chìa khóa ở hộp màu xanh\nBấm chuông trước khi vào";
  const actual = normalizePrivateAccessNotes(value);
  expect(actual).toBe("Chìa khóa ở hộp màu xanh\nBấm chuông trước khi vào");
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-02-UTCID03 [N] Cho phép ghi chú rỗng", () => {
  const value = "";
  const actual = normalizePrivateAccessNotes(value);
  expect(actual).toBe("");
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-02-UTCID04 [N] Không truyền ghi chú tùy chọn trả chuỗi rỗng", () => {
  const actual = normalizePrivateAccessNotes();
  expect(actual).toBe("");
});
