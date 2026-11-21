import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addCalendarDays, calendarDateLabel, calendarMonthLabel, mondayOf } from '../../utils/calendar-date.js';

const dateLabel = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

function shiftMonth(date, amount) {
  const month = new Date(date + 'T12:00:00Z');
  month.setUTCMonth(month.getUTCMonth() + amount);
  return month.toISOString().slice(0, 10);
}

export function CalendarMonth({ week, activeDate, today, min, max, choose }) {
  const viewedMonth = (activeDate || week).slice(0, 7) + '-01';
  const [month, setMonth] = useState(viewedMonth);
  useEffect(() => { setMonth(viewedMonth); }, [viewedMonth]);
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const first = mondayOf(month);
  return <div className="pwc-calendar-month" role="group" aria-label="Chuyển tới ngày trong tháng">
    <div className="pwc-calendar-month__heading">
      <strong aria-live="polite">{calendarMonthLabel(month)}</strong>
      <button type="button" aria-label="Tháng trước" disabled={Boolean(min && month <= min.slice(0, 7) + '-01')}
        onClick={() => setMonth(previous)}><ChevronLeft size={14} aria-hidden="true" /></button>
      <button type="button" aria-label="Tháng sau" disabled={Boolean(max && next > max)}
        onClick={() => setMonth(next)}><ChevronRight size={14} aria-hidden="true" /></button>
    </div>
    <div className="pwc-calendar-month__days">
      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(label => <span key={label}>{label}</span>)}
      {Array.from({ length: 42 }, (_, index) => addCalendarDays(first, index)).map(day => {
        const inMonth = day.slice(0, 7) === month.slice(0, 7);
        return inMonth
          ? <button type="button" key={day} aria-label={calendarDateLabel(day, dateLabel)}
              aria-current={day === today ? 'date' : undefined} aria-pressed={day === activeDate}
              disabled={Boolean((min && day < min) || (max && day > max))} onClick={() => choose(day)}>{Number(day.slice(8))}</button>
          : <span key={day} aria-hidden="true" />;
      })}
    </div>
  </div>;
}
