import { test, expect } from '@jest/globals';
import { planInsertion } from '../../../src/services/sitter-matching/scheduling.service.js';
const at = time => Date.parse('2026-11-18T' + time + ':00+07:00');
function input() { return { profile: { starts: [{ localDate: '2026-11-18', point: [106.7, 10.8],
  availableFrom: new Date(at('08:00')).toISOString(), availableUntil: new Date(at('18:00')).toISOString() }],
  dayOffDates: [], windows: [{ weekday: 3, startMinute: 480, endMinute: 1080 }] },
  blocks: [], slot: { start: at('10:00'), end: at('11:00'), localDate: '2026-11-18' },
  address: { point: { coordinates: [106.71, 10.81] } }, matrix: () => 5 }; }

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID01 [N] Chèn visit vào ngày rảnh trong giờ làm mà không sửa input", async () => {
  const value = input();
  const before = JSON.stringify({ profile: value.profile, blocks: value.blocks });
  const actual = await planInsertion(value);
  expect(actual.eligible).toBe(true);
  expect(JSON.stringify({ profile: value.profile, blocks: value.blocks })).toBe(before);
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID02 [A] Ngày nghỉ không được nhận visit", async () => {
  const value = input(); value.profile.dayOffDates = ['2026-11-18'];
  expect(await planInsertion(value)).toMatchObject({ eligible: false, reason: 'DAY_OFF' });
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID03 [A] Ngoài giờ làm không được gợi ý", async () => {
  const value = input(); value.profile.windows[0].endMinute = 540;
  expect(await planInsertion(value)).toMatchObject({ eligible: false, reason: 'OUTSIDE_WORKING_HOURS' });
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID04 [A] Không chèn visit chồng lên visit đã có", async () => {
  const value = input(); value.blocks = [{ _id: 'old-visit', kind: 'VISIT', startAt: new Date(at('10:30')).toISOString(),
    endAt: new Date(at('11:30')).toISOString(), point: [106.72, 10.82] }];
  expect(await planInsertion(value)).toMatchObject({ eligible: false, reason: 'VISIT_CONFLICT' });
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID05 [A] Khoảng hở 10 phút không đủ cho ETA 20 phút", async () => {
  const value = input(); value.matrix = () => 20;
  value.slot = { start: at('10:10'), end: at('11:10'), localDate: '2026-11-18' };
  value.blocks = [{ _id: 'before', kind: 'VISIT', startAt: new Date(at('09:30')).toISOString(),
    endAt: new Date(at('10:00')).toISOString(), point: [106.72, 10.82] }];
  expect(await planInsertion(value)).toMatchObject({ eligible: false, reason: 'TRAVEL_TIME_CONFLICT' });
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
test("AI-SLOT-02-UTCID06 [N] Chèn giữa hai visit có đủ khoảng đi lại", async () => {
  const value = input(); value.slot = { start: at('11:00'), end: at('12:00'), localDate: '2026-11-18' };
  value.blocks = [{ _id: 'before', kind: 'VISIT', startAt: new Date(at('09:00')).toISOString(),
    endAt: new Date(at('09:30')).toISOString(), point: [106.72, 10.82] },
  { _id: 'after', kind: 'VISIT', startAt: new Date(at('14:00')).toISOString(),
    endAt: new Date(at('14:30')).toISOString(), point: [106.73, 10.83] }];
  expect(await planInsertion(value)).toMatchObject({ eligible: true, beforeVisitId: 'before', afterVisitId: 'after' });
});

// SRS: GBR-12/32/45; JOB-02: ở trong giờ, không nghỉ, không trùng và đủ thời gian di chuyển.
// DEF_AI_SLOT_WINDOW_START: giữ kỳ vọng SRS, không sửa runtime để chạy xanh.
test("AI-SLOT-02-UTCID07 [B] Đúng đầu giờ làm tại cùng địa điểm phải khả thi", async () => {
  const value = input(); value.slot = { start: at('08:00'), end: at('09:00'), localDate: '2026-11-18' };
  value.address.point.coordinates = [...value.profile.starts[0].point]; value.matrix = () => 0;
  expect(await planInsertion(value)).toMatchObject({ eligible: true });
});
