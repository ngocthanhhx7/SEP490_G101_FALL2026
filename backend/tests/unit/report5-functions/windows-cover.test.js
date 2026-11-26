import { test, expect } from '@jest/globals';
import { windowsCover } from '../../../src/services/employee-scheduling/schedule-policy.service.js';
const at = time => Date.parse('2026-11-16T' + time + ':00+07:00');

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID01 [N] Visit nằm trong ca làm", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}], at('09:00'), at('10:00'))).toBe(true);
});

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID02 [B] Visit khớp cả hai đầu ca làm", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}], at('08:00'), at('12:00'))).toBe(true);
});

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID03 [B] Visit kết thúc sau ca một phút", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}], at('11:00'), at('12:01'))).toBe(false);
});

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID04 [B] Visit bắt đầu trước ca một phút", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}], at('07:59'), at('09:00'))).toBe(false);
});

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID05 [A] Khoảng nghỉ giữa hai ca không bao phủ toàn visit", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}, {"weekday": 1, "startLocalTime": "13:00", "endLocalTime": "17:00"}], at('11:00'), at('14:00'))).toBe(false);
});

// SRS: GBR-12/45; UC-29/80.
test("SHIFT-POL-01-UTCID06 [N] Hai khung liền nhau bao phủ visit liên tục", async () => {
  expect(windowsCover([{"weekday": 1, "startLocalTime": "08:00", "endLocalTime": "12:00"}, {"weekday": 1, "startLocalTime": "12:00", "endLocalTime": "17:00"}], at('11:00'), at('13:00'))).toBe(true);
});
