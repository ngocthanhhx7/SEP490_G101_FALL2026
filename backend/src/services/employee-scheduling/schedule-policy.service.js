import { normalizeWorkingWindows, localDateTimeToUtc } from '../sitter-availability.service.js';

const DAY = 86400000;
export const workAreaKeys = (code, catalog) => [code, ...catalog.filter(row => row.code === code && row.parentCode).map(row => row.parentCode)];
export const schedulingDate = value => new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function windowsCover(windows, startAt, endAt) {
  const start = new Date(startAt).getTime(), end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > DAY) return false;
  const local = new Date(`${schedulingDate(startAt)}T00:00:00Z`);
  const normalized = normalizeWorkingWindows(windows ?? []);
  const intervals = [];
  for (const offset of [-1, 0, 1]) {
    const date = new Date(local.getTime() + offset * DAY), day = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay() || 7;
    for (const window of normalized.filter(row => row.weekday === weekday)) {
      const from = Date.parse(localDateTimeToUtc(day, window.startLocalTime));
      let to = Date.parse(localDateTimeToUtc(day, window.endLocalTime));
      if (to <= from) to += DAY;
      intervals.push([from, to]);
    }
  }
  let covered = start;
  for (const [from, to] of intervals.sort((a, b) => a[0] - b[0])) {
    if (from > covered) continue;
    covered = Math.max(covered, to);
    if (covered >= end) return true;
  }
  return false;
}
export function schedulingWeekStart(value) {
  const local = new Date(new Date(value).getTime() + 7 * 3600000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCDay() + 6) % 7) - 7 * 3600000);
}
export const occupiedMinutes = (rows, start, end) => rows.reduce((sum, row) => sum +
  Math.max(0, Math.min(new Date(row.endAt).getTime(), end) - Math.max(new Date(row.startAt).getTime(), start)) / 60000, 0);

export function matchingWindows(windows) {
  const result = [], minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  for (const row of normalizeWorkingWindows(windows)) {
    const startMinute = minute(row.startLocalTime), endMinute = minute(row.endLocalTime), weekday = row.weekday % 7;
    if (endMinute > startMinute) result.push({ weekday, startMinute, endMinute });
    else {
      result.push({ weekday, startMinute, endMinute: 1440 });
      if (endMinute > 0) result.push({ weekday: (weekday + 1) % 7, startMinute: 0, endMinute });
    }
  }
  return result;
}
