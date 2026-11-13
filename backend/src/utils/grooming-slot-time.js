import { GROOMING_SLOT_MINUTES, GROOMING_UTC_OFFSET_MINUTES, GROOMING_WINDOW_DAYS } from '../constants/grooming.js';

const MINUTE = 60000;
const DAY = 86400000;
const OFFSET = GROOMING_UTC_OFFSET_MINUTES * MINUTE;

// Vietnam has no daylight saving, so a fixed +07:00 offset is exact.
export const groomingLocalDate = value => new Date(new Date(value).getTime() + OFFSET).toISOString().slice(0, 10);
export const groomingLocalTime = value => new Date(new Date(value).getTime() + OFFSET).toISOString().slice(11, 16);
export const groomingDayStart = date => new Date(`${date}T00:00:00+07:00`);
export const groomingSlotKey = value => `${groomingLocalDate(value)}T${groomingLocalTime(value)}+07:00`;

export function isGroomingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

// Today and the following local days (offset 0..6); the window counts local calendar days.
export function groomingWindow(now) {
  const start = Date.parse(`${groomingLocalDate(now)}T00:00:00Z`);
  const dates = Array.from({ length: GROOMING_WINDOW_DAYS }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
  return { firstDate: dates[0], lastDate: dates.at(-1), dates };
}

export function groomingSlotStarts(date) {
  const first = groomingDayStart(date).getTime();
  return Array.from({ length: (24 * 60) / GROOMING_SLOT_MINUTES }, (_, index) => new Date(first + index * GROOMING_SLOT_MINUTES * MINUTE));
}

export const groomingSlotsNeeded = durationMinutes => Math.max(1, Math.ceil(durationMinutes / GROOMING_SLOT_MINUTES));

export function groomingCoveredSlots(startAt, durationMinutes) {
  const start = new Date(startAt).getTime();
  return Array.from({ length: groomingSlotsNeeded(durationMinutes) }, (_, index) => new Date(start + index * GROOMING_SLOT_MINUTES * MINUTE));
}
