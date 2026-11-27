import { test, expect } from '@jest/globals';
import { occupiedMinutes } from '../../../src/services/employee-scheduling/schedule-policy.service.js';
const at = time => Date.parse('2026-11-16T' + time + ':00+07:00');

// SRS: GBR-12/45; UC-80; phép tính thời gian phục vụ lịch.
test("SHIFT-POL-02-UTCID01 [N] Một giờ bận trong phạm vi", async () => {
  expect(occupiedMinutes([{ startAt: at('09:00'), endAt: at('10:00') }], at('08:00'), at('12:00'))).toBe(60);
});

// SRS: GBR-12/45; UC-80; phép tính thời gian phục vụ lịch.
test("SHIFT-POL-02-UTCID02 [N] Cộng hai khoảng bận không trùng", async () => {
  expect(occupiedMinutes([{ startAt: at('09:00'), endAt: at('10:00') },{ startAt: at('11:00'), endAt: at('12:00') }], at('08:00'), at('13:00'))).toBe(120);
});

// SRS: GBR-12/45; UC-80; phép tính thời gian phục vụ lịch.
test("SHIFT-POL-02-UTCID03 [N] Khoảng bận ngoài phạm vi không được tính", async () => {
  expect(occupiedMinutes([{ startAt: at('13:00'), endAt: at('14:00') }], at('08:00'), at('12:00'))).toBe(0);
});

// SRS: GBR-12/45; UC-80; phép tính thời gian phục vụ lịch.
test("SHIFT-POL-02-UTCID04 [B] Chạm biên không tạo phút bận", async () => {
  expect(occupiedMinutes([{ startAt: at('12:00'), endAt: at('13:00') }], at('08:00'), at('12:00'))).toBe(0);
});

// SRS: GBR-12/45; UC-80; phép tính thời gian phục vụ lịch.
test("SHIFT-POL-02-UTCID05 [B] Chỉ phần giao của khoảng bận được tính", async () => {
  expect(occupiedMinutes([{ startAt: at('07:30'), endAt: at('08:30') }], at('08:00'), at('12:00'))).toBe(30);
});
