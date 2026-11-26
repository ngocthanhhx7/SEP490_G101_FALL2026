// CARE-NOTE-01 — chỉ kiểm thử normalizeInstructions; mỗi UTCID là một test riêng.
// Kỳ vọng nghiệp vụ theo SRS; fixtures tổng hợp, không gọi provider/database thật.
import { test, expect } from '@jest/globals';
import { normalizeInstructions } from '../../../src/services/care/care-instructions.service.js';

// SRS: SRS III.13.1.1, dòng 5036–5055: hướng dẫn ăn, thuốc, hành vi và ghi chú vào nhà.
test("CARE-NOTE-01-UTCID01 [N] Giữ thông tin ăn và hành vi của thú cưng", async () => {
  expect(normalizeInstructions({ feeding: 'Cho ăn sáng', handling: 'Tránh tiếng động lớn' })).toEqual({ feeding: 'Cho ăn sáng', handling: 'Tránh tiếng động lớn' });
});

// SRS: SRS III.13.1.1, dòng 5036–5055: hướng dẫn ăn, thuốc, hành vi và ghi chú vào nhà.
test("CARE-NOTE-01-UTCID02 [N] Giữ thông tin thuốc để tham khảo", async () => {
  expect(normalizeInstructions({ medication: 'Thông tin thuốc do khách khai báo' }).medication).toBe('Thông tin thuốc do khách khai báo');
});

// SRS: SRS III.13.1.1, dòng 5036–5055: hướng dẫn ăn, thuốc, hành vi và ghi chú vào nhà.
test("CARE-NOTE-01-UTCID03 [N] Không bắt buộc ghi chú vào nhà", async () => {
  expect(normalizeInstructions({ feeding: 'Cho ăn theo hồ sơ' })).toEqual({ feeding: 'Cho ăn theo hồ sơ' });
});
