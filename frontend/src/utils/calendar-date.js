const zone = 'Asia/Ho_Chi_Minh';
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });

export function vietnamDate(now = new Date()) {
  const parts = Object.fromEntries(localDay.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function vietnamDateTime(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 16);
}

export function addCalendarDays(date, days) {
  const cursor = new Date(date + 'T12:00:00Z');
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export function mondayOf(date) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}

export function calendarDateLabel(date, options) {
  return new Intl.DateTimeFormat('vi-VN', { ...options, timeZone: zone }).format(new Date(date + 'T12:00:00Z'));
}

export function calendarMonthLabel(date) {
  return `Tháng ${Number(date.slice(5, 7))}, ${date.slice(0, 4)}`;
}
