import { test, expect } from '@jest/globals';
import { normalizeServiceLocation } from '../../../src/services/customer-address.service.js';

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-01-UTCID01 [N] Chấp nhận địa chỉ có dấu tiếng Việt", () => {
  const value = "12 Đường Hoa, phường Bình An";
  const actual = normalizeServiceLocation(value);
  expect(actual).toBe(value);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-01-UTCID02 [N] Chấp nhận số nhà có dấu gạch và dấu chéo", () => {
  const value = "Lô B-12/3, hẻm 4, phường Bình An";
  const actual = normalizeServiceLocation(value);
  expect(actual).toBe(value);
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-01-UTCID03 [A] Không chấp nhận địa điểm rỗng", () => {
  const value = "";
  const actual = normalizeServiceLocation(value);
  expect(actual).toBeNull();
});

// SRS: UC-12; III.3.3.2 Service Addresses and Home Access.
test("ADDRESS-01-UTCID04 [A] Không chấp nhận địa điểm chỉ có dấu cách", () => {
  const value = "   ";
  const actual = normalizeServiceLocation(value);
  expect(actual).toBeNull();
});
