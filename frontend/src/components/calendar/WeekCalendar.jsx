import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addCalendarDays, calendarDateLabel, calendarMonthLabel, mondayOf, vietnamDate } from '../../utils/calendar-date.js';
import { CalendarMonth } from './CalendarMonth.jsx';
import { CalendarTimeline } from './CalendarTimeline.jsx';
import './week-calendar.css';

const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const fullDate = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };

export function WeekCalendar({ value, onChange, min, max, today = vietnamDate(), markedDays, markLabel = 'có lịch', label = 'Chọn ngày', timeline, legend, recurring = false, monthOverview = false }) {
  const home = min && today < min ? min : max && today > max ? max : today;
  const [week, setWeek] = useState(() => mondayOf(value || home));
  const [focusedDay, setFocusedDay] = useState('');
  useEffect(() => {
    if (value) { setWeek(mondayOf(value)); setFocusedDay(value); }
  }, [value]);
  const days = dayNames.map((_, index) => addCalendarDays(week, index));
  const inRange = day => (!min || day >= min) && (!max || day <= max);
  const activeDate = days.includes(focusedDay) && inRange(focusedDay) ? focusedDay : days.find(inRange);
  const last = addCalendarDays(week, 6);
  const previous = addCalendarDays(week, -7);
  const next = addCalendarDays(week, 7);
  const month = calendarMonthLabel(week);
  const endMonth = calendarMonthLabel(last);
  function choose(day) {
    setWeek(mondayOf(day));
    setFocusedDay(day);
    if (day !== value) onChange(day);
  }
  return <div className="pwc-week-calendar" role="group" aria-label={label} data-timeline={timeline ? true : undefined}>
    {!recurring && <div className="pwc-week-calendar__toolbar">
      <strong aria-live="polite">{month === endMonth ? month : `${month} – ${endMonth}`}</strong>
      <div className="pwc-week-calendar__navigation">
        <button type="button" onClick={() => choose(today)} disabled={activeDate === today || today !== home}>Hôm nay</button>
        <button type="button" aria-label="Tuần trước" disabled={Boolean(min && addCalendarDays(previous, 6) < min)}
          onClick={() => setWeek(previous)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="Tuần sau" disabled={Boolean(max && next > max)}
          onClick={() => setWeek(next)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>}
    {legend}
    <div className={monthOverview ? 'pwc-week-calendar__layout' : undefined}>
      {monthOverview && <CalendarMonth week={week} activeDate={activeDate} today={today} min={min} max={max} choose={choose} />}
      <div className="pwc-week-calendar__week">
        <div className="pwc-week-calendar__days" role="group" aria-label="Các ngày trong tuần">
          {dayNames.map((name, index) => {
            const day = days[index];
            const marked = markedDays?.has(day);
            return <button key={day} type="button" aria-label={calendarDateLabel(day, recurring ? { weekday: 'long' } : fullDate) + (marked ? ', ' + markLabel : '')}
              aria-current={!recurring && day === today ? 'date' : undefined} aria-pressed={value === day}
              disabled={!inRange(day)} onClick={() => choose(day)}>
              <span>{name}</span>{!recurring && <time dateTime={day}>{Number(day.slice(-2))}</time>}
              {marked && <span className="pwc-week-calendar__mark" aria-hidden="true" />}
            </button>;
          })}
        </div>
        {timeline && <CalendarTimeline {...timeline} days={days} activeDate={activeDate} recurring={recurring} onDayFocus={setFocusedDay}
          canPick={timeline.onPick ? (date, time) => inRange(date) && (timeline.canPick?.(date, time) ?? true) : undefined} />}
      </div>
    </div>
  </div>;
}
