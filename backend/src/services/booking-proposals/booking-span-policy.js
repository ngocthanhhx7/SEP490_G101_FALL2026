import { fail } from '../../validators/pet-care.validator.js';

const DAY = 86400000;
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
});
const localDate = value => {
  const parts = Object.fromEntries(formatter.formatToParts(value).map(row => [row.type, row.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const dayNumber = value => Date.parse(localDate(value) + 'T00:00:00Z') / DAY;

// Both the first and the last occupied Vietnam calendar day count toward GBR-09.
// End instants are exclusive: a shift ending at midnight does not occupy the next day.
export function assertBookingSpan(visits) {
  if (!Array.isArray(visits) || visits.length === 0) fail('MSG20', 'Một lịch đặt kéo dài tối đa 30 ngày.');
  const first = visits.reduce((min, row) => row.startAt < min ? row.startAt : min, visits[0].startAt);
  const last = visits.reduce((max, row) => row.endAt > max ? row.endAt : max, visits[0].endAt);
  if (!(first instanceof Date) || !(last instanceof Date) || !Number.isFinite(first.getTime()) ||
    !Number.isFinite(last.getTime()) || last <= first ||
    dayNumber(new Date(last.getTime() - 1)) - dayNumber(first) >= 30)
    fail('MSG20', 'Một lịch đặt kéo dài tối đa 30 ngày.');
}
