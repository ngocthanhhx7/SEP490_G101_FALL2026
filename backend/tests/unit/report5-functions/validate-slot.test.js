import { test, expect } from '@jest/globals';
import { validateSlot } from '../../../src/services/sitter-matching/scheduling.service.js';
const NOW = Date.parse('2026-11-16T01:00:00.000Z');

// SRS: UC-25; GBR-09 (R3: tối thiểu 2 giờ).
test("AI-SLOT-01-UTCID01 [B] Đúng 2 giờ trước được đặt", async () => {
  const start = NOW + 120 * 60000;
  expect(validateSlot({ startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString() }, NOW)).toMatchObject({ start, end: start + 3600000 });
});

// SRS: UC-25; GBR-09.
test("AI-SLOT-01-UTCID02 [N] Trên 2 giờ trước được đặt", async () => {
  const start = NOW + 180 * 60000;
  expect(validateSlot({ startAt: new Date(start).toISOString(), endAt: new Date(start + 3600000).toISOString() }, NOW)).toMatchObject({ start, end: start + 3600000 });
});

// SRS: UC-25; GBR-09; khoảng visit có start trước end.
test("AI-SLOT-01-UTCID03 [B] Thiếu một phút để đủ 2 giờ bị từ chối", async () => {
  expect(() => validateSlot({ startAt: new Date(NOW + 119 * 60000).toISOString(), endAt: new Date(NOW + 179 * 60000).toISOString() }, NOW)).toThrow(expect.objectContaining({ code: 'SLOT_INVALID' }));
});

// SRS: UC-25; GBR-09; khoảng visit có start trước end.
test("AI-SLOT-01-UTCID04 [A] Giờ kết thúc trước giờ bắt đầu bị từ chối", async () => {
  expect(() => validateSlot({ startAt: new Date(NOW + 1440 * 60000).toISOString(), endAt: new Date(NOW + 1439 * 60000).toISOString() }, NOW)).toThrow(expect.objectContaining({ code: 'SLOT_INVALID' }));
});

// SRS: UC-25; GBR-09; khoảng visit có start trước end.
test("AI-SLOT-01-UTCID05 [A] Slot có độ dài bằng không bị từ chối", async () => {
  expect(() => validateSlot({ startAt: new Date(NOW + 1440 * 60000).toISOString(), endAt: new Date(NOW + 1440 * 60000).toISOString() }, NOW)).toThrow(expect.objectContaining({ code: 'SLOT_INVALID' }));
});
