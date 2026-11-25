import { useEffect, useRef, useState } from 'react';
import { calendarDateLabel, vietnamDateTime } from '../../utils/calendar-date.js';

const stepIndices = Array.from({ length: 48 }, (_, index) => index);
const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0') + ':00');
export const timelineMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const slotTime = index => hours[Math.floor(index / 2)].slice(0, 2) + (index % 2 ? ':30' : ':00');

export function CalendarTimeline({ days, activeDate, eventsFor, canPick, onPick, onDayFocus, label = 'Lưới giờ', recurring, initiallyAt, selectedAt }) {
  const viewport = useRef(null);
  const [now, setNow] = useState(() => vietnamDateTime());
  useEffect(() => {
    if (recurring) return;
    const timer = window.setInterval(() => setNow(vietnamDateTime()), 30000);
    return () => window.clearInterval(timer);
  }, [recurring]);
  const initialHour = useRef(initiallyAt ? Math.max(0, Number(initiallyAt.slice(0, 2)) - 2) : 7);
  const [focusRow, setFocusRow] = useState(18);
  useEffect(() => {
    const firstHour = viewport.current?.querySelector(`[data-hour="${hours[initialHour.current]}"]`);
    if (firstHour) viewport.current.scrollTop = Math.max(0, firstHour.offsetTop - 10);
  }, []);
  function navigate(event, date, row) {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    const dayIndex = days.indexOf(date);
    const candidates = vertical ? stepIndices
      .filter(index => step > 0 ? index > row : index < row).sort((a, b) => step * (a - b))
      .map(index => [date, index])
      : days.filter((_, index) => step > 0 ? index > dayIndex : index < dayIndex)
        .sort((a, b) => step * (days.indexOf(a) - days.indexOf(b))).map(day => [day, row]);
    const found = candidates.find(([day, index]) => canPick(day, slotTime(index)));
    if (!found) return;
    const [day, index] = found;
    onDayFocus(day);
    setFocusRow(index);
    globalThis.requestAnimationFrame?.(() => {
      viewport.current?.querySelector(`[data-date="${day}"][data-index="${index}"]`)?.focus();
    });
  }
  const focusIndex = stepIndices.find(i => i >= focusRow && canPick?.(activeDate, slotTime(i)))
    ?? stepIndices.find(i => canPick?.(activeDate, slotTime(i)));
  return <div className="pwc-calendar-timeline" ref={viewport} role="group" aria-label={label}>
    <div className="pwc-calendar-timeline__grid">
      <div className="pwc-calendar-timeline__hours" aria-hidden="true">
        {hours.map(hour => <span key={hour} data-hour={hour}><time>{hour}</time></span>)}
      </div>
      {days.map(day => {
        const description = calendarDateLabel(day, recurring
          ? { weekday: 'long' } : { weekday: 'long', day: 'numeric', month: 'numeric' });
        return <div key={day} className="pwc-calendar-timeline__column" data-active={day === activeDate}>
          {!recurring && day === now.slice(0, 10) && <div className="pwc-calendar-now"
            style={{ top: timelineMinute(now.slice(11)) / 14.4 + '%' }} role="img" aria-label={'Bây giờ ' + now.slice(11)} />}
          {onPick && stepIndices.map(index => {
            const time = slotTime(index);
            const enabled = canPick(day, time);
            return <button type="button" key={time} data-pick-label={selectedAt !== undefined ? "+ Chọn" : "+"} data-date={day} data-index={index} disabled={!enabled}
              tabIndex={day === activeDate && index === focusIndex ? 0 : -1}
              aria-label={`${description}, ${time}`} aria-pressed={selectedAt ? selectedAt === `${day}T${time}` : undefined}
              onFocus={() => { onDayFocus(day); setFocusRow(index); }}
              onKeyDown={event => navigate(event, day, index)} onClick={() => onPick(day, time)} />;
          })}
          {(eventsFor?.(day) ?? []).map(({ key, start, end, label: name, detail, kind, onOpen }) => {
            const style = { '--slot-top': start / 14.4 + '%', '--slot-size': (end - start) / 14.4 + '%' };
            const className = 'pwc-calendar-timeline__event';
            return onOpen ? <button type="button" key={key} className={className} style={style} data-kind={kind}
              title={[name, detail].filter(Boolean).join(' · ')} onClick={onOpen}>{name}{detail && <small>{detail}</small>}</button>
              : <span key={key} className={className} style={style} data-short={end - start <= 20 || undefined} data-kind={kind} title={[name, detail].filter(Boolean).join(' · ')}>
                {name}{detail && <small>{detail}</small>}
              </span>;
          })}
        </div>;
      })}
    </div>
  </div>;
}
