import { test, expect } from '@jest/globals';
import { normalizeWorkingWindows } from '../../../src/services/sitter-availability.service.js';

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-02-UTCID01 [N] Một khoảng làm việc trong ngày", async () => {
  const windows = [{"weekday": 1, "startLocalTime": "09:00", "endLocalTime": "12:00"}];
  expect(normalizeWorkingWindows(windows)).toEqual(windows);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-02-UTCID02 [N] Một ngày có nhiều khoảng làm việc", async () => {
  const windows = [{"weekday": 1, "startLocalTime": "09:00", "endLocalTime": "12:00"}, {"weekday": 1, "startLocalTime": "13:00", "endLocalTime": "17:00"}];
  expect(normalizeWorkingWindows(windows)).toEqual(windows);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45.
test("AVAIL-02-UTCID03 [N] Tất cả ngày Off không có khoảng làm việc", async () => {
  const windows = [];
  expect(normalizeWorkingWindows(windows)).toEqual(windows);
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45; Shift Schedule end after start.
test("AVAIL-02-UTCID04 [A] Thiếu giờ kết thúc không thành một khoảng hợp lệ", async () => {
  expect(() => normalizeWorkingWindows([{ weekday: 1, startLocalTime: '09:00' }])).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});

// SRS: UC-29/80; III.9.1.1 Working Hours Calendar/III.9.1.4 Shift Schedule; GBR-45; Shift Schedule end after start.
test("AVAIL-02-UTCID05 [A] Khoảng có giờ kết thúc bằng giờ bắt đầu bị từ chối", async () => {
  expect(() => normalizeWorkingWindows([{ weekday: 1, startLocalTime: '09:00', endLocalTime: '09:00' }])).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});
