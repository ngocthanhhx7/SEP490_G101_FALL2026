import { test, expect } from '@jest/globals';
import { localDateTimeToUtc } from '../../../src/services/sitter-availability.service.js';

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-01-UTCID01 [N] Giữ đúng 09 giờ Việt Nam khi lưu UTC", async () => {
  expect(localDateTimeToUtc('2026-11-16', '09:00')).toBe('2026-11-16T02:00:00.000Z');
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-01-UTCID02 [B] Đầu ngày Việt Nam nằm ở ngày UTC trước", async () => {
  expect(localDateTimeToUtc('2026-11-16', '00:00')).toBe('2026-11-15T17:00:00.000Z');
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-01-UTCID03 [B] Cuối ngày Việt Nam vẫn đúng phút lịch", async () => {
  expect(localDateTimeToUtc('2026-11-16', '23:59')).toBe('2026-11-16T16:59:00.000Z');
});
