// BCH-POL-05 — checkLeadTime (BE/services/booking-change/booking-change-policy.js)
// SRS/R3 23/11: GBR-09/22, MSG19/54: giờ cũ >= 24h, giờ mới >= 2h; buổi đã check-in không chuyển giờ.
import { test, expect } from '@jest/globals';
import { checkLeadTime } from '../../../src/services/booking-change/booking-change-policy.js';

const NOW = new Date('2027-01-10T02:00:00.000Z');
const HOUR = 3600000;
const DAY = 24 * HOUR;
const baseVisit = (overrides = {}) => ({
  _id: 'visit-1',
  state: 'ASSIGNED',
  checkInAt: null,
  startAt: new Date(+NOW + DAY),
  endAt: new Date(+NOW + DAY + HOUR),
  ...overrides,
});

test('BCH-POL-05-UTCID01 [B] Giờ cũ còn đúng 24 giờ và giờ mới còn đúng 2 giờ hợp lệ', () => {
  expect(() => checkLeadTime([{ visit: baseVisit({ startAt: new Date(+NOW + DAY) }), startAt: new Date(+NOW + 2 * HOUR) }], NOW)).not.toThrow();
});

test('BCH-POL-05-UTCID02 [B] Giờ cũ còn 24 giờ thiếu 1ms và giờ mới 48 giờ bị từ chối MSG54', () => {
  expect(() => checkLeadTime([{ visit: baseVisit({ startAt: new Date(+NOW + DAY - 1) }), startAt: new Date(+NOW + 2 * DAY) }], NOW))
    .toThrow(expect.objectContaining({ status: 422, code: 'MSG54' }));
});

test('BCH-POL-05-UTCID03 [B] Giờ cũ còn 48 giờ và giờ mới 2 giờ thiếu 1ms bị từ chối MSG54', () => {
  expect(() => checkLeadTime([{ visit: baseVisit({ startAt: new Date(+NOW + 2 * DAY) }), startAt: new Date(+NOW + 2 * HOUR - 1) }], NOW))
    .toThrow(expect.objectContaining({ status: 422, code: 'MSG54' }));
});

test('BCH-POL-05-UTCID04 [A] Buổi đã check-in không thể được chuyển giờ', () => {
  expect(() => checkLeadTime([{ visit: baseVisit({ startAt: new Date(+NOW + 2 * DAY), checkInAt: new Date(+NOW - 60000) }), startAt: new Date(+NOW + 3 * DAY) }], NOW))
    .toThrow(expect.objectContaining({ status: 422, code: 'MSG54' }));
});

test('BCH-POL-05-UTCID05 [N] Các mốc thời gian đều hợp lệ được chấp nhận', () => {
  expect(() => checkLeadTime([{ visit: baseVisit({ startAt: new Date(+NOW + 2 * DAY) }), startAt: new Date(+NOW + 3 * DAY) }], NOW)).not.toThrow();
});
