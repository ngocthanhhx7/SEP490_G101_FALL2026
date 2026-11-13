import { expect, test } from '@jest/globals';
import {
  groomingCoveredSlots, groomingLocalDate, groomingLocalTime, groomingSlotKey, groomingSlotStarts, groomingSlotsNeeded, groomingWindow, isGroomingDate
} from '../../src/utils/grooming-slot-time.js';

test('local date and time follow Vietnam time across the UTC day boundary', () => {
  const late = new Date('2026-11-05T18:30:00Z');
  expect(groomingLocalDate(late)).toBe('2026-11-06');
  expect(groomingLocalTime(late)).toBe('01:30');
  expect(groomingSlotKey(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-05T10:00+07:00');
});

test('the booking window is seven local days: today to six days later', () => {
  const window = groomingWindow(new Date('2026-11-05T18:30:00Z'));
  expect(window.dates).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
  expect(window.firstDate).toBe('2026-11-06');
  expect(window.lastDate).toBe('2026-11-12');
  expect(window.dates).not.toContain('2026-11-13');
});

test('a day has twenty-four one-hour slot starts', () => {
  const starts = groomingSlotStarts('2026-11-05');
  expect(starts).toHaveLength(24);
  expect(starts[0].toISOString()).toBe('2026-11-04T17:00:00.000Z');
  expect(groomingLocalTime(starts[10])).toBe('10:00');
  expect(groomingLocalTime(starts[23])).toBe('23:00');
});

test.each([[1, 1], [15, 1], [60, 1], [61, 2], [90, 2], [150, 3], [180, 3], [181, 4]])('%i minutes need %i slots', (minutes, slots) => {
  expect(groomingSlotsNeeded(minutes)).toBe(slots);
});

test('covered slots are consecutive one-hour starts', () => {
  const covered = groomingCoveredSlots(new Date('2026-11-05T03:00:00Z'), 150).map(groomingSlotKey);
  expect(covered).toEqual(['2026-11-05T10:00+07:00', '2026-11-05T11:00+07:00', '2026-11-05T12:00+07:00']);
});

test.each([['2026-11-05', true], ['2026-02-29', false], ['2026-13-01', false], ['2026-1-5', false], ['', false], [20261105, false], [null, false]])('date %p is valid: %p', (value, valid) => {
  expect(isGroomingDate(value)).toBe(valid);
});
