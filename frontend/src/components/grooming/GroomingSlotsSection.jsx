import { GroomingChip } from './GroomingChip.jsx';
import { dayChipLabel, windowDates } from '../../utils/grooming-booking.js';

// Step 3: a day of the seven-day window and a free time slot. A full slot is greyed out.
export function GroomingSlotsSection({ options, date, time, slots, hasPets, onDate, onTime, onRetry }) {
  return <section className="grooming-card" aria-labelledby="grooming-slots">
    <h2 id="grooming-slots">3. Chọn giờ hẹn</h2>
    <p>Chỉ hiện giờ có người chăm sóc biết tắm và cắt tỉa đang trong ca ở cửa hàng.</p>
    <div className="grooming-chips" role="radiogroup" aria-label="Ngày hẹn">
      {windowDates(options.window.firstDate, options.window.lastDate).map(value => <GroomingChip key={value} type="radio" name="grooming-date"
        checked={date === value} onChange={() => onDate(value)}>{dayChipLabel(value)}</GroomingChip>)}
    </div>
    {!hasPets && <p className="grooming-hint">Chọn thú cưng và dịch vụ để xem giờ hẹn.</p>}
    {hasPets && slots.status === 'loading' && <p role="status" className="grooming-hint">Đang tải giờ hẹn…</p>}
    {hasPets && slots.status === 'error' && <p role="alert" className="grooming-inline">Chưa tải được giờ hẹn. <button type="button" onClick={onRetry}>Thử lại</button></p>}
    {hasPets && slots.status === 'success' && !slots.items.length && <p role="status" className="grooming-hint">Không còn giờ hẹn nào trong ngày này. Hãy chọn ngày khác.</p>}
    {hasPets && slots.status === 'success' && slots.items.length > 0 && <div className="grooming-chips" role="radiogroup" aria-label="Giờ hẹn">
      {slots.items.map(slot => <GroomingChip key={slot.startAt} type="radio" name="grooming-time" checked={time === slot.startAt && slot.state === 'AVAILABLE'}
        disabled={slot.state !== 'AVAILABLE'} onChange={() => onTime(slot.startAt)}>{slot.time}{slot.state === 'AVAILABLE' ? '' : ' · đã kín'}</GroomingChip>)}
    </div>}
  </section>;
}
