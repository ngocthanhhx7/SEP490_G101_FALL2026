import { useState } from 'react';
import { timelineMinute } from './CalendarTimeline.jsx';
import { WeekCalendar } from './WeekCalendar.jsx';

export function BookingDateTime({ label, value, onChange, today, minimum, name, disabled, readOnly, compact = false, visits, activeVisit = 0, durationMinutes, markedDays }) {
  const [visible, setVisible] = useState(!compact);
  const [draftDay, setDraftDay] = useState('');
  const [savedDay = '', time = ''] = value.split('T');
  const day = draftDay || savedDay;
  const selectedEnd = time && durationMinutes > 0 ? timelineMinute(time) + durationMinutes : null;
  const endLabel = selectedEnd === null ? '' : '–' + [Math.floor(selectedEnd / 60) % 24, selectedEnd % 60]
    .map(part => String(part).padStart(2, '0')).join(':') + (selectedEnd >= 1440 ? ' (+1 ngày)' : '');
  function changeNative(event) {
    const value = event.target.value;
    if (value && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return;
    onChange(value);
    setDraftDay('');
  }
  const directField = <label className="pwc-booking-daytime__manual">{label}
    <input type="datetime-local" name={name} required={compact} readOnly={readOnly} disabled={disabled}
      value={value} min={compact && !readOnly ? minimum : undefined}
      onChange={changeNative} />
  </label>;
  return <div className="pwc-booking-daytime">
    {compact && !readOnly && <button type="button" className="pwc-button pwc-button-secondary" aria-expanded={visible}
      disabled={disabled} onClick={() => setVisible(open => !open)}>{visible ? 'Ẩn lịch tuần' : 'Mở lịch tuần'}</button>}
    {visible && !readOnly && <>
      <WeekCalendar value={day} today={today} min={minimum.slice(0, 10)} markedDays={markedDays} monthOverview={!compact}
        onChange={setDraftDay}
        legend={<div className="pwc-booking-legend" aria-label="Chú thích lịch">
          <span data-kind="open">Có thể chọn giờ</span><span data-kind="disabled">Không thể chọn</span>
          <span data-kind="selected">Buổi đang chỉnh</span>
          {visits?.length > 1 && <span data-kind="other">Buổi khác</span>}
        </div>}
        timeline={{
          label: 'Chọn giờ trên lịch', initiallyAt: time, selectedAt: value,
          canPick: (date, hour) => !disabled && `${date}T${hour}` >= minimum,
          onPick: (date, hour) => { onChange(`${date}T${hour}`); setDraftDay(''); },
          eventsFor: date => (visits ?? [value]).flatMap((visit, index) => {
            if (!visit) return [];
            const hour = visit.slice(11);
            const startMinute = timelineMinute(hour);
            const duration = durationMinutes > 0 ? durationMinutes : 0;
            const offset = (Date.parse(date + 'T00:00Z') - Date.parse(visit.slice(0, 10) + 'T00:00Z')) / 86400000;
            const start = startMinute - offset * 1440;
            const end = start + (duration || 30);
            if (start >= 1440 || end <= 0 || (!duration && offset !== 0)) return [];
            const finish = (startMinute + duration) % 1440;
            const until = [Math.floor(finish / 60), finish % 60].map(n => String(n).padStart(2, '0')).join(':');
            const range = duration ? hour + '–' + until + (startMinute + duration >= 1440 ? ' (+1 ngày)' : '') : hour;
            return [{ key: index, start: Math.max(0, start), end: Math.min(1440, end),
              label: range, detail: `Buổi ${index + 1}`, kind: index === activeVisit ? 'selected' : undefined }];
          })
        }} />
      <p className="pwc-calendar-time-caption">{savedDay && time
        ? `Đã chọn ${time}${endLabel} ngày ${savedDay.slice(8)}/${savedDay.slice(5, 7)}`
        : 'Chọn một ô giờ trên lịch.'}</p>
      {day && <label className="pwc-booking-daytime__manual">Chọn giờ khác trong ngày {day.slice(8)}/{day.slice(5, 7)}
        <input type="time" value={savedDay === day ? time : ''} disabled={disabled} min={day === minimum.slice(0, 10) ? minimum.slice(11) : undefined}
          onChange={event => {
            const hour = event.target.value;
            setDraftDay(day);
            onChange(hour ? `${day}T${hour}` : '');
          }} />
      </label>}
    </>}
    {compact || readOnly ? directField : <details className="pwc-booking-daytime__direct">
      <summary>Nhập ngày giờ trực tiếp</summary>
      {directField}
    </details>}
  </div>;
}
