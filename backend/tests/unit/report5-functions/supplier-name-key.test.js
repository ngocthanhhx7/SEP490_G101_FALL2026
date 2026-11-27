// SUP-NAME-01 — chỉ kiểm thử supplierNameKey; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { supplierNameKey } from '../../../src/utils/supplier-name.js';

// SRS: SRS III.25.1.1 dòng 6075–6076: hai nhà cung cấp không có cùng tên.
test("SUP-NAME-01-UTCID01 [N] Cùng tên tạo cùng khóa để tra trùng tên", async () => {
  expect(supplierNameKey('Nhà cung cấp Mẫu')).toBe(supplierNameKey('Nhà cung cấp Mẫu'));
});

// SRS: SRS III.25.1.1 dòng 6075–6076: hai nhà cung cấp không có cùng tên.
test("SUP-NAME-01-UTCID02 [N] Tên khác nhau không bị gộp thành một nhà cung cấp", async () => {
  expect(supplierNameKey('Nhà cung cấp Mẫu A')).not.toBe(supplierNameKey('Nhà cung cấp Mẫu B'));
});
