import { addCalendarDays } from './calendar-date.js';

const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00Z'))
  && new Date(value + 'T12:00Z').toISOString().slice(0, 10) === value;

export function recurringVisits({ frequency, startDay, time, weekdays, ending, count, until }, minimum) {
  const fail = error => ({ error, visits: [], skipped: [] });
  if (!validDay(startDay) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail('Chọn ngày bắt đầu và giờ chăm sóc.');
  if (frequency === 'weekly' && !weekdays.length) return fail('Chọn ít nhất một thứ trong tuần.');
  if (ending === 'count' && (!Number.isInteger(Number(count)) || count < 1 || count > 60)) return fail('Chọn từ 1 đến 60 buổi.');
  if (ending === 'date' && (!validDay(until) || until < startDay)) return fail('Ngày kết thúc phải từ ngày bắt đầu trở đi.');

  const visits = [], skipped = [];
  const wanted = Number(startDay.slice(-2));
  let day = startDay;
  while (ending === 'count' || day <= until) {
    const date = new Date(day + 'T12:00Z');
    if (frequency === 'monthly' || weekdays.includes(date.getUTCDay())) visits.push(day + 'T' + time);
    if (visits.length > 60) return fail('Lịch vượt quá 60 buổi. Hãy rút ngắn khoảng thời gian.');
    if (ending === 'count' && visits.length === Number(count)) break;
    if (frequency === 'monthly') {
      do {
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + 2, 0);
        const last = date.getUTCDate();
        const month = date.toISOString().slice(0, 7);
        if (date.getUTCFullYear() > 9999) return fail('Lịch vượt phạm vi ngày được hỗ trợ.');
        if (ending === 'date' && month > until.slice(0, 7)) break;
        if (wanted <= last) break;
        skipped.push(month);
      } while (wanted > date.getUTCDate());
      day = date.toISOString().slice(0, 7) + '-' + String(wanted).padStart(2, '0');
    } else {
      if (day === '9999-12-31') break;
      day = addCalendarDays(day, 1);
    }
  }
  if (!visits.length) return fail('Không có buổi nào trong khoảng ngày đã chọn.');
  if (ending === 'count' && visits.length !== Number(count)) return fail('Lịch vượt phạm vi ngày được hỗ trợ.');
  if (visits[0] < minimum) return fail('Buổi đầu chưa đủ thời gian đặt trước. Hãy đổi giờ hoặc ngày bắt đầu.');
  return { visits, skipped };
}
