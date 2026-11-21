import { useEffect, useRef, useState } from 'react';
import { recurringVisits } from '../../utils/recurring-visits.js';

const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const labelDate = day => day.split('-').reverse().join('/');

export function RecurringSchedule({ initial, minimum, replacing, onApply, onCancel }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    if (node.showModal) node.showModal();
    else node.setAttribute('open', '');
    return () => node.close?.();
  }, []);
  const [day, hour] = (initial || minimum).split('T');
  const [rule, setRule] = useState({ frequency: 'weekly', startDay: day, time: hour,
    weekdays: [new Date(day + 'T12:00Z').getUTCDay()], ending: 'count', count: 4, until: day });
  function changeStart(startDay) {
    const weekday = value => new Date(value + 'T12:00Z').getUTCDay();
    const followsStart = rule.weekdays.length === 1 && rule.weekdays[0] === weekday(rule.startDay);
    update({ startDay, ...(followsStart && startDay ? { weekdays: [weekday(startDay)] } : {}),
      ...(rule.until === rule.startDay ? { until: startDay } : {}) });
  }
  const update = patch => setRule(current => ({ ...current, ...patch }));
  const { visits, skipped, error } = recurringVisits(rule, minimum);
  return <dialog ref={dialog} className="booking-repeat" aria-labelledby="booking-repeat-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <header className="booking-repeat__header"><h2 id="booking-repeat-title">Thiết lập lịch lặp</h2>
      <button type="button" aria-label="Đóng thiết lập lịch lặp" onClick={onCancel}>×</button></header>
    <div className="booking-repeat__body"><div className="booking-repeat__settings">
      <fieldset className="booking-repeat__frequency"><legend>Tần suất</legend>
        {[['weekly','Hằng tuần'],['monthly','Hằng tháng']].map(([value, label]) =>
          <label key={value}><input type="radio" name="booking-frequency" checked={rule.frequency === value}
            onChange={() => update({ frequency: value })} />{label}</label>)}</fieldset>
      <div className="booking-fields">
      <label>Ngày bắt đầu<input type="date" min={minimum.slice(0,10)} value={rule.startDay} onChange={e => changeStart(e.target.value)} /></label>
      <label>Giờ chăm sóc<input type="time" value={rule.time} onChange={e => update({ time: e.target.value })} /></label>
    </div>
    {rule.frequency === 'weekly' && <fieldset className="booking-repeat__days"><legend>Lặp vào các thứ</legend>
      {[1,2,3,4,5,6,0].map(n => <label key={n}><input type="checkbox" checked={rule.weekdays.includes(n)}
        onChange={e => update({ weekdays: e.target.checked ? [...rule.weekdays,n] : rule.weekdays.filter(d => d !== n) })} />{days[n]}</label>)}
    </fieldset>}
    {rule.frequency === 'monthly' && <p>Lặp vào ngày {Number(rule.startDay.slice(-2)) || '…'} mỗi tháng. Tháng thiếu ngày này sẽ được bỏ qua.</p>}
    <div className="booking-fields"><label>Kết thúc<select value={rule.ending} onChange={e => update({ ending: e.target.value })}>
      <option value="count">Sau số buổi</option><option value="date">Đến ngày</option></select></label>
      {rule.ending === 'count' ? <label>Số buổi lặp<input type="number" min="1" max="60" value={rule.count} onChange={e => update({ count: e.target.value })} /></label>
        : <label>Ngày cuối<input type="date" min={rule.startDay} value={rule.until} onChange={e => update({ until: e.target.value })} /></label>}
    </div>
    </div><aside className="booking-repeat__agenda" aria-live="polite"><h3>Lịch dự kiến</h3>
    {error ? <p>{error}</p> : <><p>{visits.length} buổi · Giờ Việt Nam</p>
      <ol className="booking-repeat__preview">{visits.map(value => <li key={value}><span>{labelDate(value.slice(0,10))}</span><time>{rule.time}</time></li>)}</ol>
      {skipped.length > 0 && <p>Bỏ qua tháng {skipped.map(m => m.split('-').reverse().join('/')).join(', ')}.</p>}</>}</aside></div>
    <footer className="booking-repeat__footer">
      {replacing && <small>Áp dụng sẽ thay các buổi đang chọn.</small>}
      <div><button type="button" className="booking-repeat__cancel" onClick={onCancel}>Hủy</button>
      <button type="button" className="booking-repeat__apply" disabled={!!error} onClick={() => onApply(visits)}>Dùng lịch này</button></div>
    </footer>
  </dialog>;
}
